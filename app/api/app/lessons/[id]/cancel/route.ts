import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function PATCH(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: lessonId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()
	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	let body: { note?: string } = {}
	try {
		body = await _request.json()
	} catch {
		// optional body
	}
	const note = typeof body.note === "string" ? body.note.trim() : ""

	const { data: lesson, error: fetchError } = await supabase
		.from("lessons")
		.select("id, timetable_id, student_id, trainer_id, couple_id, group_id, cancelled_at")
		.eq("id", lessonId)
		.single()

	if (fetchError || !lesson) {
		return NextResponse.json({ error: "Lesson not found" }, { status: 404 })
	}
	if (lesson.cancelled_at) {
		return NextResponse.json({ error: "Lesson is already cancelled" }, { status: 400 })
	}

	// Must be in same club (via timetable)
	const { data: timetable } = await supabase
		.from("timetables")
		.select("club_id")
		.eq("id", lesson.timetable_id)
		.single()
	if (!timetable) {
		return NextResponse.json({ error: "Lesson not found" }, { status: 404 })
	}

	const { data: profile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()
	if (profile?.club_id !== timetable.club_id) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	// Allowed if I am the student, trainer, in the couple, or in the group
	const isTrainer = lesson.trainer_id === user.id
	const isStudent = lesson.student_id === user.id
	let isInCouple = false
	if (lesson.couple_id) {
		const { data: couple } = await supabase
			.from("couples")
			.select("partner1_user_id, partner2_user_id")
			.eq("id", lesson.couple_id)
			.single()
		isInCouple = couple?.partner1_user_id === user.id || couple?.partner2_user_id === user.id
	}
	let isInGroup = false
	if (lesson.group_id) {
		const { data: myCouples } = await supabase
			.from("couples")
			.select("id")
			.or(`partner1_user_id.eq.${user.id},partner2_user_id.eq.${user.id}`)
		const myCoupleIds = new Set((myCouples ?? []).map((c) => c.id))
		const { data: members } = await supabase
			.from("group_members")
			.select("user_id, couple_id")
			.eq("group_id", lesson.group_id)
		isInGroup = (members ?? []).some(
			(m) => m.user_id === user.id || (m.couple_id != null && myCoupleIds.has(m.couple_id))
		)
	}

	if (!isTrainer && !isStudent && !isInCouple && !isInGroup) {
		return NextResponse.json({ error: "You can only cancel lessons you are part of" }, { status: 403 })
	}

	const { error: updateError } = await supabase
		.from("lessons")
		.update({
			cancelled_at: new Date().toISOString(),
			cancelled_by: user.id,
			cancellation_note: note || null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", lessonId)

	if (updateError) {
		return NextResponse.json({ error: updateError.message }, { status: 500 })
	}

	return NextResponse.json({ ok: true })
}
