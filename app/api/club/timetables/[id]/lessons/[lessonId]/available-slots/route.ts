import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { allowedDaysForDistribution, isAvailableAtSlot } from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"
import { getLessonUserIds, loadMemberContext, sharesUser } from "@/lib/lesson-members"

// Granularity of proposed slots. 15 minutes gives a nice balance between
// "many options" and "not overwhelming"; it also aligns with typical studio
// booking grids.
const SLOT_STEP_MINUTES = 15

type Slot = { date: string; start_time: string; end_time: string }

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

function toMinutes(t: string): number {
	const [h, m] = t.split(":").map(Number)
	return (h ?? 0) * 60 + (m ?? 0)
}
function toTime(total: number): string {
	const h = Math.floor(total / 60)
	const m = total % 60
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd
}
function parseAvailability(raw: unknown): AvailabilitySlot[] {
	return Array.isArray(raw) ? (raw as AvailabilitySlot[]) : []
}

function dayNameOf(dateStr: string): string {
	const [y, m, d] = dateStr.split("-").map(Number)
	const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
	return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day]
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string; lessonId: string }> },
) {
	const { id: timetableId, lessonId } = await params
	const { searchParams } = new URL(request.url)
	const weekStart = searchParams.get("week_start") // expected YYYY-MM-DD (Monday)
	if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
		return NextResponse.json({ error: "Missing or invalid week_start" }, { status: 400 })
	}

	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth
	if (!isTrainer) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

	// ------------------------------------------------------------------
	// 1. Load the target timetable + its preferences + the lesson itself
	// ------------------------------------------------------------------
	const { data: timetable } = await supabase
		.from("timetables")
		.select("id, day_start, day_end, club_id")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (!timetable) return NextResponse.json({ error: "Timetable not found" }, { status: 404 })

	const { data: prefs } = await supabase
		.from("timetable_preferences")
		.select("distribution, buffer_between_lessons_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive")
		.eq("timetable_id", timetableId)
		.maybeSingle()

	const distribution = (prefs?.distribution ?? "same") as "same" | "first_half" | "second_half"
	const bufferMin = Math.max(0, Number(prefs?.buffer_between_lessons_minutes ?? 0) || 0)
	const maxConsecMin = Math.max(0, Number(prefs?.max_consecutive_minutes_per_trainer ?? 0) || 0)
	const minBreakMin = Math.max(0, Number(prefs?.min_break_minutes_after_consecutive ?? 0) || 0)

	const { data: lesson } = await supabase
		.from("lessons")
		.select("id, timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id")
		.eq("id", lessonId)
		.eq("timetable_id", timetableId)
		.single()
	if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 })

	const durationMin = toMinutes(lesson.end_at.slice(11, 16)) - toMinutes(lesson.start_at.slice(11, 16))
	if (durationMin <= 0) return NextResponse.json({ error: "Invalid lesson duration" }, { status: 400 })

	// ------------------------------------------------------------------
	// 2. Load availabilities (trainer + participant) for rule checks
	// ------------------------------------------------------------------
	let trainerAvail: AvailabilitySlot[] = []
	if (lesson.trainer_id) {
		const { data: t } = await supabase
			.from("profiles")
			.select("availability")
			.eq("id", lesson.trainer_id)
			.maybeSingle()
		trainerAvail = parseAvailability(t?.availability)
	}

	let participantAvail: AvailabilitySlot[] = []
	if (lesson.student_id) {
		const { data: p } = await supabase.from("profiles").select("availability").eq("id", lesson.student_id).maybeSingle()
		participantAvail = parseAvailability(p?.availability)
	} else if (lesson.couple_id) {
		const { data: c } = await supabase.from("couples").select("availability").eq("id", lesson.couple_id).maybeSingle()
		participantAvail = parseAvailability(c?.availability)
	} else if (lesson.group_id) {
		const { data: g } = await supabase.from("groups").select("availability").eq("id", lesson.group_id).maybeSingle()
		participantAvail = parseAvailability(g?.availability)
	}

	// ------------------------------------------------------------------
	// 3. Load busy windows across ALL active timetables for this club,
	//    restricted to the 7-day window. These drive overlap, buffer and
	//    max-consecutive checks.
	// ------------------------------------------------------------------
	const weekStartDate = weekStart
	const [ys, ms, ds] = weekStart.split("-").map(Number)
	const weekEndDate = (() => {
		const d = new Date(Date.UTC(ys ?? 1970, (ms ?? 1) - 1, (ds ?? 1) + 7))
		return d.toISOString().slice(0, 10)
	})()

	const { data: activeTt } = await supabase
		.from("timetables")
		.select("id")
		.eq("club_id", clubId)
		.eq("is_active", true)
	const activeIds = (activeTt ?? []).map((t) => t.id)

	const { data: weekLessons } = await supabase
		.from("lessons")
		.select("id, timetable_id, lesson_type, start_at, end_at, trainer_id, room_id, student_id, couple_id, group_id")
		.in("timetable_id", activeIds.length > 0 ? activeIds : [timetableId])
		.gte("start_at", `${weekStartDate}T00:00:00`)
		.lt("start_at", `${weekEndDate}T00:00:00`)
		.is("cancelled_at", null)

	// Load couple/group membership so we can expand every lesson into the
	// set of user IDs it occupies. A group lesson blocks every one of its
	// members individually, and a member's solo lesson must not overlap the
	// group meeting — and vice-versa.
	//
	// NOTE (group availability by member not couple maybe): we intentionally
	// do NOT enforce per-member *availability* here — the group's computed
	// availability is treated as authoritative, which means a couple-member
	// is considered available when either partner is free. Busy/overlap
	// checks below run at member level, so a member still can't be
	// double-booked even though their availability is computed coarsely.
	const memberCtx = await loadMemberContext(supabase, clubId)
	const lessonUserIds = getLessonUserIds(lesson, memberCtx)

	type Busy = {
		start: number
		end: number
		trainer_id: string | null
		room_id: string | null
		student_id: string | null
		couple_id: string | null
		group_id: string | null
		user_ids: string[]
	}
	const busyByDate = new Map<string, Busy[]>()
	for (const l of weekLessons ?? []) {
		if (l.id === lesson.id) continue // ignore the lesson being moved
		const date = l.start_at.slice(0, 10)
		if (!busyByDate.has(date)) busyByDate.set(date, [])
		busyByDate.get(date)!.push({
			start: toMinutes(l.start_at.slice(11, 16)),
			end: toMinutes(l.end_at.slice(11, 16)),
			trainer_id: l.trainer_id,
			room_id: l.room_id,
			student_id: l.student_id,
			couple_id: l.couple_id,
			group_id: l.group_id,
			user_ids: getLessonUserIds(l, memberCtx),
		})
	}

	// ------------------------------------------------------------------
	// 4. Iterate every candidate slot in the week and apply ALL rules
	// ------------------------------------------------------------------
	const allowedDays = allowedDaysForDistribution(distribution)
	const dayStartMin = toMinutes(timetable.day_start ?? "08:00")
	const dayEndMin = toMinutes(timetable.day_end ?? "22:00")

	const freeSlots: Slot[] = []
	for (let offset = 0; offset < 7; offset++) {
		const d = new Date(Date.UTC(ys ?? 1970, (ms ?? 1) - 1, (ds ?? 1) + offset))
		const dateStr = d.toISOString().slice(0, 10)
		const dayName = dayNameOf(dateStr)
		if (!allowedDays.has(dayName)) continue

		const busyList = busyByDate.get(dateStr) ?? []

		for (let startMin = dayStartMin; startMin + durationMin <= dayEndMin; startMin += SLOT_STEP_MINUTES) {
			const endMin = startMin + durationMin
			const startTime = toTime(startMin)
			const endTime = toTime(endMin)

			// 4a. Availability windows ------------------------------------------
			if (lesson.trainer_id && !isAvailableAtSlot(trainerAvail, dateStr, startTime, endTime)) continue
			if ((lesson.student_id || lesson.couple_id || lesson.group_id) && !isAvailableAtSlot(participantAvail, dateStr, startTime, endTime)) continue

			// 4b. Direct overlap with any busy lesson (cross-timetable aware) ----
			// A slot is rejected if ANY of the following overlap at the same time:
			//   • trainer id
			//   • room id
			//   • the same participant id (student / couple / group)
			//   • any individual member shared with the busy lesson's user_ids
			// The ID-level and member-level checks are intentionally redundant:
			// ID matches catch same-participant lessons even when membership
			// data for that lesson is missing, and user_ids catches cross-kind
			// collisions (e.g. Alice's couple lesson vs. a group she's in).
			let overlap = false
			for (const b of busyList) {
				if (!overlaps(startMin, endMin, b.start, b.end)) continue
				if (lesson.trainer_id && b.trainer_id === lesson.trainer_id) { overlap = true; break }
				if (lesson.room_id && b.room_id === lesson.room_id) { overlap = true; break }
				if (lesson.student_id && b.student_id === lesson.student_id) { overlap = true; break }
				if (lesson.couple_id && b.couple_id === lesson.couple_id) { overlap = true; break }
				if (lesson.group_id && b.group_id === lesson.group_id) { overlap = true; break }
				if (sharesUser(lessonUserIds, b.user_ids)) { overlap = true; break }
			}
			if (overlap) continue

			// 4c. Buffer — gap to nearest trainer/participant lesson must be >= bufferMin (only when > 0)
			if (bufferMin > 0) {
				let tooClose = false
				for (const b of busyList) {
					const sharesTrainer = lesson.trainer_id && b.trainer_id === lesson.trainer_id
					const sharesParticipant = sharesUser(lessonUserIds, b.user_ids)
					if (!sharesTrainer && !sharesParticipant) continue
					// Gap is either (startMin - b.end) or (b.start - endMin), whichever is the non-negative one
					const gap = startMin >= b.end ? startMin - b.end : b.start - endMin
					if (gap >= 0 && gap < bufferMin) { tooClose = true; break }
				}
				if (tooClose) continue
			}

			// 4d. Max consecutive + min break for the trainer ---------------------
			if (lesson.trainer_id && maxConsecMin > 0 && minBreakMin > 0) {
				const trainerBusy = busyList
					.filter((b) => b.trainer_id === lesson.trainer_id)
					.map((b) => ({ start: b.start, end: b.end }))
				// Build the streak that would include the new lesson.
				trainerBusy.push({ start: startMin, end: endMin })
				trainerBusy.sort((a, b) => a.start - b.start)
				let streakStart: number | null = null
				let streakEnd: number | null = null
				let violated = false
				for (const chunk of trainerBusy) {
					if (streakEnd !== null && chunk.start === streakEnd) {
						// Touching ⇒ extends streak
						streakEnd = chunk.end
					} else {
						if (streakStart !== null && streakEnd !== null && streakEnd - streakStart > maxConsecMin) {
							const gapAfter = chunk.start - streakEnd
							if (gapAfter < minBreakMin) { violated = true; break }
						}
						streakStart = chunk.start
						streakEnd = chunk.end
					}
					if (streakStart !== null && streakEnd !== null && streakEnd - streakStart > maxConsecMin) {
						// streak has just exceeded cap — need a break before the next chunk
						// Handled on the next iteration via `gapAfter`; nothing to do here.
					}
				}
				if (violated) continue
				// Also reject if the final streak ends at the new lesson AND exceeds cap without a break afterwards
				// (only relevant if there's a later chunk we haven't seen — already handled above).
			}

			freeSlots.push({ date: dateStr, start_time: startTime, end_time: endTime })
		}
	}

	return NextResponse.json({
		slots: freeSlots,
		duration_minutes: durationMin,
		distribution,
	})
}
