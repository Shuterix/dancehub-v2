import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { weekStartMonday } from "@/lib/timetable-week"

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

	return { clubId: myProfile.club_id }
}

function lessonVisibleInGrid(l: { is_static: boolean; cancelled_at: string | null }, recurrence: string): boolean {
	if (l.is_static && l.cancelled_at && recurrence === "fixed_period") return false
	return true
}

/**
 * Nearest week (ISO Monday) before or after the viewed week that has at least one
 * non-hidden lesson (same rules as the lessons list).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
	const direction = searchParams.get("direction")
	if (direction !== "prev" && direction !== "next") {
		return NextResponse.json({ error: "Invalid direction" }, { status: 400 })
	}
	const monday = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)
		? weekStartMonday(weekStart)
		: weekStartMonday(new Date().toISOString().slice(0, 10))

	const weekEnd = new Date(monday + "T12:00:00")
	weekEnd.setDate(weekEnd.getDate() + 6)
	const weekEndStr = weekEnd.toISOString().slice(0, 10) + "T23:59:59.999"

	const selectCols = "start_at, is_static, cancelled_at"

	if (direction === "prev") {
		const { data: rows, error: qErr } = await supabase
			.from("lessons")
			.select(selectCols)
			.eq("timetable_id", timetableId)
			.lt("start_at", monday + "T00:00:00")
			.order("start_at", { ascending: false })
			.limit(40)
		if (qErr) {
			return NextResponse.json({ error: qErr.message }, { status: 500 })
		}
		for (const l of rows ?? []) {
			const r = l as { start_at: string; is_static: boolean; cancelled_at: string | null }
			if (!lessonVisibleInGrid(r, recurrence)) continue
			return NextResponse.json({ week_start: weekStartMonday(r.start_at.slice(0, 10)) })
		}
		return NextResponse.json({ week_start: null })
	}

	const { data: rows, error: qErr } = await supabase
		.from("lessons")
		.select(selectCols)
		.eq("timetable_id", timetableId)
		.gt("start_at", weekEndStr)
		.order("start_at", { ascending: true })
		.limit(40)
	if (qErr) {
		return NextResponse.json({ error: qErr.message }, { status: 500 })
	}
	for (const l of rows ?? []) {
		const r = l as { start_at: string; is_static: boolean; cancelled_at: string | null }
		if (!lessonVisibleInGrid(r, recurrence)) continue
		return NextResponse.json({ week_start: weekStartMonday(r.start_at.slice(0, 10)) })
	}
	return NextResponse.json({ week_start: null })
}
