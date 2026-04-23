import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
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

export type ShortfallTimetableSummary = {
	timetable_id: string
	name: string
	missing_lessons: number
}

/**
 * List active timetables that have at least one target (individual/couple or group)
 * with fewer lessons in the count window than `desired_*` (same as `/timetables/[id]/shortfalls`:
 * per ISO week, Sat–Sun for weekend-only, per calendar month for monthly, 14 days for bi-weekly).
 */
export async function GET(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth
	if (!isTrainer) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

	const { searchParams } = new URL(request.url)
	const weekStart = searchParams.get("week_start")
	const monday = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
		? weekStartMonday(weekStart)
		: weekStartMonday(new Date().toISOString().slice(0, 10))

	const { data: activeTt, error: ttError } = await supabase
		.from("timetables")
		.select("id, name, recurrence, is_active")
		.eq("club_id", clubId)
		.eq("is_active", true)
	if (ttError) {
		return NextResponse.json({ error: ttError.message }, { status: 500 })
	}

	const items: ShortfallTimetableSummary[] = []

	for (const tt of activeTt ?? []) {
		const { data: targets } = await supabase
			.from("timetable_targets")
			.select("id, student_id, couple_id, desired_lessons_count")
			.eq("timetable_id", tt.id)
		const { data: groupTargets } = await supabase
			.from("timetable_group_targets")
			.select("id, group_id, group_lesson_type_id, desired_lessons_count")
			.eq("timetable_id", tt.id)

		const isWeekendsOnly = tt.recurrence === "weekends_only"
		const countRange = shortfallLessonCountRange(monday, tt.recurrence, isWeekendsOnly)

		const { data: lesRaw } = await supabase
			.from("lessons")
			.select("student_id, couple_id, group_id, group_lesson_type_id")
			.eq("timetable_id", tt.id)
			.is("cancelled_at", null)
			.gte("start_at", countRange.from + "T00:00:00")
			.lte("start_at", countRange.to + "T23:59:59")
		const thisLessons = lesRaw ?? []

		let missing = 0
		for (const t of targets ?? []) {
			const actual = thisLessons.filter(
				(l) => l.student_id === t.student_id && l.couple_id === t.couple_id,
			).length
			if (actual < t.desired_lessons_count) {
				missing += t.desired_lessons_count - actual
			}
		}
		for (const gt of groupTargets ?? []) {
			const actual = thisLessons.filter(
				(l) => l.group_id === gt.group_id && l.group_lesson_type_id === gt.group_lesson_type_id,
			).length
			if (actual < gt.desired_lessons_count) {
				missing += gt.desired_lessons_count - actual
			}
		}
		if (missing > 0) {
			items.push({ timetable_id: tt.id, name: tt.name, missing_lessons: missing })
		}
	}

	// Name sort for stable UI
	items.sort((a, b) => a.name.localeCompare(b.name))
	return NextResponse.json({ week_start: monday, items })
}
