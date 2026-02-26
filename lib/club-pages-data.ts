import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { CookieStore } from "@/lib/supabase/server"
import { getClubData } from "@/lib/club-data"
import type { RoomsPageData, LessonTypesPageData, TimetableRow, TimetablesPageData } from "./club-pages-data.types"

export type { RoomsPageData, LessonTypesPageData, TimetableRow, TimetablesPageData } from "./club-pages-data.types"

type Result<T> =
	| { ok: true; data: T }
	| { ok: false; status: 401 }
	| { ok: false; status: 404 }

export const getRoomsData = cache(async (cookieStore: CookieStore): Promise<Result<RoomsPageData>> => {
	const clubResult = await getClubData(cookieStore)
	if (!clubResult.ok) return clubResult
	const { data: clubData } = clubResult
	const clubId = clubData.club.id

	const supabase = createClient(cookieStore)
	const { data: rooms, error: roomsError } = await supabase
		.from("rooms")
		.select("id, name")
		.eq("club_id", clubId)
		.order("name")

	if (roomsError) return { ok: false, status: 404 }

	const roomIds = (rooms ?? []).map((r) => r.id)
	const teacherIdsByRoom = new Map<string, string[]>()
	if (roomIds.length > 0) {
		const { data: roomTeachers } = await supabase
			.from("room_teachers")
			.select("room_id, user_id")
			.in("room_id", roomIds)
		for (const rt of roomTeachers ?? []) {
			if (!teacherIdsByRoom.has(rt.room_id)) teacherIdsByRoom.set(rt.room_id, [])
			teacherIdsByRoom.get(rt.room_id)!.push(rt.user_id)
		}
	}

	const roomsWithTeachers = (rooms ?? []).map((r) => ({
		id: r.id,
		name: r.name,
		teacher_ids: teacherIdsByRoom.get(r.id) ?? [],
	}))

	return {
		ok: true,
		data: {
			club: clubData.club,
			isTrainer: clubData.isTrainer,
			allTrainers: clubData.allTrainers.map((t) => ({ user_id: t.user_id, full_name: t.full_name })),
			rooms: roomsWithTeachers,
		},
	}
})

export const getLessonTypesData = cache(async (cookieStore: CookieStore): Promise<Result<LessonTypesPageData>> => {
	const clubResult = await getClubData(cookieStore)
	if (!clubResult.ok) return clubResult
	const { data: clubData } = clubResult
	const clubId = clubData.club.id

	const supabase = createClient(cookieStore)
	const { data: types, error: typesError } = await supabase
		.from("group_lesson_types")
		.select("id, group_id, name, duration_minutes")
		.eq("club_id", clubId)
		.order("name")

	if (typesError) return { ok: false, status: 404 }

	const groupIds = [...new Set((types ?? []).map((t) => t.group_id))]
	const groupByName = new Map<string, string>()
	if (groupIds.length > 0) {
		const { data: groups } = await supabase
			.from("groups")
			.select("id, name")
			.in("id", groupIds)
		for (const g of groups ?? []) {
			groupByName.set(g.id, g.name ?? "Unnamed group")
		}
	}

	const groupLessonTypes = (types ?? []).map((t) => ({
		id: t.id,
		group_id: t.group_id,
		group_name: groupByName.get(t.group_id) ?? "",
		name: t.name,
		duration_minutes: t.duration_minutes,
	}))

	return {
		ok: true,
		data: {
			club: clubData.club,
			isTrainer: clubData.isTrainer,
			groups: clubData.groups.map((g) => ({ id: g.id, name: g.name })),
			group_lesson_types: groupLessonTypes,
		},
	}
})

export const getTimetablesData = cache(async (cookieStore: CookieStore): Promise<Result<TimetablesPageData>> => {
	const clubResult = await getClubData(cookieStore)
	if (!clubResult.ok) return clubResult
	const { data: clubData } = clubResult
	const clubId = clubData.club.id

	const supabase = createClient(cookieStore)
	const { data: rows, error } = await supabase
		.from("timetables")
		.select("id, name, recurrence, valid_from, valid_until, is_active, paused_at, day_start, day_end, created_at")
		.eq("club_id", clubId)
		.order("created_at", { ascending: false })

	if (error) return { ok: false, status: 404 }

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

	return {
		ok: true,
		data: {
			club: clubData.club,
			isTrainer: clubData.isTrainer,
			timetables,
		},
	}
})
