import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

const RECURRENCE_VALUES = ["weekly", "bi_weekly", "monthly", "weekends_only", "fixed_period"] as const

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

function parseTime(s: unknown): string | null {
	if (typeof s !== "string") return null
	if (/^\d{1,2}:\d{2}$/.test(s)) return s
	const n = parseInt(s, 10)
	if (Number.isInteger(n) && n >= 0 && n <= 23) return `${String(n).padStart(2, "0")}:00`
	return null
}

function parseDate(s: unknown): string | null {
	if (typeof s !== "string") return null
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
	return null
}

export async function GET() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId } = auth

	const { data: rows, error } = await supabase
		.from("timetables")
		.select("id, name, recurrence, valid_from, valid_until, is_active, paused_at, day_start, day_end, created_at")
		.eq("club_id", clubId)
		.order("created_at", { ascending: false })

	if (error) return NextResponse.json({ error: error.message }, { status: 500 })

	const timetables = (rows ?? []).map((t) => ({
		id: t.id,
		name: t.name,
		recurrence: t.recurrence,
		valid_from: t.valid_from,
		valid_until: t.valid_until ?? null,
		is_active: t.is_active,
		paused_at: t.paused_at ?? null,
		day_start: t.day_start,
		day_end: t.day_end,
		created_at: t.created_at,
	}))

	return NextResponse.json({ timetables })
}

export async function POST(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	let body: {
		name?: string
		recurrence?: string
		valid_from?: string
		valid_until?: string
		day_start?: string
		day_end?: string
		duplicate_from_id?: string
	}
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	const duplicateFromId = typeof body.duplicate_from_id === "string" ? body.duplicate_from_id.trim() : null

	if (duplicateFromId) {
		// Duplicate existing timetable
		const { data: source, error: sourceError } = await supabase
			.from("timetables")
			.select("id, name, recurrence, valid_from, valid_until, day_start, day_end")
			.eq("id", duplicateFromId)
			.eq("club_id", clubId)
			.single()
		if (sourceError || !source) {
			return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
		}

		const newName = typeof body.name === "string" ? body.name.trim() : `${source.name} (copy)`
		if (!newName) return NextResponse.json({ error: "Name is required" }, { status: 400 })

		const { data: newTimetable, error: insertError } = await supabase
			.from("timetables")
			.insert({
				club_id: clubId,
				name: newName,
				recurrence: source.recurrence,
				valid_from: source.valid_from,
				valid_until: source.valid_until,
				day_start: source.day_start,
				day_end: source.day_end,
			})
			.select("id")
			.single()
		if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

		const { data: prefs } = await supabase
			.from("timetable_preferences")
			.select("*")
			.eq("timetable_id", duplicateFromId)
			.single()
		if (prefs) {
			await supabase.from("timetable_preferences").insert({
				timetable_id: newTimetable.id,
				individual_lesson_duration_minutes: prefs.individual_lesson_duration_minutes,
				max_consecutive_minutes_per_trainer: prefs.max_consecutive_minutes_per_trainer,
				min_break_minutes_after_consecutive: prefs.min_break_minutes_after_consecutive,
				preferred_min_teaching_minutes_per_day: prefs.preferred_min_teaching_minutes_per_day,
				distribution: prefs.distribution,
				buffer_between_lessons_minutes: prefs.buffer_between_lessons_minutes,
			})
		}

		const { data: targets } = await supabase.from("timetable_targets").select("student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id").eq("timetable_id", duplicateFromId)
		if (targets?.length) {
			await supabase.from("timetable_targets").insert(
				targets.map((t) => ({
					timetable_id: newTimetable.id,
					student_id: t.student_id,
					couple_id: t.couple_id,
					desired_lessons_count: t.desired_lessons_count,
					priority: t.priority,
					preferred_trainer_id: t.preferred_trainer_id ?? null,
				}))
			)
		}

		const { data: limits } = await supabase.from("timetable_trainer_limits").select("user_id, max_lessons_per_day").eq("timetable_id", duplicateFromId)
		if (limits?.length) {
			await supabase.from("timetable_trainer_limits").insert(
				limits.map((l) => ({
					timetable_id: newTimetable.id,
					user_id: l.user_id,
					max_lessons_per_day: l.max_lessons_per_day,
				}))
			)
		}

		return NextResponse.json({ id: newTimetable.id })
	}

	// Create new
	const name = typeof body.name === "string" ? body.name.trim() : ""
	if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

	const recurrence = RECURRENCE_VALUES.includes(body.recurrence as (typeof RECURRENCE_VALUES)[number])
		? (body.recurrence as (typeof RECURRENCE_VALUES)[number])
		: "weekly"

	const validFrom = parseDate(body.valid_from)
	if (!validFrom) return NextResponse.json({ error: "Valid from date is required (YYYY-MM-DD)" }, { status: 400 })

	const validUntil = body.valid_until != null ? parseDate(body.valid_until) : null
	const dayStart = parseTime(body.day_start) ?? "08:00"
	const dayEnd = parseTime(body.day_end) ?? "22:00"

	const { data: newTimetable, error: insertError } = await supabase
		.from("timetables")
		.insert({
			club_id: clubId,
			name,
			recurrence,
			valid_from: validFrom,
			valid_until: validUntil,
			day_start: dayStart,
			day_end: dayEnd,
		})
		.select("id")
		.single()

	if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

	await supabase.from("timetable_preferences").insert({
		timetable_id: newTimetable.id,
	})

	return NextResponse.json({ id: newTimetable.id })
}
