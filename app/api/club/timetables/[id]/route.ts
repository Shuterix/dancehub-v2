import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

const RECURRENCE_VALUES = ["weekly", "bi_weekly", "monthly", "weekends_only", "fixed_period"] as const
const DISTRIBUTION_VALUES = ["first_half", "second_half", "same"] as const
const PRIORITY_VALUES = ["high", "medium", "low"] as const

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

export async function GET(
	_request: Request,
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
		.select("id, name, recurrence, valid_from, valid_until, is_active, paused_at, day_start, day_end, created_at")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) {
		return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
	}

	const { data: prefs } = await supabase
		.from("timetable_preferences")
		.select("*")
		.eq("timetable_id", timetableId)
		.single()

	const { data: targets } = await supabase
		.from("timetable_targets")
		.select("id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id")
		.eq("timetable_id", timetableId)

	const { data: limits } = await supabase
		.from("timetable_trainer_limits")
		.select("id, user_id, max_lessons_per_day")
		.eq("timetable_id", timetableId)

	const { data: groupTargets } = await supabase
		.from("timetable_group_targets")
		.select("id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id")
		.eq("timetable_id", timetableId)

	const { data: clubGroups } = await supabase
		.from("groups")
		.select("id, name")
		.eq("club_id", clubId)
	const { data: clubGroupLessonTypes } = await supabase
		.from("group_lesson_types")
		.select("id, group_id, name, duration_minutes")
		.eq("club_id", clubId)

	const studentIds = (targets ?? []).map((t) => t.student_id).filter(Boolean) as string[]
	const coupleIds = (targets ?? []).map((t) => t.couple_id).filter(Boolean) as string[]
	const trainerIds = (limits ?? []).map((l) => l.user_id)
	const preferredTrainerIds = [
		...(targets ?? []).map((t) => t.preferred_trainer_id).filter(Boolean) as string[],
		...(groupTargets ?? []).map((g) => g.preferred_trainer_id).filter(Boolean) as string[],
	]

	const { data: couples } =
		coupleIds.length > 0
			? await supabase.from("couples").select("id, name, partner1_user_id, partner2_user_id").in("id", coupleIds)
			: { data: [] }

	const partnerIds = (couples ?? []).flatMap((c) => [c.partner1_user_id, c.partner2_user_id]).filter(Boolean) as string[]
	const allUserIds = [...new Set([...studentIds, ...trainerIds, ...partnerIds, ...preferredTrainerIds])]

	const { data: profiles } =
		allUserIds.length > 0
			? await supabase.from("profiles").select("id, full_name").in("id", allUserIds)
			: { data: [] }

	const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? ""]))

	function targetLabel(t: { student_id: string | null; couple_id: string | null }): string {
		if (t.student_id) return profileMap.get(t.student_id) ?? "Unknown"
		const c = (couples ?? []).find((x) => x.id === t.couple_id)
		if (!c) return "Unknown"
		if (c.name?.trim()) return c.name
		const names = [c.partner1_user_id, c.partner2_user_id].map((uid) => profileMap.get(uid ?? "")).filter(Boolean)
		return names.length ? names.join(" & ") : "Unnamed couple"
	}

	const targetsWithNames = (targets ?? []).map((t) => ({
		id: t.id,
		student_id: t.student_id,
		couple_id: t.couple_id,
		desired_lessons_count: t.desired_lessons_count,
		priority: t.priority,
		preferred_trainer_id: t.preferred_trainer_id ?? null,
		preferred_trainer_name: t.preferred_trainer_id ? (profileMap.get(t.preferred_trainer_id) ?? "") : null,
		label: targetLabel(t),
	}))

	const trainer_limits = (limits ?? []).map((l) => ({
		id: l.id,
		user_id: l.user_id,
		full_name: profileMap.get(l.user_id) ?? "",
		max_lessons_per_day: l.max_lessons_per_day,
	}))

	const groupMap = new Map((clubGroups ?? []).map((g) => [g.id, g.name ?? ""]))
	const typeMap = new Map((clubGroupLessonTypes ?? []).map((t) => [t.id, { name: t.name ?? "", group_id: t.group_id }]))
	const group_targets = (groupTargets ?? []).map((gt) => {
		const typeInfo = typeMap.get(gt.group_lesson_type_id)
		const groupName = groupMap.get(gt.group_id) ?? ""
		const typeName = typeInfo?.name ?? ""
		const label = groupName && typeName ? `${groupName} – ${typeName}` : groupName || typeName || "Group lesson"
		return {
			id: gt.id,
			group_id: gt.group_id,
			group_lesson_type_id: gt.group_lesson_type_id,
			label,
			desired_lessons_count: gt.desired_lessons_count,
			priority: gt.priority,
			preferred_trainer_id: gt.preferred_trainer_id ?? null,
			preferred_trainer_name: gt.preferred_trainer_id ? (profileMap.get(gt.preferred_trainer_id) ?? "") : null,
		}
	})

	const groups = (clubGroups ?? []).map((g) => ({ id: g.id, name: g.name ?? "" }))
	const group_lesson_types = (clubGroupLessonTypes ?? []).map((t) => ({
		id: t.id,
		group_id: t.group_id,
		name: t.name ?? "",
		duration_minutes: t.duration_minutes,
	}))

	return NextResponse.json({
		timetable: {
			id: timetable.id,
			name: timetable.name,
			recurrence: timetable.recurrence,
			valid_from: timetable.valid_from,
			valid_until: timetable.valid_until ?? null,
			is_active: timetable.is_active,
			paused_at: timetable.paused_at ?? null,
			day_start: timetable.day_start,
			day_end: timetable.day_end,
			created_at: timetable.created_at,
		},
		preferences: prefs
			? {
					individual_lesson_duration_minutes: prefs.individual_lesson_duration_minutes,
					max_consecutive_minutes_per_trainer: prefs.max_consecutive_minutes_per_trainer,
					min_break_minutes_after_consecutive: prefs.min_break_minutes_after_consecutive,
					preferred_min_teaching_minutes_per_day: prefs.preferred_min_teaching_minutes_per_day ?? null,
					distribution: prefs.distribution,
					buffer_between_lessons_minutes: prefs.buffer_between_lessons_minutes,
			  }
			: null,
		targets: targetsWithNames,
		group_targets,
		trainer_limits,
		groups,
		group_lesson_types,
	})
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: timetableId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) {
		return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
	}

	let body: {
		name?: string
		recurrence?: string
		valid_from?: string
		valid_until?: string
		is_active?: boolean
		day_start?: string
		day_end?: string
		preferences?: Record<string, unknown>
		targets?: Array<{ student_id?: string; couple_id?: string; desired_lessons_count: number; priority: string; preferred_trainer_id?: string | null }>
		group_targets?: Array<{
			group_id: string
			group_lesson_type_id: string
			desired_lessons_count: number
			priority?: string
			preferred_trainer_id?: string | null
		}>
		trainer_limits?: Array<{ user_id: string; max_lessons_per_day: number }>
	}
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	if (typeof body.name === "string") {
		const name = body.name.trim()
		if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
		await supabase.from("timetables").update({ name, updated_at: new Date().toISOString() }).eq("id", timetableId)
	}
	if (RECURRENCE_VALUES.includes(body.recurrence as (typeof RECURRENCE_VALUES)[number])) {
		await supabase.from("timetables").update({ recurrence: body.recurrence, updated_at: new Date().toISOString() }).eq("id", timetableId)
	}
	if (body.valid_from != null) {
		const d = parseDate(body.valid_from)
		if (d) await supabase.from("timetables").update({ valid_from: d, updated_at: new Date().toISOString() }).eq("id", timetableId)
	}
	if (body.valid_until !== undefined) {
		const d = body.valid_until === null || body.valid_until === "" ? null : parseDate(body.valid_until)
		await supabase.from("timetables").update({ valid_until: d, updated_at: new Date().toISOString() }).eq("id", timetableId)
	}
	if (typeof body.is_active === "boolean") {
		await supabase
			.from("timetables")
			.update({ is_active: body.is_active, paused_at: body.is_active ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
			.eq("id", timetableId)
		// When disabling: delete all non-static lessons so the timetable can be generated again later with same settings
		if (body.is_active === false) {
			const { data: toDelete } = await supabase
				.from("lessons")
				.select("id")
				.eq("timetable_id", timetableId)
				.eq("is_static", false)
			const ids = (toDelete ?? []).map((r) => r.id)
			if (ids.length > 0) {
				for (let i = 0; i < ids.length; i += 200) {
					await supabase.from("lessons").delete().in("id", ids.slice(i, i + 200))
				}
			}
		}
	}
	if (body.day_start != null) {
		const t = parseTime(body.day_start)
		if (t) await supabase.from("timetables").update({ day_start: t, updated_at: new Date().toISOString() }).eq("id", timetableId)
	}
	if (body.day_end != null) {
		const t = parseTime(body.day_end)
		if (t) await supabase.from("timetables").update({ day_end: t, updated_at: new Date().toISOString() }).eq("id", timetableId)
	}

	if (body.preferences && typeof body.preferences === "object") {
		const p = body.preferences
		const updates: Record<string, unknown> = {}
		if (typeof p.individual_lesson_duration_minutes === "number" && p.individual_lesson_duration_minutes > 0) updates.individual_lesson_duration_minutes = p.individual_lesson_duration_minutes
		if (typeof p.max_consecutive_minutes_per_trainer === "number" && p.max_consecutive_minutes_per_trainer > 0) updates.max_consecutive_minutes_per_trainer = p.max_consecutive_minutes_per_trainer
		if (typeof p.min_break_minutes_after_consecutive === "number" && p.min_break_minutes_after_consecutive >= 0) updates.min_break_minutes_after_consecutive = p.min_break_minutes_after_consecutive
		if (p.preferred_min_teaching_minutes_per_day !== undefined) updates.preferred_min_teaching_minutes_per_day = p.preferred_min_teaching_minutes_per_day === null || p.preferred_min_teaching_minutes_per_day === "" ? null : (typeof p.preferred_min_teaching_minutes_per_day === "number" ? p.preferred_min_teaching_minutes_per_day : null)
		if (DISTRIBUTION_VALUES.includes(p.distribution as (typeof DISTRIBUTION_VALUES)[number])) updates.distribution = p.distribution
		if (typeof p.buffer_between_lessons_minutes === "number" && p.buffer_between_lessons_minutes >= 0) updates.buffer_between_lessons_minutes = p.buffer_between_lessons_minutes
		if (Object.keys(updates).length > 0) {
			updates.updated_at = new Date().toISOString()
			await supabase.from("timetable_preferences").update(updates).eq("timetable_id", timetableId)
		}
	}

	if (Array.isArray(body.targets)) {
		await supabase.from("timetable_targets").delete().eq("timetable_id", timetableId)
		const valid = body.targets.filter(
			(t) =>
				(typeof t.student_id === "string" && t.student_id.trim() !== "" && !t.couple_id) ||
				(typeof t.couple_id === "string" && t.couple_id.trim() !== "" && !t.student_id)
		)
		const toInsert = valid.map((t) => ({
			timetable_id: timetableId,
			student_id: t.student_id && typeof t.student_id === "string" ? t.student_id.trim() || null : null,
			couple_id: t.couple_id && typeof t.couple_id === "string" ? t.couple_id.trim() || null : null,
			desired_lessons_count: typeof t.desired_lessons_count === "number" ? Math.max(0, t.desired_lessons_count) : 0,
			priority: PRIORITY_VALUES.includes(t.priority as (typeof PRIORITY_VALUES)[number]) ? t.priority : "medium",
			preferred_trainer_id: t.preferred_trainer_id && typeof t.preferred_trainer_id === "string" ? t.preferred_trainer_id.trim() || null : null,
		}))
		if (toInsert.length) await supabase.from("timetable_targets").insert(toInsert)
	}

	if (Array.isArray(body.trainer_limits)) {
		await supabase.from("timetable_trainer_limits").delete().eq("timetable_id", timetableId)
		const valid = body.trainer_limits.filter((l) => typeof l.user_id === "string" && l.user_id.trim() !== "" && typeof l.max_lessons_per_day === "number" && l.max_lessons_per_day > 0)
		if (valid.length) {
			await supabase.from("timetable_trainer_limits").insert(
				valid.map((l) => ({
					timetable_id: timetableId,
					user_id: l.user_id.trim(),
					max_lessons_per_day: l.max_lessons_per_day,
				}))
			)
		}
	}

	if (Array.isArray(body.group_targets)) {
		const { data: clubGroups } = await supabase.from("groups").select("id").eq("club_id", clubId)
		const { data: clubTypes } = await supabase.from("group_lesson_types").select("id").eq("club_id", clubId)
		const validGroupIds = new Set((clubGroups ?? []).map((g) => g.id))
		const validTypeIds = new Set((clubTypes ?? []).map((t) => t.id))
		const valid = body.group_targets.filter(
			(gt) =>
				typeof gt.group_id === "string" &&
				gt.group_id.trim() !== "" &&
				validGroupIds.has(gt.group_id.trim()) &&
				typeof gt.group_lesson_type_id === "string" &&
				gt.group_lesson_type_id.trim() !== "" &&
				validTypeIds.has(gt.group_lesson_type_id.trim()) &&
				typeof gt.desired_lessons_count === "number" &&
				gt.desired_lessons_count >= 0
		)
		await supabase.from("timetable_group_targets").delete().eq("timetable_id", timetableId)
		if (valid.length) {
			const { error: insertError } = await supabase.from("timetable_group_targets").insert(
				valid.map((gt) => ({
					timetable_id: timetableId,
					group_id: gt.group_id.trim(),
					group_lesson_type_id: gt.group_lesson_type_id.trim(),
					desired_lessons_count: Math.max(0, gt.desired_lessons_count),
					priority: PRIORITY_VALUES.includes((gt.priority ?? "medium") as (typeof PRIORITY_VALUES)[number])
						? (gt.priority as (typeof PRIORITY_VALUES)[number])
						: "medium",
					preferred_trainer_id:
						gt.preferred_trainer_id && typeof gt.preferred_trainer_id === "string"
							? gt.preferred_trainer_id.trim() || null
							: null,
				}))
			)
			if (insertError) {
				return NextResponse.json({ error: insertError.message }, { status: 500 })
			}
		}
	}

	return NextResponse.json({ ok: true })
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id: timetableId } = await params
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const auth = await getClubAndAuth(supabase)
	if ("error" in auth) return auth.error
	const { clubId, isTrainer } = auth

	if (!isTrainer) {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 })
	}

	const { data: timetable, error: tError } = await supabase
		.from("timetables")
		.select("id")
		.eq("id", timetableId)
		.eq("club_id", clubId)
		.single()
	if (tError || !timetable) {
		return NextResponse.json({ error: "Timetable not found" }, { status: 404 })
	}

	const { error: deleteError } = await supabase.from("timetables").delete().eq("id", timetableId)
	if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
	return NextResponse.json({ ok: true })
}
