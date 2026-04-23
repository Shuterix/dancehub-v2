import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import {
	solveTimetable,
	allowedDaysForDistribution,
	type SolverTarget,
	type SolverGroupTarget,
	type DistributionPreference,
	type ExistingLesson,
} from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"
import { loadMemberContext, getLessonUserIds } from "@/lib/lesson-members"

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

/** Next Monday from date (or today if today is Monday), YYYY-MM-DD */
function nextMonday(from: Date): string {
	const d = new Date(from)
	const day = d.getDay()
	const add = day === 0 ? 1 : day === 1 ? 0 : 8 - day
	d.setDate(d.getDate() + add)
	return d.toISOString().slice(0, 10)
}

/** Add days to an ISO datetime string; keeps time part unchanged (YYYY-MM-DDTHH:mm:ss). */
function addDays(iso: string, days: number): string {
	const d = new Date(iso)
	d.setDate(d.getDate() + days)
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	const time = iso.slice(11, 19)
	return `${y}-${m}-${day}${time ? `T${time}` : ""}`
}

/** Add one month to an ISO datetime (same day of month). */
function addMonth(iso: string): string {
	const [datePart, timePart] = iso.split("T")
	const [y, month, day] = datePart.split("-").map(Number)
	const d = new Date(y, (month ?? 1) - 1, day ?? 1)
	d.setMonth(d.getMonth() + 1)
	const ny = d.getFullYear()
	const nm = String(d.getMonth() + 1).padStart(2, "0")
	const nd = String(d.getDate()).padStart(2, "0")
	return `${ny}-${nm}-${nd}${timePart ? `T${timePart}` : ""}`
}

/** Replicate lessons for recurring timetables: weekly = +7 days per repeat, bi_weekly = +14, monthly = +1 month. */
function replicateLessons(
	lessons: Array<{
		timetable_id: string
		lesson_type: string
		start_at: string
		end_at: string
		room_id: string | null
		trainer_id: string | null
		student_id: string | null
		couple_id: string | null
		group_id?: string | null
		group_lesson_type_id?: string | null
		is_static: boolean
	}>,
	recurrence: string,
	validUntil: string | null,
	weekStartMonday: string
): typeof lessons {
	const maxWeeks = 52
	const endDate = validUntil
		? new Date(validUntil + "T23:59:59")
		: new Date(new Date(weekStartMonday + "T12:00:00").getTime() + maxWeeks * 7 * 24 * 60 * 60 * 1000)
	const weekStart = new Date(weekStartMonday + "T12:00:00")
	const replicated: typeof lessons = []

	if (recurrence === "weekly" || recurrence === "weekends_only") {
		for (let w = 1; w < maxWeeks; w++) {
			const repeatStart = new Date(weekStart)
			repeatStart.setDate(repeatStart.getDate() + w * 7)
			if (repeatStart > endDate) break
			for (const l of lessons) {
				replicated.push({
					...l,
					start_at: addDays(l.start_at, w * 7),
					end_at: addDays(l.end_at, w * 7),
				})
			}
		}
	} else if (recurrence === "bi_weekly") {
		for (let w = 2; w < maxWeeks; w += 2) {
			const repeatStart = new Date(weekStart)
			repeatStart.setDate(repeatStart.getDate() + w * 7)
			if (repeatStart > endDate) break
			for (const l of lessons) {
				replicated.push({
					...l,
					start_at: addDays(l.start_at, w * 7),
					end_at: addDays(l.end_at, w * 7),
				})
			}
		}
	} else if (recurrence === "monthly") {
		for (let m = 1; m < 12; m++) {
			const repeatStart = new Date(weekStart)
			repeatStart.setMonth(repeatStart.getMonth() + m)
			if (repeatStart > endDate) break
			for (const l of lessons) {
				let start = l.start_at
				let end = l.end_at
				for (let i = 0; i < m; i++) {
					start = addMonth(start)
					end = addMonth(end)
				}
				replicated.push({ ...l, start_at: start, end_at: end })
			}
		}
	}
	// fixed_period: no replication (one-off or manual)
	return replicated
}

function parseDate(s: unknown): string | null {
	if (typeof s !== "string") return null
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
	return null
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: timetableId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id, day_start, day_end, recurrence, valid_until")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) {
		return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
	}

	const DISTRIBUTION_VALUES = ["first_half", "second_half", "same"] as const
	type BodyGroupTarget = { group_id: string; group_lesson_type_id: string; desired_lessons_count: number; priority?: string; preferred_trainer_id?: string | null }
	let body: { week_start?: string; distribution?: string; group_targets?: BodyGroupTarget[] } = {}
	try {
		body = await request.json()
	} catch {
		// optional body
	}
	const weekStart = parseDate(body.week_start) ?? nextMonday(new Date())
	// Ensure it's a Monday for standard week
	const wd = new Date(weekStart + "T12:00:00").getDay()
	let weekStartMonday = wd === 1 ? weekStart : nextMonday(new Date(weekStart + "T12:00:00"))

	// Weekend-only timetable: use the Saturday of that week so generation runs for Sat–Sun
	const isWeekendsOnly = timetable.recurrence === "weekends_only"
	if (isWeekendsOnly) {
		const mon = new Date(weekStartMonday + "T12:00:00")
		mon.setDate(mon.getDate() + 5)
		weekStartMonday = mon.toISOString().slice(0, 10)
	}

	const { data: prefs } = await supabase
		.from("timetable_preferences")
		.select("individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes")
		.eq("timetable_id", timetableId)
		.single()
	const durationMinutes = prefs?.individual_lesson_duration_minutes ?? 45
	const distribution: DistributionPreference =
		DISTRIBUTION_VALUES.includes(body.distribution as (typeof DISTRIBUTION_VALUES)[number])
			? (body.distribution as DistributionPreference)
			: (prefs?.distribution as DistributionPreference | undefined) ?? "same"
	const bufferMinutes = Math.max(0, Number(prefs?.buffer_between_lessons_minutes ?? 0) || 0)
	const maxConsecutiveMinutes = Math.max(0, Number(prefs?.max_consecutive_minutes_per_trainer ?? 0) || 0)
	const minBreakMinutes = Math.max(0, Number(prefs?.min_break_minutes_after_consecutive ?? 0) || 0)
	const dayStart = timetable.day_start ?? "08:00"
	const dayEnd = timetable.day_end ?? "22:00"

	const { data: targets } = await supabase
		.from("timetable_targets")
		.select("id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id")
		.eq("timetable_id", timetableId)
	// Use group_targets from body if provided (e.g. unsaved from dialog); otherwise fetch from DB
	let groupTargets: { id: string; group_id: string; group_lesson_type_id: string; desired_lessons_count: number; priority: string; preferred_trainer_id: string | null }[] | null = null
	if (Array.isArray(body.group_targets) && body.group_targets.length > 0) {
		const { data: clubGroups } = await supabase.from("groups").select("id").eq("club_id", clubId)
		const { data: clubTypes } = await supabase.from("group_lesson_types").select("id").eq("club_id", clubId)
		const validGroupIds = new Set((clubGroups ?? []).map((g) => g.id))
		const validTypeIds = new Set((clubTypes ?? []).map((t) => t.id))
		const valid = body.group_targets.filter(
			(gt: BodyGroupTarget) =>
				typeof gt.group_id === "string" &&
				gt.group_id.trim() !== "" &&
				validGroupIds.has(gt.group_id.trim()) &&
				typeof gt.group_lesson_type_id === "string" &&
				gt.group_lesson_type_id.trim() !== "" &&
				validTypeIds.has(gt.group_lesson_type_id.trim()) &&
				typeof gt.desired_lessons_count === "number" &&
				gt.desired_lessons_count >= 0
		)
		groupTargets = valid.map((gt: BodyGroupTarget, i: number) => ({
			id: `body-${i}`,
			group_id: gt.group_id.trim(),
			group_lesson_type_id: gt.group_lesson_type_id.trim(),
			desired_lessons_count: Math.max(0, gt.desired_lessons_count),
			priority: (gt.priority === "high" || gt.priority === "low" ? gt.priority : "medium") as "high" | "medium" | "low",
			preferred_trainer_id: gt.preferred_trainer_id && typeof gt.preferred_trainer_id === "string" ? gt.preferred_trainer_id.trim() || null : null,
		}))
	}
	if (groupTargets === null) {
		const { data: groupTargetsFromDb } = await supabase
			.from("timetable_group_targets")
			.select("id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id")
			.eq("timetable_id", timetableId)
		groupTargets = groupTargetsFromDb ?? []
	}
	const { data: limits } = await supabase
		.from("timetable_trainer_limits")
		.select("user_id, max_lessons_per_day")
		.eq("timetable_id", timetableId)
	const { data: rooms } = await supabase
		.from("rooms")
		.select("id")
		.eq("club_id", clubId)

	const trainerIds = (limits ?? []).map((l) => l.user_id)
	const trainerLimits = new Map((limits ?? []).map((l) => [l.user_id, l.max_lessons_per_day]))
	const roomIds = (rooms ?? []).map((r) => r.id)

	const studentIds = (targets ?? []).map((t) => t.student_id).filter(Boolean) as string[]
	const coupleIds = (targets ?? []).map((t) => t.couple_id).filter(Boolean) as string[]
	const allUserIds = [...new Set([...studentIds, ...trainerIds])]

	const { data: profiles } =
		allUserIds.length > 0
			? await supabase.from("profiles").select("id, availability").in("id", allUserIds)
			: { data: [] }
	const { data: couples } =
		coupleIds.length > 0
			? await supabase.from("couples").select("id, availability").in("id", coupleIds)
			: { data: [] }

	const targetAvailability = new Map<string, AvailabilitySlot[]>()
	for (const p of profiles ?? []) {
		const av = Array.isArray(p.availability) ? (p.availability as AvailabilitySlot[]) : []
		targetAvailability.set(p.id, av)
	}
	for (const c of couples ?? []) {
		const av = Array.isArray(c.availability) ? (c.availability as AvailabilitySlot[]) : []
		targetAvailability.set(c.id, av)
	}

	const trainerAvailability = new Map<string, AvailabilitySlot[]>()
	for (const p of profiles ?? []) {
		if (!trainerIds.includes(p.id)) continue
		const av = Array.isArray(p.availability) ? (p.availability as AvailabilitySlot[]) : []
		trainerAvailability.set(p.id, av)
	}

	// Load member context once so every solver input (targets, group targets,
	// existing cross-timetable lessons) can carry the individual user IDs it
	// occupies. This is what makes the solver member-aware: Alice in a couple
	// lesson and Alice as a group member cannot be placed at the same time.
	const memberContext = await loadMemberContext(supabase, clubId)

	const solverTargets: SolverTarget[] = (targets ?? []).map((t) => ({
		id: t.id,
		student_id: t.student_id ?? null,
		couple_id: t.couple_id ?? null,
		desired_lessons_count: t.desired_lessons_count,
		priority: (t.priority as "high" | "medium" | "low") ?? "medium",
		preferred_trainer_id: t.preferred_trainer_id ?? null,
		user_ids: getLessonUserIds(
			{ student_id: t.student_id ?? null, couple_id: t.couple_id ?? null, group_id: null },
			memberContext,
		),
	}))

	const groupAvailability = new Map<string, AvailabilitySlot[]>()
	const groupDurationMinutes = new Map<string, number>()
	const solverGroupTargets: SolverGroupTarget[] = []
	if ((groupTargets ?? []).length > 0) {
		const gIds = [...new Set((groupTargets ?? []).map((g) => g.group_id))]
		const typeIds = [...new Set((groupTargets ?? []).map((g) => g.group_lesson_type_id))]
		const { data: groups } = await supabase.from("groups").select("id, availability").in("id", gIds)
		const { data: groupLessonTypes } = await supabase
			.from("group_lesson_types")
			.select("id, duration_minutes")
			.in("id", typeIds)
		for (const g of groups ?? []) {
			const av = Array.isArray(g.availability) ? (g.availability as AvailabilitySlot[]) : []
			groupAvailability.set(g.id, av)
		}
		for (const t of groupLessonTypes ?? []) {
			groupDurationMinutes.set(t.id, t.duration_minutes)
		}
		// Fallback: if a group lesson type has no duration (e.g. missing from fetch), use individual duration so we still schedule it
		const fallbackDuration = durationMinutes
		for (const typeId of typeIds) {
			if (!groupDurationMinutes.has(typeId)) {
				groupDurationMinutes.set(typeId, fallbackDuration)
			}
		}
		for (const gt of groupTargets ?? []) {
			solverGroupTargets.push({
				id: gt.id,
				group_id: gt.group_id,
				group_lesson_type_id: gt.group_lesson_type_id,
				desired_lessons_count: gt.desired_lessons_count,
				priority: (gt.priority as "high" | "medium" | "low") ?? "medium",
				preferred_trainer_id: gt.preferred_trainer_id ?? null,
				user_ids: getLessonUserIds(
					{ student_id: null, couple_id: null, group_id: gt.group_id },
					memberContext,
				),
			})
		}
	}

	// Fetch lessons from OTHER active timetables for the same week to prevent cross-timetable conflicts
	const weekEndForQuery = (() => {
		const [wy2, wm2, wd2] = weekStartMonday.split("-").map(Number)
		const d = new Date(wy2, (wm2 ?? 1) - 1, (wd2 ?? 1) + 6)
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
	})()

	const { data: otherTimetableIds } = await supabase
		.from("timetables")
		.select("id")
		.eq("club_id", clubId)
		.eq("is_active", true)
		.neq("id", timetableId)
	const otherIds = (otherTimetableIds ?? []).map((t) => t.id)

	let existingLessons: ExistingLesson[] = []
	if (otherIds.length > 0) {
		const { data: extLessons } = await supabase
			.from("lessons")
			.select("trainer_id, room_id, start_at, end_at, student_id, couple_id, group_id")
			.in("timetable_id", otherIds)
			.is("cancelled_at", null)
			.gte("start_at", weekStartMonday + "T00:00:00")
			.lte("start_at", weekEndForQuery + "T23:59:59")
		existingLessons = (extLessons ?? []).map((l) => ({
			trainer_id: l.trainer_id ?? null,
			room_id: l.room_id ?? null,
			student_id: l.student_id ?? null,
			couple_id: l.couple_id ?? null,
			group_id: l.group_id ?? null,
			start_at: l.start_at,
			end_at: l.end_at,
			user_ids: getLessonUserIds(
				{
					student_id: l.student_id ?? null,
					couple_id: l.couple_id ?? null,
					group_id: l.group_id ?? null,
				},
				memberContext,
			),
		}))
	}

	let lessons: Awaited<ReturnType<typeof solveTimetable>>
	try {
		lessons = solveTimetable({
			timetable_id: timetableId,
			week_start_monday: weekStartMonday,
			day_start: dayStart,
			day_end: dayEnd,
			duration_minutes: durationMinutes,
			targets: solverTargets,
			trainer_ids: trainerIds,
			trainer_availability: trainerAvailability,
			target_availability: targetAvailability,
			trainer_limits: trainerLimits,
			room_ids: roomIds,
			distribution,
			group_targets: solverGroupTargets.length ? solverGroupTargets : undefined,
			group_availability: solverGroupTargets.length ? groupAvailability : undefined,
			group_duration_minutes: solverGroupTargets.length ? groupDurationMinutes : undefined,
			existing_lessons: existingLessons.length > 0 ? existingLessons : undefined,
			buffer_minutes: bufferMinutes,
			max_consecutive_minutes: maxConsecutiveMinutes,
			min_break_minutes: minBreakMinutes,
			only_weekend_days: isWeekendsOnly,
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		return NextResponse.json({ error: `Solver error: ${message}` }, { status: 500 })
	}

	// Weekend-only: keep only lessons on Saturday and Sunday (first two days of solver week)
	if (isWeekendsOnly) {
		const sat = weekStartMonday
		const sunDate = new Date(sat + "T12:00:00")
		sunDate.setDate(sunDate.getDate() + 1)
		const sun = sunDate.toISOString().slice(0, 10)
		lessons = lessons.filter((l) => {
			const d = l.start_at.slice(0, 10)
			return d === sat || d === sun
		})
	}

	// Week end in local date (avoid UTC shift). For weekends_only, week is Sat–Sun only.
	const [wy, wm, dayOfMonth] = weekStartMonday.split("-").map(Number)
	const daysToAdd = isWeekendsOnly ? 1 : 6
	const weekEndDate = new Date(wy, (wm ?? 1) - 1, (dayOfMonth ?? 1) + daysToAdd)
	const weekEndStr =
		`${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, "0")}-${String(weekEndDate.getDate()).padStart(2, "0")}` +
		"T23:59:59.999"
	const weekStartTs = weekStartMonday + "T00:00:00.000"

	// Delete non-static lessons: for recurring (weekly/bi_weekly/monthly) delete from this week through valid_until or 52 weeks; for fixed_period delete only this week
	const recurrence = (timetable as { recurrence?: string }).recurrence ?? "weekly"
	const validUntil = (timetable as { valid_until?: string | null }).valid_until ?? null
	const isRecurring = recurrence === "weekly" || recurrence === "weekends_only" || recurrence === "bi_weekly" || recurrence === "monthly"
	const periodEnd = isRecurring
		? validUntil
			? validUntil + "T23:59:59.999"
			: (() => {
					const e = new Date(weekStartMonday + "T12:00:00")
					e.setDate(e.getDate() + 52 * 7)
					return e.toISOString().slice(0, 19).replace("T", "T") + ".999"
				})()
		: weekEndStr
	const { data: toDelete, error: listError } = await supabase
		.from("lessons")
		.select("id")
		.eq("timetable_id", timetableId)
		.eq("is_static", false)
		.gte("start_at", weekStartTs)
		.lte("start_at", periodEnd)
	if (listError) {
		return NextResponse.json({ error: listError.message }, { status: 500 })
	}
	const idsToDelete = (toDelete ?? []).map((r) => r.id)
	if (idsToDelete.length > 0) {
		// Delete in chunks to avoid query size limits
		for (let i = 0; i < idsToDelete.length; i += 200) {
			const chunk = idsToDelete.slice(i, i + 200)
			const { error: delError } = await supabase.from("lessons").delete().in("id", chunk)
			if (delError) {
				return NextResponse.json({ error: delError.message }, { status: 500 })
			}
		}
	}

	// Shortfalls: who got fewer lessons than desired and why
	type Shortfall = {
		target_id?: string
		group_id?: string
		group_lesson_type_id?: string
		desired_lessons_count: number
		actual_count: number
		reason: string
	}

	const distributionLabel: Record<DistributionPreference, string> = {
		same: "the selected days",
		first_half: "Mon–Wed",
		second_half: "Thu–Sun",
	}
	const allowedDays = allowedDaysForDistribution(distribution)
	// When the timetable is weekends-only, further restrict to Sat/Sun
	const effectiveAllowedDays = isWeekendsOnly
		? new Set<string>([...allowedDays].filter((d) => d === "saturday" || d === "sunday"))
		: allowedDays
	const allowedDaysLabel = isWeekendsOnly
		? "Sat–Sun"
		: distributionLabel[distribution]

	function availabilityHasAllowedDay(av: AvailabilitySlot[] | undefined): boolean {
		if (!av || av.length === 0) return true // empty = available any day
		return av.some((s) => effectiveAllowedDays.has(s.day.toLowerCase()))
	}

	function reasonFor(av: AvailabilitySlot[] | undefined, actual: number): string {
		if (!availabilityHasAllowedDay(av)) {
			return `No availability on ${allowedDaysLabel}. Update their availability or change the distribution.`
		}
		if (actual === 0 && (roomIds.length === 0 || trainerIds.length === 0)) {
			return trainerIds.length === 0
				? "No trainers configured for this timetable."
				: "No rooms configured for this club."
		}
		return "No free trainer or room matched their available times (capacity reached)."
	}

	const shortfalls: Shortfall[] = []
	for (const t of targets ?? []) {
		const actual = lessons.filter(
			(l) => l.student_id === t.student_id && l.couple_id === t.couple_id
		).length
		if (actual < t.desired_lessons_count) {
			const key = (t.student_id ?? t.couple_id ?? "") as string
			const av = targetAvailability.get(key)
			shortfalls.push({
				target_id: t.id,
				desired_lessons_count: t.desired_lessons_count,
				actual_count: actual,
				reason: reasonFor(av, actual),
			})
		}
	}
	for (const gt of groupTargets ?? []) {
		const actual = lessons.filter(
			(l) => l.group_id === gt.group_id && l.group_lesson_type_id === gt.group_lesson_type_id
		).length
		if (actual < gt.desired_lessons_count) {
			const av = groupAvailability.get(gt.group_id)
			shortfalls.push({
				group_id: gt.group_id,
				group_lesson_type_id: gt.group_lesson_type_id,
				desired_lessons_count: gt.desired_lessons_count,
				actual_count: actual,
				reason: reasonFor(av, actual),
			})
		}
	}

	if (lessons.length === 0) {
		return NextResponse.json({ created: 0, lessons: [], week_start: weekStartMonday, shortfalls })
	}

	const { data: inserted, error: insError } = await supabase
		.from("lessons")
		.insert(lessons)
		.select("id, start_at, end_at, room_id, trainer_id, student_id, couple_id, lesson_type")
	if (insError) {
		return NextResponse.json({ error: insError.message }, { status: 500 })
	}

	// Replicate this week's pattern for recurring timetables so "My lessons" (week / month / year) shows all occurrences
	const replicated = replicateLessons(lessons, recurrence, validUntil, weekStartMonday)
	let totalCreated = inserted?.length ?? 0
	if (replicated.length > 0) {
		const BATCH = 150
		for (let i = 0; i < replicated.length; i += BATCH) {
			const batch = replicated.slice(i, i + BATCH)
			const { error: repError } = await supabase.from("lessons").insert(batch)
			if (repError) {
				return NextResponse.json({ error: `Replicate lessons: ${repError.message}` }, { status: 500 })
			}
			totalCreated += batch.length
		}
	}

	return NextResponse.json({
		created: totalCreated,
		lessons: inserted ?? [],
		week_start: weekStartMonday,
		shortfalls,
		replicated: replicated.length,
	})
}
