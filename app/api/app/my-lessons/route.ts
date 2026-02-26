import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getMyLessonsData } from "@/lib/my-lessons-data"

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const rangeParam = searchParams.get("range")
	const range =
		rangeParam === "year" || rangeParam === "two_weeks" || rangeParam === "month"
			? rangeParam
			: rangeParam === "week"
				? "week"
				: "week"
	const from = searchParams.get("from") ?? undefined
	const to = searchParams.get("to") ?? undefined
	const timetablesParam = searchParams.get("timetables")
	const timetableIds =
		timetablesParam?.trim()
			? timetablesParam.split(",").map((s) => s.trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
			: undefined

	const cookieStore = await cookies()
	const result = await getMyLessonsData(cookieStore, { range, from, to, timetableIds })
	if (result.ok === false) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}
	return NextResponse.json({ lessons: result.lessons, availableTimetables: result.availableTimetables })
}
