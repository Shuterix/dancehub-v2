import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { solveTimetable, type SolverTarget, type SolverGroupTarget } from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"

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
	const supabase = await createClient()
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id, day_start, day_end")
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
	// Ensure it's a Monday
	const wd = new Date(weekStart + "T12:00:00").getDay()
	const weekStartMonday = wd === 1 ? weekStart : nextMonday(new Date(weekStart + "T12:00:00"))

	const { data: prefs } = await supabase
		.from("timetable_preferences")
		.select("individual_lesson_duration_minutes, distribution")
		.eq("timetable_id", timetableId)
		.single()
	const durationMinutes = prefs?.individual_lesson_duration_minutes ?? 45
	const distribution =
		DISTRIBUTION_VALUES.includes(body.distribution as (typeof DISTRIBUTION_VALUES)[number])
			? body.distribution
			: (prefs?.distribution as (typeof DISTRIBUTION_VALUES)[number]) ?? "same"
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

	const solverTargets: SolverTarget[] = (targets ?? []).map((t) => ({
		id: t.id,
		student_id: t.student_id ?? null,
		couple_id: t.couple_id ?? null,
		desired_lessons_count: t.desired_lessons_count,
		priority: (t.priority as "high" | "medium" | "low") ?? "medium",
		preferred_trainer_id: t.preferred_trainer_id ?? null,
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
			})
		}
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
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		return NextResponse.json({ error: `Solver error: ${message}` }, { status: 500 })
	}

	// Week end in local date (avoid UTC shift)
	const [wy, wm, dayOfMonth] = weekStartMonday.split("-").map(Number)
	const weekEndDate = new Date(wy, (wm ?? 1) - 1, (dayOfMonth ?? 1) + 6)
	const weekEndStr =
		`${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, "0")}-${String(weekEndDate.getDate()).padStart(2, "0")}` +
		"T23:59:59.999"
	const weekStartTs = weekStartMonday + "T00:00:00.000"

	const { data: toDelete, error: listError } = await supabase
		.from("lessons")
		.select("id")
		.eq("timetable_id", timetableId)
		.eq("is_static", false)
		.gte("start_at", weekStartTs)
		.lte("start_at", weekEndStr)
	if (listError) {
		return NextResponse.json({ error: listError.message }, { status: 500 })
	}
	const idsToDelete = (toDelete ?? []).map((r) => r.id)
	if (idsToDelete.length > 0) {
		const { error: delError } = await supabase.from("lessons").delete().in("id", idsToDelete)
		if (delError) {
			return NextResponse.json({ error: delError.message }, { status: 500 })
		}
	}

	if (lessons.length === 0) {
		return NextResponse.json({ created: 0, lessons: [], week_start: weekStartMonday })
	}

	const { data: inserted, error: insError } = await supabase
		.from("lessons")
		.insert(lessons)
		.select("id, start_at, end_at, room_id, trainer_id, student_id, couple_id, lesson_type")
	if (insError) {
		return NextResponse.json({ error: insError.message }, { status: 500 })
	}

	return NextResponse.json({
		created: inserted?.length ?? 0,
		lessons: inserted ?? [],
		week_start: weekStartMonday,
	})
}
