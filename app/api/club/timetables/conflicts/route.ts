import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getLessonUserIds, loadMemberContext } from "@/lib/lesson-members"
import { isAvailableAtSlot } from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"

type LessonRow = {
	id: string
	timetable_id: string
	lesson_type: "individual" | "couple" | "group"
	start_at: string
	end_at: string
	room_id: string | null
	trainer_id: string | null
	student_id: string | null
	couple_id: string | null
	group_id: string | null
}

type LessonRef = {
	lesson_id: string
	timetable_id: string
	start_at: string
	end_at: string
	lesson_type: "individual" | "couple" | "group"
}

type RecurrencePattern = "once" | "weekly" | "bi_weekly" | "monthly" | "irregular"

type ConflictMeta = {
	occurrences: number // total number of weeks this exact conflict recurs
	recurrence: RecurrencePattern
	first_occurrence: string // ISO date of the first occurrence
	// Every lesson_id across every deduped occurrence. `lessons` only carries
	// the canonical (first) occurrence's lessons, but the client needs the
	// full set so it can highlight the pattern regardless of which week is
	// being viewed.
	all_lesson_ids: string[]
}

type Conflict = ConflictMeta &
	(
		| { kind: "trainer"; trainer_id: string; trainer_name: string; lessons: LessonRef[] }
		| { kind: "room"; room_id: string; room_name: string; lessons: LessonRef[] }
		| { kind: "student"; student_id: string; student_name: string; lessons: LessonRef[] }
		| { kind: "couple"; couple_id: string; couple_label: string; lessons: LessonRef[] }
		| { kind: "group"; group_id: string; group_name: string; lessons: LessonRef[] }
		// "member" = a specific person is double-booked across different kinds of
		// lessons. E.g. Alice has an individual lesson and a group lesson that
		// overlap, or Alice's couple lesson overlaps with her group lesson.
		// Same-kind overlaps are already reported under student/couple/group.
		| { kind: "member"; user_id: string; user_name: string; lessons: LessonRef[] }
		// "availability" = a lesson is scheduled at a time when the trainer or
		// participant is NOT available. Each entry targets one subject (the
		// specific person / couple / group whose availability is being
		// violated) so the client can tell you who is blocking.
		| {
				kind: "availability"
				subject: "trainer" | "student" | "couple" | "group"
				subject_id: string
				subject_name: string
				timetable_id: string
				timetable_name: string
				lessons: LessonRef[]
		  }
		// "window" = a lesson is scheduled outside the timetable's configured
		// day_start / day_end window. Not a people conflict, but still a
		// scheduling error the trainer should see alongside real conflicts.
		| {
				kind: "window"
				timetable_id: string
				timetable_name: string
				day_start: string
				day_end: string
				lessons: LessonRef[]
		  }
	)

async function getClubAndAuth(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>) {
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()
	if (userError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

	const { data: myProfile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()
	if (!myProfile?.club_id) return { error: NextResponse.json({ error: "No club" }, { status: 404 }) }

	const { data: members } = await supabase
		.from("club_members")
		.select("user_id, role")
		.eq("club_id", myProfile.club_id)
	const isTrainer = (members ?? []).some((m) => m.user_id === user.id && m.role === "trainer")

	return { user, clubId: myProfile.club_id, isTrainer }
}

function toLessonRef(l: LessonRow): LessonRef {
	return {
		lesson_id: l.id,
		timetable_id: l.timetable_id,
		start_at: l.start_at,
		end_at: l.end_at,
		lesson_type: l.lesson_type,
	}
}

/**
 * Fingerprint of a single lesson used to detect "same shape" across recurrences.
 * We intentionally exclude `id`, `start_at`, `end_at` (keeping only time-of-day),
 * so two lessons that differ only in which week they fall on collapse to the same
 * fingerprint. Swapping trainer/room/participant changes the fingerprint, which
 * means the user will see a new conflict entry.
 */
function lessonFingerprint(l: LessonRow): string {
	const timeRange = `${l.start_at.slice(11, 16)}-${l.end_at.slice(11, 16)}`
	return [
		l.timetable_id,
		l.lesson_type,
		l.trainer_id ?? "",
		l.room_id ?? "",
		l.student_id ?? "",
		l.couple_id ?? "",
		l.group_id ?? "",
		timeRange,
	].join("|")
}

function weekdayOf(isoDate: string): number {
	const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number)
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function daysBetween(isoA: string, isoB: string): number {
	const [ya, ma, da] = isoA.slice(0, 10).split("-").map(Number)
	const [yb, mb, db] = isoB.slice(0, 10).split("-").map(Number)
	const ta = Date.UTC(ya, ma - 1, da)
	const tb = Date.UTC(yb, mb - 1, db)
	return Math.round((tb - ta) / 86400000)
}

function classifyGap(gap: number): RecurrencePattern {
	if (gap === 7) return "weekly"
	if (gap === 14) return "bi_weekly"
	if (gap >= 28 && gap <= 31) return "monthly"
	return "irregular"
}

/**
 * Given many clusters for the same entity (e.g. all trainer clusters for trainer X),
 * collapse clusters that are just the same pattern repeating on a different week.
 * Returns an array of canonical clusters, each tagged with its occurrence count
 * and detected recurrence cadence.
 */
function dedupeRecurringClusters(
	entries: Array<{ id: string; cluster: LessonRow[] }>,
	kind: Conflict["kind"],
): Array<{ id: string; cluster: LessonRow[]; meta: ConflictMeta }> {
	const groups = new Map<string, Array<{ id: string; cluster: LessonRow[] }>>()
	for (const entry of entries) {
		const canonical = [...entry.cluster].sort((a, b) => a.start_at.localeCompare(b.start_at))
		const weekday = weekdayOf(canonical[0].start_at)
		const shape = canonical.map(lessonFingerprint).sort().join(";")
		const sig = `${kind}::${entry.id}::${weekday}::${shape}`
		if (!groups.has(sig)) groups.set(sig, [])
		groups.get(sig)!.push({ id: entry.id, cluster: canonical })
	}

	const result: Array<{ id: string; cluster: LessonRow[]; meta: ConflictMeta }> = []
	for (const bucket of groups.values()) {
		bucket.sort((a, b) => a.cluster[0].start_at.localeCompare(b.cluster[0].start_at))
		const first = bucket[0]
		let recurrence: RecurrencePattern = "once"
		if (bucket.length > 1) {
			const gap = daysBetween(bucket[0].cluster[0].start_at, bucket[1].cluster[0].start_at)
			recurrence = classifyGap(gap)
		}
		const allLessonIds = new Set<string>()
		for (const entry of bucket) {
			for (const l of entry.cluster) allLessonIds.add(l.id)
		}
		result.push({
			id: first.id,
			cluster: first.cluster,
			meta: {
				occurrences: bucket.length,
				recurrence,
				first_occurrence: first.cluster[0].start_at,
				all_lesson_ids: [...allLessonIds],
			},
		})
	}
	return result
}

/**
 * Dedupe single-lesson issues (availability, day-window) by (subject_id + lesson shape).
 * Availability / window violations are per-lesson, not per-overlap-cluster, so this
 * variant groups lessons that are just the same pattern recurring on a different week
 * the same way `dedupeRecurringClusters` collapses overlap clusters.
 */
function dedupeSingleLessonIssues(
	entries: Array<{ id: string; lesson: LessonRow }>,
): Array<{ id: string; lesson: LessonRow; meta: ConflictMeta }> {
	const groups = new Map<string, Array<{ id: string; lesson: LessonRow }>>()
	for (const entry of entries) {
		const weekday = weekdayOf(entry.lesson.start_at)
		const shape = lessonFingerprint(entry.lesson)
		const sig = `${entry.id}::${weekday}::${shape}`
		if (!groups.has(sig)) groups.set(sig, [])
		groups.get(sig)!.push(entry)
	}
	const result: Array<{ id: string; lesson: LessonRow; meta: ConflictMeta }> = []
	for (const bucket of groups.values()) {
		bucket.sort((a, b) => a.lesson.start_at.localeCompare(b.lesson.start_at))
		const first = bucket[0]!
		let recurrence: RecurrencePattern = "once"
		if (bucket.length > 1) {
			const gap = daysBetween(bucket[0]!.lesson.start_at, bucket[1]!.lesson.start_at)
			recurrence = classifyGap(gap)
		}
		result.push({
			id: first.id,
			lesson: first.lesson,
			meta: {
				occurrences: bucket.length,
				recurrence,
				first_occurrence: first.lesson.start_at,
				all_lesson_ids: bucket.map((b) => b.lesson.id),
			},
		})
	}
	return result
}

function parseAvailability(raw: unknown): AvailabilitySlot[] {
	return Array.isArray(raw) ? (raw as AvailabilitySlot[]) : []
}

function toMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number)
	return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * For a list of lessons already sharing one entity (e.g. same trainer), collect each
 * distinct overlap cluster. A cluster is a set of lessons where at least one pair overlaps.
 */
function findOverlapClusters(lessons: LessonRow[]): LessonRow[][] {
	if (lessons.length < 2) return []
	const sorted = [...lessons].sort((a, b) => a.start_at.localeCompare(b.start_at))
	const clusters: LessonRow[][] = []
	let cur: LessonRow[] = []
	let curEnd = ""
	for (const l of sorted) {
		if (cur.length === 0) {
			cur = [l]
			curEnd = l.end_at
			continue
		}
		if (new Date(l.start_at).getTime() < new Date(curEnd).getTime()) {
			cur.push(l)
			if (new Date(l.end_at).getTime() > new Date(curEnd).getTime()) curEnd = l.end_at
		} else {
			if (cur.length > 1) clusters.push(cur)
			cur = [l]
			curEnd = l.end_at
		}
	}
	if (cur.length > 1) clusters.push(cur)
	return clusters
}

export async function GET() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth
	if (!isTrainer) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

	// Active timetables for this club
	const { data: activeTimetables } = await supabase
		.from("timetables")
		.select("id, name, day_start, day_end")
		.eq("club_id", clubId)
		.eq("is_active", true)
	const timetableIds = (activeTimetables ?? []).map((t) => t.id)
	if (timetableIds.length === 0) return NextResponse.json({ conflicts: [] })
	const timetableById = new Map<string, { id: string; name: string | null; day_start: string | null; day_end: string | null }>()
	for (const t of activeTimetables ?? []) {
		timetableById.set(t.id, t)
	}

	const { data: lessonsRaw, error: lessonsError } = await supabase
		.from("lessons")
		.select(
			"id, timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id"
		)
		.in("timetable_id", timetableIds)
		.is("cancelled_at", null)
	if (lessonsError) return NextResponse.json({ error: lessonsError.message }, { status: 500 })
	const lessons = (lessonsRaw ?? []) as LessonRow[]

	// Expand each lesson into the set of user IDs it occupies so we can
	// detect cross-kind conflicts (e.g. solo student vs. their group lesson).
	const memberCtx = await loadMemberContext(supabase, clubId)

	// Bucket by each entity type
	const byTrainer = new Map<string, LessonRow[]>()
	const byRoom = new Map<string, LessonRow[]>()
	const byStudent = new Map<string, LessonRow[]>()
	const byCouple = new Map<string, LessonRow[]>()
	const byGroup = new Map<string, LessonRow[]>()
	// byMember: user_id -> every lesson in which that user participates, via
	// any relationship (as a solo student, as a couple partner, or as a group
	// member). Collisions here catch the cross-kind conflicts.
	const byMember = new Map<string, LessonRow[]>()

	for (const l of lessons) {
		if (l.trainer_id) {
			if (!byTrainer.has(l.trainer_id)) byTrainer.set(l.trainer_id, [])
			byTrainer.get(l.trainer_id)!.push(l)
		}
		if (l.room_id) {
			if (!byRoom.has(l.room_id)) byRoom.set(l.room_id, [])
			byRoom.get(l.room_id)!.push(l)
		}
		if (l.student_id) {
			if (!byStudent.has(l.student_id)) byStudent.set(l.student_id, [])
			byStudent.get(l.student_id)!.push(l)
		}
		if (l.couple_id) {
			if (!byCouple.has(l.couple_id)) byCouple.set(l.couple_id, [])
			byCouple.get(l.couple_id)!.push(l)
		}
		if (l.group_id) {
			if (!byGroup.has(l.group_id)) byGroup.set(l.group_id, [])
			byGroup.get(l.group_id)!.push(l)
		}

		for (const uid of getLessonUserIds(l, memberCtx)) {
			if (!byMember.has(uid)) byMember.set(uid, [])
			byMember.get(uid)!.push(l)
		}
	}

	// Collect ids that actually have conflicts, then resolve names in a single query per type
	const conflictingTrainerIds = new Set<string>()
	const conflictingRoomIds = new Set<string>()
	const conflictingStudentIds = new Set<string>()
	const conflictingCoupleIds = new Set<string>()
	const conflictingGroupIds = new Set<string>()
	const conflictingMemberIds = new Set<string>()

	const trainerClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const roomClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const studentClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const coupleClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const groupClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const memberClusters: Array<{ id: string; cluster: LessonRow[] }> = []

	for (const [id, ls] of byTrainer) {
		for (const cluster of findOverlapClusters(ls)) {
			trainerClusters.push({ id, cluster })
			conflictingTrainerIds.add(id)
		}
	}
	for (const [id, ls] of byRoom) {
		for (const cluster of findOverlapClusters(ls)) {
			roomClusters.push({ id, cluster })
			conflictingRoomIds.add(id)
		}
	}
	for (const [id, ls] of byStudent) {
		for (const cluster of findOverlapClusters(ls)) {
			studentClusters.push({ id, cluster })
			conflictingStudentIds.add(id)
		}
	}
	for (const [id, ls] of byCouple) {
		for (const cluster of findOverlapClusters(ls)) {
			coupleClusters.push({ id, cluster })
			conflictingCoupleIds.add(id)
		}
	}
	for (const [id, ls] of byGroup) {
		for (const cluster of findOverlapClusters(ls)) {
			groupClusters.push({ id, cluster })
			conflictingGroupIds.add(id)
		}
	}

	// Member clusters, deduped vs. student/couple/group. If every lesson in
	// the cluster participates via the SAME relationship for this user (all
	// as `student_id = uid`, or all via the same couple, or all via the same
	// group), the conflict is already reported under that kind — skip.
	for (const [uid, ls] of byMember) {
		for (const cluster of findOverlapClusters(ls)) {
			const firstStudent = cluster.every((l) => l.student_id === uid)
			if (firstStudent) continue
			const firstCouple = cluster[0].couple_id
			if (firstCouple != null && cluster.every((l) => l.couple_id === firstCouple)) continue
			const firstGroup = cluster[0].group_id
			if (firstGroup != null && cluster.every((l) => l.group_id === firstGroup)) continue
			memberClusters.push({ id: uid, cluster })
			conflictingMemberIds.add(uid)
		}
	}

	const profileIds = [...new Set([...conflictingTrainerIds, ...conflictingStudentIds, ...conflictingMemberIds])]
	const [profilesRes, roomsRes, couplesRes, groupsRes] = await Promise.all([
		profileIds.length > 0
			? supabase.from("profiles").select("id, full_name").in("id", profileIds)
			: Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
		conflictingRoomIds.size > 0
			? supabase.from("rooms").select("id, name").in("id", [...conflictingRoomIds])
			: Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
		conflictingCoupleIds.size > 0
			? supabase
				.from("couples")
				.select("id, name, partner1_user_id, partner2_user_id")
				.in("id", [...conflictingCoupleIds])
			: Promise.resolve({
				data: [] as {
					id: string
					name: string | null
					partner1_user_id: string | null
					partner2_user_id: string | null
				}[],
			}),
		conflictingGroupIds.size > 0
			? supabase.from("groups").select("id, name").in("id", [...conflictingGroupIds])
			: Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
	])

	const profiles = profilesRes.data ?? []
	const profileNameById = new Map<string, string>()
	for (const p of profiles) {
		const n = (p.full_name ?? "").trim() || "Unknown"
		profileNameById.set(p.id, n)
	}

	const coupleRows = (couplesRes.data ?? []) as {
		id: string
		name: string | null
		partner1_user_id: string | null
		partner2_user_id: string | null
	}[]
	const coupleMemberIds = new Set<string>()
	for (const c of coupleRows) {
		if (c.partner1_user_id) coupleMemberIds.add(c.partner1_user_id)
		if (c.partner2_user_id) coupleMemberIds.add(c.partner2_user_id)
	}
	const missing = [...coupleMemberIds].filter((id) => !profileNameById.has(id))
	if (missing.length > 0) {
		const { data: extra } = await supabase
			.from("profiles")
			.select("id, full_name")
			.in("id", missing)
		for (const p of extra ?? []) {
			const n = (p.full_name ?? "").trim() || "Unknown"
			profileNameById.set(p.id, n)
		}
	}
	const coupleLabelById = new Map<string, string>()
	for (const c of coupleRows) {
		if (c.name) {
			coupleLabelById.set(c.id, c.name)
			continue
		}
		const a = c.partner1_user_id ? (profileNameById.get(c.partner1_user_id) ?? "Partner 1") : "Partner 1"
		const b = c.partner2_user_id ? (profileNameById.get(c.partner2_user_id) ?? "Partner 2") : "Partner 2"
		coupleLabelById.set(c.id, `${a} & ${b}`)
	}

	const roomNameById = new Map<string, string>()
	for (const r of roomsRes.data ?? []) {
		roomNameById.set(r.id, r.name ?? "Room")
	}
	const groupNameById = new Map<string, string>()
	for (const g of groupsRes.data ?? []) {
		groupNameById.set(g.id, g.name ?? "Group")
	}

	const conflicts: Conflict[] = []
	for (const { id, cluster, meta } of dedupeRecurringClusters(trainerClusters, "trainer")) {
		conflicts.push({
			kind: "trainer",
			trainer_id: id,
			trainer_name: profileNameById.get(id) ?? "Unknown trainer",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(roomClusters, "room")) {
		conflicts.push({
			kind: "room",
			room_id: id,
			room_name: roomNameById.get(id) ?? "Unknown room",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(studentClusters, "student")) {
		conflicts.push({
			kind: "student",
			student_id: id,
			student_name: profileNameById.get(id) ?? "Unknown student",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(coupleClusters, "couple")) {
		conflicts.push({
			kind: "couple",
			couple_id: id,
			couple_label: coupleLabelById.get(id) ?? "Couple",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(groupClusters, "group")) {
		conflicts.push({
			kind: "group",
			group_id: id,
			group_name: groupNameById.get(id) ?? "Group",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(memberClusters, "member")) {
		conflicts.push({
			kind: "member",
			user_id: id,
			user_name: profileNameById.get(id) ?? "Member",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}

	// ---------------------------------------------------------------------
	// Availability violations: a lesson scheduled outside trainer / student /
	// couple / group availability is a conflict. We surface one canonical
	// entry per (subject, recurring pattern) so a weekly violation collapses
	// into a single row.
	// ---------------------------------------------------------------------
	const trainerIdsOnLessons = new Set<string>()
	const studentIdsOnLessons = new Set<string>()
	const coupleIdsOnLessons = new Set<string>()
	const groupIdsOnLessons = new Set<string>()
	for (const l of lessons) {
		if (l.trainer_id) trainerIdsOnLessons.add(l.trainer_id)
		if (l.student_id) studentIdsOnLessons.add(l.student_id)
		if (l.couple_id) coupleIdsOnLessons.add(l.couple_id)
		if (l.group_id) groupIdsOnLessons.add(l.group_id)
	}

	const profileAvailIds = [...new Set([...trainerIdsOnLessons, ...studentIdsOnLessons])]
	const coupleAvailIds = [...coupleIdsOnLessons]
	const groupAvailIds = [...groupIdsOnLessons]

	const [availProfilesRes, availCouplesRes, availGroupsRes] = await Promise.all([
		profileAvailIds.length > 0
			? supabase.from("profiles").select("id, full_name, availability").in("id", profileAvailIds)
			: Promise.resolve({ data: [] as { id: string; full_name: string | null; availability: unknown }[] }),
		coupleAvailIds.length > 0
			? supabase.from("couples").select("id, name, availability").in("id", coupleAvailIds)
			: Promise.resolve({ data: [] as { id: string; name: string | null; availability: unknown }[] }),
		groupAvailIds.length > 0
			? supabase.from("groups").select("id, name, availability").in("id", groupAvailIds)
			: Promise.resolve({ data: [] as { id: string; name: string | null; availability: unknown }[] }),
	])

	const profileAvailById = new Map<string, AvailabilitySlot[]>()
	const profileLabelById = new Map<string, string>()
	for (const p of availProfilesRes.data ?? []) {
		profileAvailById.set(p.id, parseAvailability((p as { availability: unknown }).availability))
		const n = ((p as { full_name: string | null }).full_name ?? "").trim() || "Unknown"
		profileLabelById.set(p.id, n)
		if (!profileNameById.has(p.id)) profileNameById.set(p.id, n)
	}
	const coupleAvailById = new Map<string, AvailabilitySlot[]>()
	const coupleLabelByIdAll = new Map<string, string>()
	for (const c of availCouplesRes.data ?? []) {
		coupleAvailById.set(c.id, parseAvailability((c as { availability: unknown }).availability))
		coupleLabelByIdAll.set(c.id, ((c as { name: string | null }).name ?? "").trim() || coupleLabelById.get(c.id) || "Couple")
	}
	const groupAvailById = new Map<string, AvailabilitySlot[]>()
	const groupLabelByIdAll = new Map<string, string>()
	for (const g of availGroupsRes.data ?? []) {
		groupAvailById.set(g.id, parseAvailability((g as { availability: unknown }).availability))
		groupLabelByIdAll.set(g.id, ((g as { name: string | null }).name ?? "").trim() || "Group")
	}

	// Collect raw violations (one entry per lesson per blocking subject) so
	// the same lesson can legitimately produce e.g. "Trainer X outside avail"
	// AND "Student Y outside avail" if both subjects are unavailable.
	const trainerAvailViolations: Array<{ id: string; lesson: LessonRow }> = []
	const studentAvailViolations: Array<{ id: string; lesson: LessonRow }> = []
	const coupleAvailViolations: Array<{ id: string; lesson: LessonRow }> = []
	const groupAvailViolations: Array<{ id: string; lesson: LessonRow }> = []
	const windowViolations: Array<{ id: string; lesson: LessonRow }> = []

	for (const l of lessons) {
		const dateStr = l.start_at.slice(0, 10)
		const startTime = l.start_at.slice(11, 16)
		const endTime = l.end_at.slice(11, 16)

		if (l.trainer_id) {
			const av = profileAvailById.get(l.trainer_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				trainerAvailViolations.push({ id: l.trainer_id, lesson: l })
			}
		}
		if (l.student_id) {
			const av = profileAvailById.get(l.student_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				studentAvailViolations.push({ id: l.student_id, lesson: l })
			}
		}
		if (l.couple_id) {
			const av = coupleAvailById.get(l.couple_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				coupleAvailViolations.push({ id: l.couple_id, lesson: l })
			}
		}
		if (l.group_id) {
			const av = groupAvailById.get(l.group_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				groupAvailViolations.push({ id: l.group_id, lesson: l })
			}
		}

		const tt = timetableById.get(l.timetable_id)
		if (tt) {
			const dayStart = tt.day_start ?? null
			const dayEnd = tt.day_end ?? null
			if (dayStart && dayEnd) {
				const ls = toMinutes(startTime)
				const le = toMinutes(endTime)
				const ds = toMinutes(dayStart.slice(0, 5))
				const de = toMinutes(dayEnd.slice(0, 5))
				if (ls < ds || le > de) {
					windowViolations.push({ id: l.timetable_id, lesson: l })
				}
			}
		}
	}

	for (const { id, lesson, meta } of dedupeSingleLessonIssues(trainerAvailViolations)) {
		const tt = timetableById.get(lesson.timetable_id)
		conflicts.push({
			kind: "availability",
			subject: "trainer",
			subject_id: id,
			subject_name: profileLabelById.get(id) ?? profileNameById.get(id) ?? "Trainer",
			timetable_id: lesson.timetable_id,
			timetable_name: tt?.name ?? "Timetable",
			lessons: [toLessonRef(lesson)],
			...meta,
		})
	}
	for (const { id, lesson, meta } of dedupeSingleLessonIssues(studentAvailViolations)) {
		const tt = timetableById.get(lesson.timetable_id)
		conflicts.push({
			kind: "availability",
			subject: "student",
			subject_id: id,
			subject_name: profileLabelById.get(id) ?? profileNameById.get(id) ?? "Student",
			timetable_id: lesson.timetable_id,
			timetable_name: tt?.name ?? "Timetable",
			lessons: [toLessonRef(lesson)],
			...meta,
		})
	}
	for (const { id, lesson, meta } of dedupeSingleLessonIssues(coupleAvailViolations)) {
		const tt = timetableById.get(lesson.timetable_id)
		conflicts.push({
			kind: "availability",
			subject: "couple",
			subject_id: id,
			subject_name: coupleLabelByIdAll.get(id) ?? coupleLabelById.get(id) ?? "Couple",
			timetable_id: lesson.timetable_id,
			timetable_name: tt?.name ?? "Timetable",
			lessons: [toLessonRef(lesson)],
			...meta,
		})
	}
	for (const { id, lesson, meta } of dedupeSingleLessonIssues(groupAvailViolations)) {
		const tt = timetableById.get(lesson.timetable_id)
		conflicts.push({
			kind: "availability",
			subject: "group",
			subject_id: id,
			subject_name: groupLabelByIdAll.get(id) ?? groupNameById.get(id) ?? "Group",
			timetable_id: lesson.timetable_id,
			timetable_name: tt?.name ?? "Timetable",
			lessons: [toLessonRef(lesson)],
			...meta,
		})
	}
	for (const { id, lesson, meta } of dedupeSingleLessonIssues(windowViolations)) {
		const tt = timetableById.get(id)
		conflicts.push({
			kind: "window",
			timetable_id: id,
			timetable_name: tt?.name ?? "Timetable",
			day_start: tt?.day_start ?? "",
			day_end: tt?.day_end ?? "",
			lessons: [toLessonRef(lesson)],
			...meta,
		})
	}

	// Sort by the first occurrence of each conflict for stable UI
	conflicts.sort((a, b) => a.first_occurrence.localeCompare(b.first_occurrence))

	return NextResponse.json({ conflicts })
}
