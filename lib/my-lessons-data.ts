import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { CookieStore } from "@/lib/supabase/server"
import { getPeriodEndForRange } from "@/lib/my-lessons-range"
import type { LessonItem } from "./my-lessons-data.types"

export type { LessonItem } from "./my-lessons-data.types"

export type MyLessonsParams = {
	range?: "week" | "two_weeks" | "month" | "year"
	from?: string
	to?: string
	timetableIds?: string[]
}

export type MyLessonsResult =
	| { ok: true; lessons: LessonItem[]; availableTimetables: Array<{ id: string; name: string | null }> }
	| { ok: false; status: 401 }

export const getMyLessonsData = cache(async (
	cookieStore: CookieStore,
	params: MyLessonsParams = {}
): Promise<MyLessonsResult> => {
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()
	if (userError || !user) {
		return { ok: false, status: 401 }
	}

	const { data: profile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()
	if (!profile?.club_id) {
		return { ok: true, lessons: [], availableTimetables: [] }
	}

	const range = params.range ?? "week"
	const fromDate = params.from
	const toDate = params.to
	const isCustomRange =
		typeof fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) &&
		typeof toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(toDate) &&
		fromDate <= toDate

	const now = new Date().toISOString()

	const { data: myCouples } = await supabase
		.from("couples")
		.select("id")
		.or(`partner1_user_id.eq.${user.id},partner2_user_id.eq.${user.id}`)
	const myCoupleIds = new Set((myCouples ?? []).map((c) => c.id))

	const { data: groupMembers } = await supabase
		.from("group_members")
		.select("group_id, user_id, couple_id")
	const myGroupIds = new Set<string>()
	for (const m of groupMembers ?? []) {
		if (m.user_id === user.id) myGroupIds.add(m.group_id)
		if (m.couple_id && myCoupleIds.has(m.couple_id)) myGroupIds.add(m.group_id)
	}

	const { data: timetableRows } = await supabase
		.from("timetables")
		.select("id, name")
		.eq("club_id", profile.club_id)
		.order("name")
	const allTimetableIds = (timetableRows ?? []).map((t) => t.id)
	const availableTimetables = (timetableRows ?? []).map((t) => ({ id: t.id, name: t.name ?? null }))
	if (allTimetableIds.length === 0) {
		return { ok: true, lessons: [], availableTimetables }
	}

	const filterTimetableIds = params.timetableIds?.length
		? params.timetableIds.filter((id) => allTimetableIds.includes(id))
		: null
	const timetableIds = filterTimetableIds?.length ? filterTimetableIds : allTimetableIds

	const oneYearFromNow = new Date()
	oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
	const oneYearIso = oneYearFromNow.toISOString()

	let query = supabase
		.from("lessons")
		.select("id, timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, group_id, group_lesson_type_id, cancelled_at, cancellation_note")
		.in("timetable_id", timetableIds)
		.order("start_at", { ascending: true })
	if (isCustomRange && fromDate && toDate) {
		query = query
			.gte("start_at", fromDate + "T00:00:00.000")
			.lte("start_at", toDate + "T23:59:59.999")
	} else {
		query = query.gt("start_at", now)
		if (range === "year") {
			query = query.lte("start_at", oneYearIso)
		}
	}
	const { data: lessons, error: lError } = await query

	if (lError) {
		return { ok: true, lessons: [], availableTimetables }
	}

	const mine = (lessons ?? []).filter(
		(l) =>
			l.student_id === user.id ||
			l.trainer_id === user.id ||
			(l.couple_id != null && myCoupleIds.has(l.couple_id)) ||
			(l.group_id != null && myGroupIds.has(l.group_id))
	)

	const periodEnd = isCustomRange ? null : getPeriodEndForRange(range)
	const mineFiltered = periodEnd === null ? mine : mine.filter((l) => l.start_at <= periodEnd)

	const trainerIds = [...new Set(mineFiltered.map((l) => l.trainer_id).filter(Boolean) as string[])]
	const studentIds = mineFiltered.map((l) => l.student_id).filter(Boolean) as string[]
	const coupleIds = mineFiltered.map((l) => l.couple_id).filter(Boolean) as string[]
	const groupIds = mineFiltered.map((l) => l.group_id).filter(Boolean) as string[]
	const groupTypeIds = mineFiltered.map((l) => l.group_lesson_type_id).filter(Boolean) as string[]
	const roomIds = mineFiltered.map((l) => l.room_id).filter(Boolean) as string[]

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
	const timetableIdsInLessons = [...new Set(mineFiltered.map((l) => l.timetable_id).filter(Boolean))] as string[]
	const { data: timetables } =
		timetableIdsInLessons.length > 0
			? await supabase.from("timetables").select("id, name").in("id", timetableIdsInLessons)
			: { data: [] }
	const timetableMap = new Map((timetables ?? []).map((t) => [t.id, t.name ?? ""]))
	const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? ""]))
	const roomMap = new Map((rooms ?? []).map((r) => [r.id, r.name]))
	const groupMap = new Map((groups ?? []).map((g) => [g.id, g.name ?? ""]))
	const typeMap = new Map((groupTypes ?? []).map((t) => [t.id, t.name ?? ""]))

	function label(l: (typeof mineFiltered)[0]): string {
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

	const list: LessonItem[] = mineFiltered.map((l) => ({
		id: l.id,
		timetable_id: l.timetable_id,
		timetable_name: timetableMap.get(l.timetable_id) ?? null,
		lesson_type: l.lesson_type,
		start_at: l.start_at,
		end_at: l.end_at,
		room_name: l.room_id ? roomMap.get(l.room_id) ?? null : null,
		trainer_name: l.trainer_id ? profileMap.get(l.trainer_id) ?? null : null,
		label: label(l),
		is_trainer: l.trainer_id === user.id,
		cancelled_at: l.cancelled_at ?? null,
		cancellation_note: l.cancellation_note ?? null,
	}))

	return { ok: true, lessons: list, availableTimetables }
})
