import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getLessonUserIds, loadMemberContext } from "@/lib/lesson-members"
import { isAvailableAtSlot } from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"

/**
 * Thorough health check across every active timetable in the club. Answers
 * three questions and returns detailed per-issue breakdowns so the user can
 * verify at a glance that nothing is silently wrong:
 *
 *   1. Overlap conflicts — trainer / room / participant / member double-booked.
 *      Same logic as /api/club/timetables/conflicts; duplicated here so the
 *      health check is a single self-contained round trip.
 *   2. Availability violations — a lesson is scheduled outside the
 *      trainer's or participant's own availability window.
 *   3. Window violations — a lesson falls outside its timetable's
 *      day_start / day_end window.
 *
 * Every category deduplicates recurring occurrences: a weekly overlap shows
 * as one entry with `occurrences: 52`, not 52 entries.
 */

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
	occurrences: number
	recurrence: RecurrencePattern
	first_occurrence: string
	all_lesson_ids: string[]
}

type OverlapConflict = ConflictMeta &
	(
		| { kind: "trainer"; trainer_id: string; trainer_name: string; lessons: LessonRef[] }
		| { kind: "room"; room_id: string; room_name: string; lessons: LessonRef[] }
		| { kind: "student"; student_id: string; student_name: string; lessons: LessonRef[] }
		| { kind: "couple"; couple_id: string; couple_label: string; lessons: LessonRef[] }
		| { kind: "group"; group_id: string; group_name: string; lessons: LessonRef[] }
		| { kind: "member"; user_id: string; user_name: string; lessons: LessonRef[] }
	)

type AvailabilityIssue = ConflictMeta & {
	subject: "trainer" | "student" | "couple" | "group"
	subject_id: string
	subject_name: string
	timetable_id: string
	timetable_name: string
	lessons: LessonRef[]
}

type WindowIssue = ConflictMeta & {
	timetable_id: string
	timetable_name: string
	day_start: string
	day_end: string
	lessons: LessonRef[]
}

async function getClubAndAuth(
	supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
) {
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

	return { user, clubId: myProfile.club_id as string, isTrainer }
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

function weekdayOf(isoDate: string): number {
	const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number)
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}

function daysBetween(isoA: string, isoB: string): number {
	const [ya, ma, da] = isoA.slice(0, 10).split("-").map(Number)
	const [yb, mb, db] = isoB.slice(0, 10).split("-").map(Number)
	const ta = Date.UTC(ya ?? 1970, (ma ?? 1) - 1, da ?? 1)
	const tb = Date.UTC(yb ?? 1970, (mb ?? 1) - 1, db ?? 1)
	return Math.round((tb - ta) / 86400000)
}

function classifyGap(gap: number): RecurrencePattern {
	if (gap === 7) return "weekly"
	if (gap === 14) return "bi_weekly"
	if (gap >= 28 && gap <= 31) return "monthly"
	return "irregular"
}

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

/** Find each distinct overlap cluster inside a list of lessons sharing one entity. */
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

function dedupeRecurringClusters<K extends string>(
	entries: Array<{ id: string; cluster: LessonRow[] }>,
	kind: K,
): Array<{ id: string; cluster: LessonRow[]; meta: ConflictMeta }> {
	const groups = new Map<string, Array<{ id: string; cluster: LessonRow[] }>>()
	for (const entry of entries) {
		const canonical = [...entry.cluster].sort((a, b) => a.start_at.localeCompare(b.start_at))
		const weekday = weekdayOf(canonical[0]!.start_at)
		const shape = canonical.map(lessonFingerprint).sort().join(";")
		const sig = `${kind}::${entry.id}::${weekday}::${shape}`
		if (!groups.has(sig)) groups.set(sig, [])
		groups.get(sig)!.push({ id: entry.id, cluster: canonical })
	}

	const result: Array<{ id: string; cluster: LessonRow[]; meta: ConflictMeta }> = []
	for (const bucket of groups.values()) {
		bucket.sort((a, b) => a.cluster[0]!.start_at.localeCompare(b.cluster[0]!.start_at))
		const first = bucket[0]!
		let recurrence: RecurrencePattern = "once"
		if (bucket.length > 1) {
			const gap = daysBetween(bucket[0]!.cluster[0]!.start_at, bucket[1]!.cluster[0]!.start_at)
			recurrence = classifyGap(gap)
		}
		const allLessonIds = new Set<string>()
		for (const entry of bucket) for (const l of entry.cluster) allLessonIds.add(l.id)
		result.push({
			id: first.id,
			cluster: first.cluster,
			meta: {
				occurrences: bucket.length,
				recurrence,
				first_occurrence: first.cluster[0]!.start_at,
				all_lesson_ids: [...allLessonIds],
			},
		})
	}
	return result
}

/**
 * Dedupe recurring single-lesson issues (e.g. "Alice's group lesson every
 * Monday 18:00 is outside her availability"). Fingerprint collapses
 * different weeks of the exact same lesson into one entry.
 */
function dedupeSingleLessonIssues(
	entries: Array<{ key: string; lesson: LessonRow }>,
): Array<{ key: string; lesson: LessonRow; meta: ConflictMeta }> {
	const groups = new Map<string, Array<{ key: string; lesson: LessonRow }>>()
	for (const e of entries) {
		const weekday = weekdayOf(e.lesson.start_at)
		const fp = lessonFingerprint(e.lesson)
		const sig = `${e.key}::${weekday}::${fp}`
		if (!groups.has(sig)) groups.set(sig, [])
		groups.get(sig)!.push(e)
	}
	const result: Array<{ key: string; lesson: LessonRow; meta: ConflictMeta }> = []
	for (const bucket of groups.values()) {
		bucket.sort((a, b) => a.lesson.start_at.localeCompare(b.lesson.start_at))
		const first = bucket[0]!
		let recurrence: RecurrencePattern = "once"
		if (bucket.length > 1) {
			const gap = daysBetween(bucket[0]!.lesson.start_at, bucket[1]!.lesson.start_at)
			recurrence = classifyGap(gap)
		}
		const ids = bucket.map((b) => b.lesson.id)
		result.push({
			key: first.key,
			lesson: first.lesson,
			meta: {
				occurrences: bucket.length,
				recurrence,
				first_occurrence: first.lesson.start_at,
				all_lesson_ids: ids,
			},
		})
	}
	return result
}

function toMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number)
	return (h ?? 0) * 60 + (m ?? 0)
}

function parseAvailability(raw: unknown): AvailabilitySlot[] {
	return Array.isArray(raw) ? (raw as AvailabilitySlot[]) : []
}

export async function GET() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth
	if (!isTrainer) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

	// ------------------------------------------------------------------
	// Load active timetables + all lessons
	// ------------------------------------------------------------------
	const { data: activeTimetables } = await supabase
		.from("timetables")
		.select("id, name, day_start, day_end")
		.eq("club_id", clubId)
		.eq("is_active", true)
	const timetables = (activeTimetables ?? []) as Array<{
		id: string
		name: string
		day_start: string | null
		day_end: string | null
	}>
	const timetableIds = timetables.map((t) => t.id)
	const timetableById = new Map<string, { id: string; name: string; day_start: string | null; day_end: string | null }>()
	for (const t of timetables) timetableById.set(t.id, t)

	if (timetableIds.length === 0) {
		return NextResponse.json({
			summary: {
				total_issues: 0,
				overlaps: 0,
				availability_violations: 0,
				window_violations: 0,
				total_lessons_checked: 0,
				timetables_checked: 0,
			},
			overlaps: [],
			availability_violations: [],
			window_violations: [],
		})
	}

	const { data: lessonsRaw, error: lessonsError } = await supabase
		.from("lessons")
		.select("id, timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id")
		.in("timetable_id", timetableIds)
		.is("cancelled_at", null)
	if (lessonsError) return NextResponse.json({ error: lessonsError.message }, { status: 500 })
	const lessons = (lessonsRaw ?? []) as LessonRow[]

	const memberCtx = await loadMemberContext(supabase, clubId)

	// ------------------------------------------------------------------
	// Load profiles / couples / groups / rooms used by any lesson
	// ------------------------------------------------------------------
	const profileIds = new Set<string>()
	const coupleIds = new Set<string>()
	const groupIds = new Set<string>()
	const roomIds = new Set<string>()
	for (const l of lessons) {
		if (l.trainer_id) profileIds.add(l.trainer_id)
		if (l.student_id) profileIds.add(l.student_id)
		if (l.couple_id) coupleIds.add(l.couple_id)
		if (l.group_id) groupIds.add(l.group_id)
		if (l.room_id) roomIds.add(l.room_id)
	}

	const [profilesRes, couplesRes, groupsRes, roomsRes] = await Promise.all([
		profileIds.size > 0
			? supabase.from("profiles").select("id, full_name, availability").in("id", [...profileIds])
			: Promise.resolve({ data: [] as { id: string; full_name: string | null; availability: unknown }[] }),
		coupleIds.size > 0
			? supabase.from("couples").select("id, name, partner1_user_id, partner2_user_id, availability").in("id", [...coupleIds])
			: Promise.resolve({
					data: [] as {
						id: string
						name: string | null
						partner1_user_id: string | null
						partner2_user_id: string | null
						availability: unknown
					}[],
				}),
		groupIds.size > 0
			? supabase.from("groups").select("id, name, availability").in("id", [...groupIds])
			: Promise.resolve({ data: [] as { id: string; name: string | null; availability: unknown }[] }),
		roomIds.size > 0
			? supabase.from("rooms").select("id, name").in("id", [...roomIds])
			: Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
	])

	const profiles = profilesRes.data ?? []
	const profileNameById = new Map<string, string>()
	const profileAvailById = new Map<string, AvailabilitySlot[]>()
	for (const p of profiles) {
		profileNameById.set(p.id, (p.full_name ?? "").trim() || "Unknown")
		profileAvailById.set(p.id, parseAvailability(p.availability))
	}

	const couples = couplesRes.data ?? []
	const coupleAvailById = new Map<string, AvailabilitySlot[]>()
	const coupleLabelById = new Map<string, string>()
	for (const c of couples) {
		coupleAvailById.set(c.id, parseAvailability(c.availability))
		if (c.name) {
			coupleLabelById.set(c.id, c.name)
		} else {
			const a = c.partner1_user_id ? (profileNameById.get(c.partner1_user_id) ?? "Partner 1") : "Partner 1"
			const b = c.partner2_user_id ? (profileNameById.get(c.partner2_user_id) ?? "Partner 2") : "Partner 2"
			coupleLabelById.set(c.id, `${a} & ${b}`)
		}
	}

	const groups = groupsRes.data ?? []
	const groupNameById = new Map<string, string>()
	const groupAvailById = new Map<string, AvailabilitySlot[]>()
	for (const g of groups) {
		groupNameById.set(g.id, g.name ?? "Group")
		groupAvailById.set(g.id, parseAvailability(g.availability))
	}

	const roomNameById = new Map<string, string>()
	for (const r of roomsRes.data ?? []) roomNameById.set(r.id, r.name ?? "Room")

	// ==================================================================
	// 1. Overlap conflicts (same logic as /conflicts)
	// ==================================================================
	const byTrainer = new Map<string, LessonRow[]>()
	const byRoom = new Map<string, LessonRow[]>()
	const byStudent = new Map<string, LessonRow[]>()
	const byCouple = new Map<string, LessonRow[]>()
	const byGroup = new Map<string, LessonRow[]>()
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

	const trainerClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const roomClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const studentClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const coupleClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const groupClusters: Array<{ id: string; cluster: LessonRow[] }> = []
	const memberClusters: Array<{ id: string; cluster: LessonRow[] }> = []

	for (const [id, ls] of byTrainer)
		for (const cluster of findOverlapClusters(ls)) trainerClusters.push({ id, cluster })
	for (const [id, ls] of byRoom)
		for (const cluster of findOverlapClusters(ls)) roomClusters.push({ id, cluster })
	for (const [id, ls] of byStudent)
		for (const cluster of findOverlapClusters(ls)) studentClusters.push({ id, cluster })
	for (const [id, ls] of byCouple)
		for (const cluster of findOverlapClusters(ls)) coupleClusters.push({ id, cluster })
	for (const [id, ls] of byGroup)
		for (const cluster of findOverlapClusters(ls)) groupClusters.push({ id, cluster })

	for (const [uid, ls] of byMember) {
		for (const cluster of findOverlapClusters(ls)) {
			const firstStudent = cluster.every((l) => l.student_id === uid)
			if (firstStudent) continue
			const firstCouple = cluster[0]!.couple_id
			if (firstCouple != null && cluster.every((l) => l.couple_id === firstCouple)) continue
			const firstGroup = cluster[0]!.group_id
			if (firstGroup != null && cluster.every((l) => l.group_id === firstGroup)) continue
			memberClusters.push({ id: uid, cluster })
		}
	}

	const overlaps: OverlapConflict[] = []
	for (const { id, cluster, meta } of dedupeRecurringClusters(trainerClusters, "trainer")) {
		overlaps.push({
			kind: "trainer",
			trainer_id: id,
			trainer_name: profileNameById.get(id) ?? "Unknown trainer",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(roomClusters, "room")) {
		overlaps.push({
			kind: "room",
			room_id: id,
			room_name: roomNameById.get(id) ?? "Unknown room",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(studentClusters, "student")) {
		overlaps.push({
			kind: "student",
			student_id: id,
			student_name: profileNameById.get(id) ?? "Unknown student",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(coupleClusters, "couple")) {
		overlaps.push({
			kind: "couple",
			couple_id: id,
			couple_label: coupleLabelById.get(id) ?? "Couple",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(groupClusters, "group")) {
		overlaps.push({
			kind: "group",
			group_id: id,
			group_name: groupNameById.get(id) ?? "Group",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	for (const { id, cluster, meta } of dedupeRecurringClusters(memberClusters, "member")) {
		overlaps.push({
			kind: "member",
			user_id: id,
			user_name: profileNameById.get(id) ?? "Member",
			lessons: cluster.map(toLessonRef),
			...meta,
		})
	}
	overlaps.sort((a, b) => a.first_occurrence.localeCompare(b.first_occurrence))

	// ==================================================================
	// 2. Availability violations
	// ==================================================================
	type RawAvailIssue = {
		key: string // `${subject}::${subject_id}::${timetable_id}`
		subject: "trainer" | "student" | "couple" | "group"
		subject_id: string
		lesson: LessonRow
	}
	const rawAvail: RawAvailIssue[] = []

	for (const l of lessons) {
		const dateStr = l.start_at.slice(0, 10)
		const startTime = l.start_at.slice(11, 16)
		const endTime = l.end_at.slice(11, 16)

		if (l.trainer_id) {
			const av = profileAvailById.get(l.trainer_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				rawAvail.push({
					key: `trainer::${l.trainer_id}::${l.timetable_id}`,
					subject: "trainer",
					subject_id: l.trainer_id,
					lesson: l,
				})
			}
		}
		if (l.student_id) {
			const av = profileAvailById.get(l.student_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				rawAvail.push({
					key: `student::${l.student_id}::${l.timetable_id}`,
					subject: "student",
					subject_id: l.student_id,
					lesson: l,
				})
			}
		}
		if (l.couple_id) {
			const av = coupleAvailById.get(l.couple_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				rawAvail.push({
					key: `couple::${l.couple_id}::${l.timetable_id}`,
					subject: "couple",
					subject_id: l.couple_id,
					lesson: l,
				})
			}
		}
		if (l.group_id) {
			const av = groupAvailById.get(l.group_id) ?? []
			if (!isAvailableAtSlot(av, dateStr, startTime, endTime)) {
				rawAvail.push({
					key: `group::${l.group_id}::${l.timetable_id}`,
					subject: "group",
					subject_id: l.group_id,
					lesson: l,
				})
			}
		}
	}

	const availabilityIssues: AvailabilityIssue[] = []
	// Split into buckets per (key) so dedupe only collapses the same subject's
	// same lesson across different weeks.
	const availByKey = new Map<string, RawAvailIssue[]>()
	for (const r of rawAvail) {
		const arr = availByKey.get(r.key) ?? []
		arr.push(r)
		availByKey.set(r.key, arr)
	}
	for (const [, arr] of availByKey) {
		const deduped = dedupeSingleLessonIssues(arr.map((r) => ({ key: r.key, lesson: r.lesson })))
		for (const d of deduped) {
			const example = arr[0]!
			let subject_name = "Unknown"
			if (example.subject === "trainer" || example.subject === "student") {
				subject_name = profileNameById.get(example.subject_id) ?? subject_name
			} else if (example.subject === "couple") {
				subject_name = coupleLabelById.get(example.subject_id) ?? "Couple"
			} else if (example.subject === "group") {
				subject_name = groupNameById.get(example.subject_id) ?? "Group"
			}
			const ttName = timetableById.get(d.lesson.timetable_id)?.name ?? "Unknown timetable"
			availabilityIssues.push({
				subject: example.subject,
				subject_id: example.subject_id,
				subject_name,
				timetable_id: d.lesson.timetable_id,
				timetable_name: ttName,
				lessons: [toLessonRef(d.lesson)],
				...d.meta,
			})
		}
	}
	availabilityIssues.sort((a, b) => a.first_occurrence.localeCompare(b.first_occurrence))

	// ==================================================================
	// 3. Window violations (lesson outside timetable's day window)
	// ==================================================================
	type RawWindowIssue = { key: string; lesson: LessonRow }
	const rawWindow: RawWindowIssue[] = []
	for (const l of lessons) {
		const tt = timetableById.get(l.timetable_id)
		if (!tt) continue
		const dayStart = toMinutes(tt.day_start ?? "00:00")
		const dayEnd = toMinutes(tt.day_end ?? "23:59")
		const lessonStart = toMinutes(l.start_at.slice(11, 16))
		const lessonEnd = toMinutes(l.end_at.slice(11, 16))
		if (lessonStart < dayStart || lessonEnd > dayEnd) {
			rawWindow.push({ key: `window::${l.timetable_id}`, lesson: l })
		}
	}
	const windowIssues: WindowIssue[] = []
	const rawWindowByKey = new Map<string, RawWindowIssue[]>()
	for (const r of rawWindow) {
		const arr = rawWindowByKey.get(r.key) ?? []
		arr.push(r)
		rawWindowByKey.set(r.key, arr)
	}
	for (const [, arr] of rawWindowByKey) {
		const deduped = dedupeSingleLessonIssues(arr)
		for (const d of deduped) {
			const tt = timetableById.get(d.lesson.timetable_id)
			if (!tt) continue
			windowIssues.push({
				timetable_id: tt.id,
				timetable_name: tt.name,
				day_start: (tt.day_start ?? "00:00").slice(0, 5),
				day_end: (tt.day_end ?? "23:59").slice(0, 5),
				lessons: [toLessonRef(d.lesson)],
				...d.meta,
			})
		}
	}
	windowIssues.sort((a, b) => a.first_occurrence.localeCompare(b.first_occurrence))

	// ------------------------------------------------------------------
	// Build response
	// ------------------------------------------------------------------
	const totalIssues = overlaps.length + availabilityIssues.length + windowIssues.length
	return NextResponse.json({
		summary: {
			total_issues: totalIssues,
			overlaps: overlaps.length,
			availability_violations: availabilityIssues.length,
			window_violations: windowIssues.length,
			total_lessons_checked: lessons.length,
			timetables_checked: timetables.length,
		},
		overlaps,
		availability_violations: availabilityIssues,
		window_violations: windowIssues,
	})
}
