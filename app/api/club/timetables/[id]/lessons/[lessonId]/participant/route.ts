import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

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

	let body: { target_id?: string } = {}
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid body" }, { status: 400 })
	}

	if (!body.target_id) {
		return NextResponse.json({ error: "Missing target_id" }, { status: 400 })
	}

	// Ensure timetable belongs to club
	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id, club_id")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) {
		return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
	}

	// Load lesson to ensure it belongs to this timetable
	const { data: lesson, error: lError } = await supabase
		.from("lessons")
		.select("id, timetable_id, lesson_type")
		.eq("id", lessonId)
		.eq("timetable_id", timetableId)
		.single()
	if (lError || !lesson) {
		return NextResponse.json({ error: "Lesson not found" }, { status: 404 })
	}

	// Only allow changing participant for individual/couple lessons for now
	if (lesson.lesson_type !== "individual" && lesson.lesson_type !== "couple") {
		return NextResponse.json({ error: "Only individual or couple lessons can change participant" }, { status: 400 })
	}

	// Target must belong to this timetable
	const { data: target, error: targetError } = await supabase
		.from("timetable_targets")
		.select("id, student_id, couple_id")
		.eq("id", body.target_id)
		.eq("timetable_id", timetableId)
		.single()

	if (targetError || !target) {
		return NextResponse.json({ error: "Target not found for this timetable" }, { status: 404 })
	}

	const { error: updateError } = await supabase
		.from("lessons")
		.update({
			student_id: target.student_id ?? null,
			couple_id: target.couple_id ?? null,
			group_id: null,
			group_lesson_type_id: null,
		})
		.eq("id", lesson.id)

	if (updateError) {
		return NextResponse.json({ error: updateError.message }, { status: 500 })
	}

	return NextResponse.json({ ok: true })
}

