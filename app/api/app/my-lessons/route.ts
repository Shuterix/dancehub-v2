import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
	const supabase = await createClient()
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()
	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const { data: profile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()
	if (!profile?.club_id) {
		return NextResponse.json({ lessons: [] })
	}

	const now = new Date().toISOString()

	// My couple ids (I am partner1 or partner2)
	const { data: myCouples } = await supabase
		.from("couples")
		.select("id")
		.or(`partner1_user_id.eq.${user.id},partner2_user_id.eq.${user.id}`)
	const myCoupleIds = new Set((myCouples ?? []).map((c) => c.id))

	// My group ids (I am member as user or via my couples)
	const { data: groupMembers } = await supabase
		.from("group_members")
		.select("group_id, user_id, couple_id")
	const myGroupIds = new Set<string>()
	for (const m of groupMembers ?? []) {
		if (m.user_id === user.id) myGroupIds.add(m.group_id)
		if (m.couple_id && myCoupleIds.has(m.couple_id)) myGroupIds.add(m.group_id)
	}

	// Upcoming lessons in my club (not cancelled)
	const { data: timetableRows } = await supabase
		.from("timetables")
		.select("id")
		.eq("club_id", profile.club_id)
	const timetableIds = (timetableRows ?? []).map((t) => t.id)
	if (timetableIds.length === 0) {
		return NextResponse.json({ lessons: [] })
	}

	const { data: lessons, error: lError } = await supabase
		.from("lessons")
		.select("id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id, group_lesson_type_id")
		.in("timetable_id", timetableIds)
		.gt("start_at", now)
		.is("cancelled_at", null)
		.order("start_at", { ascending: true })

	if (lError) {
		return NextResponse.json({ error: lError.message }, { status: 500 })
	}

	// Keep only lessons where I am student, trainer, in the couple, or in the group
	const mine = (lessons ?? []).filter(
		(l) =>
			l.student_id === user.id ||
			l.trainer_id === user.id ||
			(l.couple_id != null && myCoupleIds.has(l.couple_id)) ||
			(l.group_id != null && myGroupIds.has(l.group_id))
	)

	const lessonIds = mine.map((l) => l.id)
	const trainerIds = [...new Set(mine.map((l) => l.trainer_id).filter(Boolean) as string[])]
	const studentIds = mine.map((l) => l.student_id).filter(Boolean) as string[]
	const coupleIds = mine.map((l) => l.couple_id).filter(Boolean) as string[]
	const groupIds = mine.map((l) => l.group_id).filter(Boolean) as string[]
	const groupTypeIds = mine.map((l) => l.group_lesson_type_id).filter(Boolean) as string[]
	const roomIds = mine.map((l) => l.room_id).filter(Boolean) as string[]

	const { data: profiles } =
		trainerIds.length + studentIds.length > 0
			? await supabase.from("profiles").select("id, full_name").in("id", [...trainerIds, ...studentIds])
			: { data: [] }
	const { data: couples } =
		coupleIds.length > 0
			? await supabase.from("couples").select("id, name, partner1_user_id, partner2_user_id").in("id", coupleIds)
			: { data: [] }
	const { data: groups } =
		groupIds.length > 0
			? await supabase.from("groups").select("id, name").in("id", groupIds)
			: { data: [] }
	const { data: groupTypes } =
		groupTypeIds.length > 0
			? await supabase.from("group_lesson_types").select("id, name").in("id", groupTypeIds)
			: { data: [] }
	const { data: rooms } =
		roomIds.length > 0
			? await supabase.from("rooms").select("id, name").in("id", roomIds)
			: { data: [] }

	const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? ""]))
	const roomMap = new Map((rooms ?? []).map((r) => [r.id, r.name]))
	const groupMap = new Map((groups ?? []).map((g) => [g.id, g.name ?? ""]))
	const typeMap = new Map((groupTypes ?? []).map((t) => [t.id, t.name ?? ""]))

	function label(l: (typeof mine)[0]): string {
		if (l.lesson_type === "group" && l.group_id && l.group_lesson_type_id) {
			const g = groupMap.get(l.group_id) ?? ""
			const t = typeMap.get(l.group_lesson_type_id) ?? ""
			return g && t ? `${g} – ${t}` : g || t || "Group"
		}
		if (l.student_id) return profileMap.get(l.student_id) ?? "—"
		const c = (couples ?? []).find((x) => x.id === l.couple_id)
		if (!c) return "—"
		if (c.name?.trim()) return c.name
		const names = [c.partner1_user_id, c.partner2_user_id].map((id) => profileMap.get(id ?? "")).filter(Boolean)
		return names.length ? names.join(" & ") : "Couple"
	}

	const list = mine.map((l) => ({
		id: l.id,
		lesson_type: l.lesson_type,
		start_at: l.start_at,
		end_at: l.end_at,
		room_id: l.room_id,
		room_name: l.room_id ? roomMap.get(l.room_id) ?? null : null,
		trainer_id: l.trainer_id,
		trainer_name: l.trainer_id ? profileMap.get(l.trainer_id) ?? null : null,
		label: label(l),
		is_trainer: l.trainer_id === user.id,
	}))

	return NextResponse.json({ lessons: list })
}
