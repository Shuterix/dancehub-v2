import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import {
	allowedDaysForDistribution,
	buildWeekSlots,
	isAvailableAtSlot,
	orderSlotsByDistribution,
	type DistributionPreference,
} from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"
import { getLessonUserIds, loadMemberContext } from "@/lib/lesson-members"
import { weekStartMonday, shortfallLessonCountRange } from "@/lib/timetable-week"

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

	return { user, clubId: myProfile.club_id, isTrainer }
}

function timeOverlaps(start1: string, end1: string, start2: string, end2: string): boolean {
	return start1 < end2 && start2 < end1
}

type ShortfallBlockerKind =
	| "participant_unavailable"
	| "trainer_unavailable"
	| "trainer_busy"
	| "room_busy"
	| "participant_busy"

type Shortfall = {
	target_id?: string
	group_id?: string
	group_lesson_type_id?: string
	desired_lessons_count: number
	actual_count: number
	reason: string
	blockers?: Array<{ kind: ShortfallBlockerKind; count: number }>
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id: timetableId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth
	if (!isTrainer) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id, club_id, recurrence, day_start, day_end, is_active")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) return NextResponse.json({ error: "Timetable not found" }, { status: 404 })

	const { data: prefs } = await supabase
		.from("timetable_preferences")
		.select("distribution, individual_lesson_duration_minutes")
		.eq("timetable_id", timetableId)
		.single()

	const { searchParams } = new URL(request.url)
	const weekStart = searchParams.get("week_start")
	const monday = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
		? weekStartMonday(weekStart)
		: weekStartMonday(new Date().toISOString().slice(0, 10))

	// For weekends_only, the timetable UI uses an arbitrary date; generation is Sat–Sun.
	const isWeekendsOnly = timetable.recurrence === "weekends_only"
	const weekStartForSlots = (() => {
		if (!isWeekendsOnly) return monday
		const mon = new Date(monday + "T12:00:00")
		mon.setDate(mon.getDate() + 5)
		return mon.toISOString().slice(0, 10)
	})()

	const daysToAdd = isWeekendsOnly ? 1 : 6
	const endDate = new Date(weekStartForSlots + "T12:00:00")
	endDate.setDate(endDate.getDate() + daysToAdd)
	const weekEndStr = endDate.toISOString().slice(0, 10)

	/** Compared to `desired_*`: per month / per 2 weeks / per week, not only the 7 days shown in the grid. */
	const countRange = shortfallLessonCountRange(monday, timetable.recurrence, isWeekendsOnly)

	const distribution = (prefs?.distribution as DistributionPreference | null) ?? "same"
	const allowedDays = allowedDaysForDistribution(distribution)
	const effectiveAllowedDays = isWeekendsOnly
		? new Set<string>([...allowedDays].filter((d) => d === "saturday" || d === "sunday"))
		: allowedDays

	const durationMinutes = prefs?.individual_lesson_duration_minutes ?? 45
	const dayStart = timetable.day_start ?? "08:00"
	const dayEnd = timetable.day_end ?? "22:00"

	const { data: targets } = await supabase
		.from("timetable_targets")
		.select("id, student_id, couple_id, desired_lessons_count")
		.eq("timetable_id", timetableId)
	const { data: groupTargets } = await supabase
		.from("timetable_group_targets")
		.select("id, group_id, group_lesson_type_id, desired_lessons_count")
		.eq("timetable_id", timetableId)

	const { data: limits } = await supabase
		.from("timetable_trainer_limits")
		.select("user_id")
		.eq("timetable_id", timetableId)
	const trainerIds = (limits ?? []).map((l) => l.user_id)

	const { data: rooms } = await supabase.from("rooms").select("id").eq("club_id", clubId)
	const roomIds = (rooms ?? []).map((r) => r.id)

	// Availability: profiles + couples + groups
	const studentIds = (targets ?? []).map((t) => t.student_id).filter(Boolean) as string[]
	const coupleIds = (targets ?? []).map((t) => t.couple_id).filter(Boolean) as string[]
	const groupIds = (groupTargets ?? []).map((g) => g.group_id).filter(Boolean) as string[]
	const allProfileIds = [...new Set([...studentIds, ...trainerIds])]

	const { data: profiles } =
		allProfileIds.length > 0
			? await supabase.from("profiles").select("id, availability").in("id", allProfileIds)
			: { data: [] }
	const { data: couples } =
		coupleIds.length > 0
			? await supabase.from("couples").select("id, availability").in("id", coupleIds)
			: { data: [] }
	const { data: groups } =
		groupIds.length > 0
			? await supabase.from("groups").select("id, availability").in("id", groupIds)
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
	const groupAvailability = new Map<string, AvailabilitySlot[]>()
	for (const g of groups ?? []) {
		const av = Array.isArray(g.availability) ? (g.availability as AvailabilitySlot[]) : []
		groupAvailability.set(g.id, av)
	}

	const memberContext = await loadMemberContext(supabase, clubId)

	// Busy universe: all lessons from active timetables (including this one) in the viewed week.
	const { data: activeIds } = await supabase
		.from("timetables")
		.select("id")
		.eq("club_id", clubId)
		.eq("is_active", true)
	const activeTimetableIds = (activeIds ?? []).map((t) => t.id)
	const { data: allLessonsRaw } =
		activeTimetableIds.length > 0
			? await supabase
					.from("lessons")
					.select("timetable_id, trainer_id, room_id, start_at, end_at, student_id, couple_id, group_id, group_lesson_type_id")
					.in("timetable_id", activeTimetableIds)
					.is("cancelled_at", null)
					.gte("start_at", weekStartForSlots + "T00:00:00")
					.lte("start_at", weekEndStr + "T23:59:59")
			: { data: [] }

	const allLessons = (allLessonsRaw ?? []).map((l) => ({
		timetable_id: l.timetable_id as string,
		trainer_id: (l.trainer_id as string | null) ?? null,
		room_id: (l.room_id as string | null) ?? null,
		student_id: (l.student_id as string | null) ?? null,
		couple_id: (l.couple_id as string | null) ?? null,
		group_id: (l.group_id as string | null) ?? null,
		group_lesson_type_id: (l.group_lesson_type_id as string | null) ?? null,
		start_at: l.start_at as string,
		end_at: l.end_at as string,
		user_ids: getLessonUserIds(
			{
				student_id: (l.student_id as string | null) ?? null,
				couple_id: (l.couple_id as string | null) ?? null,
				group_id: (l.group_id as string | null) ?? null,
			},
			memberContext,
		),
	}))

	// Index by date for faster scans
	const byDate = new Map<string, typeof allLessons>()
	for (const l of allLessons) {
		const d = l.start_at.slice(0, 10)
		if (!byDate.has(d)) byDate.set(d, [])
		byDate.get(d)!.push(l)
	}

	function availabilityHasAllowedDay(av: AvailabilitySlot[] | undefined): boolean {
		if (!av || av.length === 0) return true
		return av.some((s) => effectiveAllowedDays.has(String(s.day ?? "").toLowerCase()))
	}

	function tallyToArray(t: Map<ShortfallBlockerKind, number>) {
		return [...t.entries()]
			.filter(([, v]) => v > 0)
			.sort((a, b) => b[1] - a[1])
			.map(([kind, count]) => ({ kind, count }))
	}

	function diagnoseParticipantWeek(opts: {
		participantAvailability: AvailabilitySlot[] | undefined
		participantUserIds: string[]
		duration: number
	}): { reason: string; blockers: Array<{ kind: ShortfallBlockerKind; count: number }> } {
		const baseSlots = buildWeekSlots(weekStartForSlots, dayStart, dayEnd, opts.duration)
		const slots = orderSlotsByDistribution(baseSlots, distribution).filter((s) => {
			// Only count candidate slots on allowed days.
			const wd = new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()
			return effectiveAllowedDays.has(wd)
		})

		if (!availabilityHasAllowedDay(opts.participantAvailability)) {
			return {
				reason: "No availability on the selected distribution days.",
				blockers: [{ kind: "participant_unavailable", count: slots.length || 1 }],
			}
		}
		if (trainerIds.length === 0) {
			return { reason: "No trainers configured for this timetable.", blockers: [{ kind: "trainer_unavailable", count: 1 }] }
		}
		if (roomIds.length === 0) {
			return { reason: "No rooms configured for this club.", blockers: [{ kind: "room_busy", count: 1 }] }
		}

		const tally = new Map<ShortfallBlockerKind, number>()
		let anyFeasible = false

		for (const s of slots) {
			const date = s.date
			const dayLessons = byDate.get(date) ?? []

			// 1) participant availability containment
			if (!isAvailableAtSlot(opts.participantAvailability ?? [], date, s.startTime, s.endTime)) {
				tally.set("participant_unavailable", (tally.get("participant_unavailable") ?? 0) + 1)
				continue
			}

			// 2) participant busy (overlap with any lesson sharing members)
			let participantBusy = false
			for (const l of dayLessons) {
				if (l.user_ids.length === 0 || opts.participantUserIds.length === 0) continue
				const shares = opts.participantUserIds.some((uid) => l.user_ids.includes(uid))
				if (!shares) continue
				if (timeOverlaps(l.start_at.slice(11, 16), l.end_at.slice(11, 16), s.startTime, s.endTime)) {
					participantBusy = true
					break
				}
			}
			if (participantBusy) {
				tally.set("participant_busy", (tally.get("participant_busy") ?? 0) + 1)
				continue
			}

			// 3) try to find any trainer+room combo
			let hasTrainer = false
			let trainerBlockedByAvailability = true
			let trainerBlockedByBusy = true
			for (const tid of trainerIds) {
				const tav = trainerAvailability.get(tid) ?? []
				if (!isAvailableAtSlot(tav, date, s.startTime, s.endTime)) {
					continue
				}
				trainerBlockedByAvailability = false
				let busy = false
				for (const l of dayLessons) {
					if (l.trainer_id !== tid) continue
					if (timeOverlaps(l.start_at.slice(11, 16), l.end_at.slice(11, 16), s.startTime, s.endTime)) {
						busy = true
						break
					}
				}
				if (busy) continue
				trainerBlockedByBusy = false
				hasTrainer = true

				// room check for this trainer slot
				for (const rid of roomIds) {
					let roomBusy = false
					for (const l of dayLessons) {
						if (l.room_id !== rid) continue
						if (timeOverlaps(l.start_at.slice(11, 16), l.end_at.slice(11, 16), s.startTime, s.endTime)) {
							roomBusy = true
							break
						}
					}
					if (!roomBusy) {
						anyFeasible = true
						break
					}
				}
				if (anyFeasible) break
			}

			if (anyFeasible) break
			if (!hasTrainer) {
				// No trainer satisfied availability at all for this slot.
				tally.set(
					"trainer_unavailable",
					(tally.get("trainer_unavailable") ?? 0) + (trainerBlockedByAvailability ? 1 : 0),
				)
				// If trainers were available but all busy, count that too.
				if (!trainerBlockedByAvailability && trainerBlockedByBusy) {
					tally.set("trainer_busy", (tally.get("trainer_busy") ?? 0) + 1)
				}
				continue
			}
			// Trainers exist but every room was busy.
			tally.set("room_busy", (tally.get("room_busy") ?? 0) + 1)
		}

		if (anyFeasible) {
			return { reason: "At least one feasible slot exists (this shortfall may be due to prioritization).", blockers: [] }
		}

		const blockers = tallyToArray(tally)
		const top = blockers[0]?.kind
		const reason =
			top === "participant_unavailable"
				? "Participant availability does not contain any full lesson slot in the allowed days/window."
				: top === "participant_busy"
					? "Participant is already occupied in every available slot."
					: top === "trainer_unavailable"
						? "No trainer is available at the same times."
						: top === "trainer_busy"
							? "Trainers are already occupied at the only possible times."
							: "Every room is occupied at the only possible times."

		return { reason, blockers }
	}

	// Actual counts use `countRange` (e.g. full month for "monthly"), while diagnostics above use the viewed week.
	const { data: thisLessonsRaw } = await supabase
		.from("lessons")
		.select("lesson_type, start_at, end_at, student_id, couple_id, group_id, group_lesson_type_id")
		.eq("timetable_id", timetableId)
		.is("cancelled_at", null)
		.gte("start_at", countRange.from + "T00:00:00")
		.lte("start_at", countRange.to + "T23:59:59")
	const thisLessons = thisLessonsRaw ?? []

	const shortfalls: Shortfall[] = []

	for (const t of targets ?? []) {
		const actual = thisLessons.filter((l) => l.student_id === t.student_id && l.couple_id === t.couple_id).length
		if (actual >= t.desired_lessons_count) continue
		const key = (t.student_id ?? t.couple_id ?? "") as string
		const av = targetAvailability.get(key)
		const userIds = getLessonUserIds(
			{ student_id: t.student_id ?? null, couple_id: t.couple_id ?? null, group_id: null },
			memberContext,
		)
		const diag = diagnoseParticipantWeek({
			participantAvailability: av,
			participantUserIds: userIds,
			duration: durationMinutes,
		})
		shortfalls.push({
			target_id: t.id,
			desired_lessons_count: t.desired_lessons_count,
			actual_count: actual,
			reason: diag.reason,
			blockers: diag.blockers,
		})
	}

	// Group durations can vary; load group lesson type durations for diagnostics
	const typeIds = [...new Set((groupTargets ?? []).map((gt) => gt.group_lesson_type_id))]
	const { data: groupLessonTypes } =
		typeIds.length > 0
			? await supabase.from("group_lesson_types").select("id, duration_minutes").in("id", typeIds)
			: { data: [] }
	const durationByType = new Map((groupLessonTypes ?? []).map((t) => [t.id, t.duration_minutes ?? durationMinutes]))

	for (const gt of groupTargets ?? []) {
		const actual = thisLessons.filter(
			(l) => l.group_id === gt.group_id && l.group_lesson_type_id === gt.group_lesson_type_id,
		).length
		if (actual >= gt.desired_lessons_count) continue
		const av = groupAvailability.get(gt.group_id)
		const userIds = getLessonUserIds(
			{ student_id: null, couple_id: null, group_id: gt.group_id },
			memberContext,
		)
		const dur = durationByType.get(gt.group_lesson_type_id) ?? durationMinutes
		const diag = diagnoseParticipantWeek({
			participantAvailability: av,
			participantUserIds: userIds,
			duration: dur,
		})
		shortfalls.push({
			group_id: gt.group_id,
			group_lesson_type_id: gt.group_lesson_type_id,
			desired_lessons_count: gt.desired_lessons_count,
			actual_count: actual,
			reason: diag.reason,
			blockers: diag.blockers,
		})
	}

	return NextResponse.json({ week_start: weekStartForSlots, shortfalls })
}

