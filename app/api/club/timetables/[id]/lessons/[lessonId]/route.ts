import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { isAvailableAtSlot } from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"
import { getLessonUserIds, loadMemberContext, sharesUser } from "@/lib/lesson-members"
import { fetchMatchingSiblings } from "@/lib/lesson-pattern"

async function getClubAndAuth(
	supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>
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

function timeToMinutes(t: string): number {
	const [h, m] = t.split(":").map(Number)
	return (h ?? 0) * 60 + (m ?? 0)
}

function minutesToTime(total: number): string {
	const h = Math.floor(total / 60)
	const m = total % 60
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function timeOverlaps(start1: string, end1: string, start2: string, end2: string): boolean {
	const s1 = timeToMinutes(start1)
	const e1 = timeToMinutes(end1)
	const s2 = timeToMinutes(start2)
	const e2 = timeToMinutes(end2)
	return s1 < e2 && s2 < e1
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string; lessonId: string }> }
) {
	const { id: timetableId, lessonId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	let body: { date?: string; start_time?: string; scope?: "single" | "all_future" } = {}
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 })
	}

	const { date, start_time } = body
	const scope: "single" | "all_future" = body.scope === "all_future" ? "all_future" : "single"
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !start_time || !/^\d{2}:\d{2}$/.test(start_time)) {
		return NextResponse.json({ error: "Invalid date or time" }, { status: 400 })
	}

	// Load timetable to ensure it belongs to the club and to get schedule window
	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id, day_start, day_end, club_id")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) {
		return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
	}

	// Load lesson
	const { data: lesson, error: lError } = await supabase
		.from("lessons")
		.select(
			"id, timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id, group_lesson_type_id, is_static"
		)
		.eq("id", lessonId)
		.eq("timetable_id", timetableId)
		.single()

	if (lError || !lesson) {
		return NextResponse.json({ error: "Lesson not found" }, { status: 404 })
	}

	// Compute duration in minutes from existing lesson
	const startOld = lesson.start_at.slice(11, 16)
	const endOld = lesson.end_at.slice(11, 16)
	const durationMinutes = timeToMinutes(endOld) - timeToMinutes(startOld)
	if (durationMinutes <= 0) {
		return NextResponse.json({ error: "Invalid lesson duration" }, { status: 400 })
	}

	// Ensure new time stays within timetable day window
	const startMinutes = timeToMinutes(start_time)
	const endMinutes = startMinutes + durationMinutes
	const dayStartMinutes = timeToMinutes(timetable.day_start ?? "08:00")
	const dayEndMinutes = timeToMinutes(timetable.day_end ?? "22:00")
	if (startMinutes < dayStartMinutes || endMinutes > dayEndMinutes) {
		return NextResponse.json(
			{
				error: "Availability not met",
				issues: [
					`Time ${start_time}–${minutesToTime(
						endMinutes
					)} is outside timetable window ${timetable.day_start.slice(0, 5)}–${timetable.day_end.slice(0, 5)}`,
				],
			},
			{ status: 400 }
		)
	}

	const newStartTime = start_time
	const newEndTime = minutesToTime(endMinutes)
	const newStartAt = `${date}T${newStartTime}:00`
	const newEndAt = `${date}T${newEndTime}:00`

	const issues: string[] = []

	// Helper to load availability JSON into AvailabilitySlot[]
	const parseAvailability = (raw: unknown): AvailabilitySlot[] =>
		Array.isArray(raw) ? (raw as AvailabilitySlot[]) : []

	// Participant availability
	if (lesson.student_id || lesson.couple_id || lesson.group_id) {
		let av: AvailabilitySlot[] = []
		let label = "Participant"

		if (lesson.student_id) {
			const { data: p } = await supabase
				.from("profiles")
				.select("full_name, availability")
				.eq("id", lesson.student_id)
				.maybeSingle()
			if (p) {
				label = p.full_name ?? label
				av = parseAvailability(p.availability)
			}
		} else if (lesson.couple_id) {
			const { data: c } = await supabase
				.from("couples")
				.select("name, availability")
				.eq("id", lesson.couple_id)
				.maybeSingle()
			if (c) {
				label = c.name ?? label
				av = parseAvailability(c.availability)
			}
		} else if (lesson.group_id) {
			const { data: g } = await supabase
				.from("groups")
				.select("name, availability")
				.eq("id", lesson.group_id)
				.maybeSingle()
			if (g) {
				label = g.name ?? label
				av = parseAvailability(g.availability)
			}
		}

		if (!isAvailableAtSlot(av, date, newStartTime, newEndTime)) {
			issues.push(`${label} is not available on ${date} ${newStartTime}–${newEndTime}`)
		}
	}

	// Trainer availability and limits
	let trainerName = "Trainer"
	if (lesson.trainer_id) {
		const { data: pref } = await supabase
			.from("profiles")
			.select("full_name, availability")
			.eq("id", lesson.trainer_id)
			.maybeSingle()
		const av = pref ? parseAvailability(pref.availability) : []
		if (pref?.full_name) trainerName = pref.full_name
		if (!isAvailableAtSlot(av, date, newStartTime, newEndTime)) {
			issues.push(`${trainerName} is not available on ${date} ${newStartTime}–${newEndTime}`)
		}

		// Daily limit
		const { data: limitRow } = await supabase
			.from("timetable_trainer_limits")
			.select("max_lessons_per_day")
			.eq("timetable_id", timetableId)
			.eq("user_id", lesson.trainer_id)
			.maybeSingle()
		const maxPerDay = limitRow?.max_lessons_per_day
		if (maxPerDay != null) {
			const { data: sameDayLessons } = await supabase
				.from("lessons")
				.select("id")
				.eq("timetable_id", timetableId)
				.eq("trainer_id", lesson.trainer_id)
				.gte("start_at", `${date}T00:00:00`)
				.lte("start_at", `${date}T23:59:59.999`)
			const countExisting = (sameDayLessons ?? []).filter((l) => l.id !== lesson.id).length
			if (countExisting + 1 > maxPerDay) {
				issues.push(`${trainerName} would exceed daily limit of ${maxPerDay} lessons on ${date}`)
			}
		}
	}

	// Conflicts with other lessons (trainer / room / participant / shared member) —
	// scoped to EVERY active timetable in the club, not just this timetable, so
	// we don't accidentally move a lesson onto a slot that's already occupied
	// on another timetable. Member-level expansion catches cross-kind
	// collisions (e.g. Alice in a couple lesson vs. a group she's in).
	const memberCtx = await loadMemberContext(supabase, clubId)
	const lessonUserIds = getLessonUserIds(lesson, memberCtx)

	const { data: activeTimetables } = await supabase
		.from("timetables")
		.select("id")
		.eq("club_id", clubId)
		.eq("is_active", true)
	const activeIds = (activeTimetables ?? []).map((t) => t.id)
	const scopeIds = activeIds.length > 0 ? activeIds : [timetableId]

	const { data: others } = await supabase
		.from("lessons")
		.select("id, start_at, end_at, trainer_id, room_id, student_id, couple_id, group_id")
		.in("timetable_id", scopeIds)
		.neq("id", lesson.id)
		.is("cancelled_at", null)
		.gte("start_at", `${date}T00:00:00`)
		.lte("start_at", `${date}T23:59:59.999`)

	for (const o of others ?? []) {
		const oDate = o.start_at.slice(0, 10)
		if (oDate !== date) continue
		const oStart = o.start_at.slice(11, 16)
		const oEnd = o.end_at.slice(11, 16)
		if (!timeOverlaps(newStartTime, newEndTime, oStart, oEnd)) continue

		if (lesson.trainer_id && o.trainer_id === lesson.trainer_id) {
			issues.push("Trainer already has another lesson at this time")
			break
		}
		if (lesson.room_id && o.room_id === lesson.room_id) {
			issues.push("Room already has another lesson at this time")
			break
		}
		if (lesson.student_id && o.student_id === lesson.student_id) {
			issues.push("Student already has another lesson at this time")
			break
		}
		if (lesson.couple_id && o.couple_id === lesson.couple_id) {
			issues.push("Couple already has another lesson at this time")
			break
		}
		if (lesson.group_id && o.group_id === lesson.group_id) {
			issues.push("Group already has another lesson at this time")
			break
		}
		const otherUserIds = getLessonUserIds(o, memberCtx)
		if (sharesUser(lessonUserIds, otherUserIds)) {
			issues.push("One of the participants already has another lesson at this time")
			break
		}
	}

	if (issues.length > 0) {
		return NextResponse.json(
			{
				error: "Availabilities not met",
				issues,
			},
			{ status: 400 }
		)
	}

	// All good – update lesson times
	const { error: updateError, data: updated } = await supabase
		.from("lessons")
		.update({ start_at: newStartAt, end_at: newEndAt })
		.eq("id", lesson.id)
		.select("id, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id, group_lesson_type_id, lesson_type")
		.maybeSingle()

	if (updateError || !updated) {
		return NextResponse.json({ error: updateError?.message ?? "Failed to update lesson" }, { status: 500 })
	}

	// Optionally propagate the same time shift to all other occurrences of
	// this recurring series. A "series" is inferred from
	//   (timetable, lesson_type, trainer, participant, weekday, HH:MM)
	// and — crucially — sibling rank within a week (see lib/lesson-pattern.ts).
	// This means when two distinct lessons happen to share that fingerprint
	// in the same week (e.g. legacy data with duplicate placements), moving
	// the one the user clicked only shifts the corresponding sibling in
	// every other week, not all same-time lessons.
	let futureMoved = 0
	let futureSkipped = 0
	if (scope === "all_future") {
		const oldStartMs = new Date(lesson.start_at).getTime()
		const newStartMs = new Date(newStartAt).getTime()
		const deltaMs = newStartMs - oldStartMs

		if (deltaMs !== 0) {
			const siblings = await fetchMatchingSiblings(supabase, {
				id: lesson.id,
				timetable_id: timetableId,
				start_at: lesson.start_at,
				end_at: lesson.end_at,
				lesson_type: lesson.lesson_type,
				trainer_id: lesson.trainer_id ?? null,
				student_id: lesson.student_id ?? null,
				couple_id: lesson.couple_id ?? null,
				group_id: lesson.group_id ?? null,
			})

			for (const c of siblings) {
				const newOccStart = new Date(new Date(c.start_at).getTime() + deltaMs)
				const newOccEnd = new Date(new Date(c.end_at).getTime() + deltaMs)
				const { error } = await supabase
					.from("lessons")
					.update({ start_at: newOccStart.toISOString(), end_at: newOccEnd.toISOString() })
					.eq("id", c.id)
				if (error) {
					futureSkipped++
				} else {
					futureMoved++
				}
			}
		}
	}

	return NextResponse.json({ lesson: updated, future_moved: futureMoved, future_skipped: futureSkipped, scope })
}

