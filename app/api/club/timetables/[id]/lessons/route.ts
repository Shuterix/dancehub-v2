import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { weekStartMonday } from "@/lib/timetable-week"

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

	return { clubId: myProfile.club_id }
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: timetableId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId } = auth

	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id, recurrence")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) {
		return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
	}
	const recurrence = (timetable as { recurrence?: string }).recurrence ?? ""

	const { searchParams } = new URL(request.url)
	const weekStart = searchParams.get("week_start")
	const monday = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
		? weekStartMonday(weekStart)
		: weekStartMonday(new Date().toISOString().slice(0, 10))
	const weekEnd = new Date(monday + "T12:00:00")
	weekEnd.setDate(weekEnd.getDate() + 6)
	const weekEndStr = weekEnd.toISOString().slice(0, 10) + "T23:59:59.999"

	const { data: lessonsRaw, error: lError } = await supabase
		.from("lessons")
		.select("id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id, group_lesson_type_id, is_static, cancelled_at")
		.eq("timetable_id", timetableId)
		.gte("start_at", monday + "T00:00:00")
		.lte("start_at", weekEndStr)
		.order("start_at")
	const lessons = (lessonsRaw ?? []).filter((l) => {
		// Only affect timetable for static + not recurring: hide cancelled static fixed_period lessons
		if (l.is_static && l.cancelled_at && recurrence === "fixed_period") return false
		return true
	})

	if (lError) {
		return NextResponse.json({ error: lError.message }, { status: 500 })
	}

	const trainerIds = [...new Set((lessons ?? []).map((l) => l.trainer_id).filter(Boolean) as string[])]
	const studentIds = (lessons ?? []).map((l) => l.student_id).filter(Boolean) as string[]
	const coupleIds = (lessons ?? []).map((l) => l.couple_id).filter(Boolean) as string[]
	const roomIds = (lessons ?? []).map((l) => l.room_id).filter(Boolean) as string[]
	const groupIds = (lessons ?? []).map((l) => l.group_id).filter(Boolean) as string[]
	const groupLessonTypeIds = (lessons ?? []).map((l) => l.group_lesson_type_id).filter(Boolean) as string[]

	const { data: profiles } =
		trainerIds.length + studentIds.length > 0
			? await supabase
					.from("profiles")
					.select("id, full_name")
					.in("id", [...trainerIds, ...studentIds])
			: { data: [] }
	const { data: couples } =
		coupleIds.length > 0
			? await supabase.from("couples").select("id, name, partner1_user_id, partner2_user_id").in("id", coupleIds)
			: { data: [] }
	const { data: rooms } =
		roomIds.length > 0
			? await supabase.from("rooms").select("id, name").in("id", roomIds)
			: { data: [] }
	const { data: groups } =
		groupIds.length > 0
			? await supabase.from("groups").select("id, name").in("id", groupIds)
			: { data: [] }
	const { data: groupLessonTypes } =
		groupLessonTypeIds.length > 0
			? await supabase.from("group_lesson_types").select("id, name").in("id", groupLessonTypeIds)
			: { data: [] }

	const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? ""]))
	const roomMap = new Map((rooms ?? []).map((r) => [r.id, r.name]))
	const groupMap = new Map((groups ?? []).map((g) => [g.id, g.name ?? ""]))
	const groupTypeMap = new Map((groupLessonTypes ?? []).map((t) => [t.id, t.name ?? ""]))

	function lessonLabel(l: {
		student_id: string | null
		couple_id: string | null
		group_id?: string | null
		group_lesson_type_id?: string | null
	}): string {
		if (l.group_id != null && l.group_lesson_type_id != null) {
			const gName = groupMap.get(l.group_id) ?? ""
			const tName = groupTypeMap.get(l.group_lesson_type_id) ?? ""
			return gName && tName ? `${gName} – ${tName}` : gName || tName || "Group"
		}
		if (l.student_id) return profileMap.get(l.student_id) ?? "—"
		const c = (couples ?? []).find((x) => x.id === l.couple_id)
		if (!c) return "—"
		if (c.name?.trim()) return c.name
		const names = [c.partner1_user_id, c.partner2_user_id].map((uid) => profileMap.get(uid ?? "")).filter(Boolean)
		return names.length ? names.join(" & ") : "Couple"
	}

	const list = lessons.map((l) => ({
		id: l.id,
		lesson_type: l.lesson_type,
		start_at: l.start_at,
		end_at: l.end_at,
		room_id: l.room_id,
		room_name: l.room_id ? roomMap.get(l.room_id) ?? null : null,
		trainer_id: l.trainer_id,
		trainer_name: l.trainer_id ? profileMap.get(l.trainer_id) ?? null : null,
		student_id: l.student_id,
		couple_id: l.couple_id,
		group_id: l.group_id ?? null,
		group_lesson_type_id: l.group_lesson_type_id ?? null,
		label: lessonLabel(l),
		is_static: l.is_static,
		cancelled_at: l.cancelled_at ?? null,
	}))

	return NextResponse.json({ week_start: monday, lessons: list })
}
