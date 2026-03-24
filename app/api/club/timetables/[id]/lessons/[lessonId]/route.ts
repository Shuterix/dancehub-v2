import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { isAvailableAtSlot } from "@/lib/timetable-solver"
import type { AvailabilitySlot } from "@/lib/availability"

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

	let body: { date?: string; start_time?: string } = {}
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 })
	}

	const { date, start_time } = body
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

	// Conflicts with other lessons (trainer or room)
	if (lesson.trainer_id || lesson.room_id) {
		const { data: others } = await supabase
			.from("lessons")
			.select("id, start_at, end_at, trainer_id, room_id")
			.eq("timetable_id", timetableId)
			.neq("id", lesson.id)
			.gte("start_at", `${date}T00:00:00`)
			.lte("start_at", `${date}T23:59:59.999`)

		for (const o of others ?? []) {
			const oDate = o.start_at.slice(0, 10)
			if (oDate !== date) continue
			const oStart = o.start_at.slice(11, 16)
			const oEnd = o.end_at.slice(11, 16)
			// Trainer conflict
			if (lesson.trainer_id && o.trainer_id === lesson.trainer_id) {
				if (timeOverlaps(newStartTime, newEndTime, oStart, oEnd)) {
					issues.push("Trainer already has another lesson at this time")
					break
				}
			}
			// Room conflict
			if (lesson.room_id && o.room_id === lesson.room_id) {
				if (timeOverlaps(newStartTime, newEndTime, oStart, oEnd)) {
					issues.push("Room already has another lesson at this time")
					break
				}
			}
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

	return NextResponse.json({ lesson: updated })
}

