/**
 * ISO week helpers used by timetable shortfalls, lessons-in-week, and list summary
 * so all surfaces agree on the same Monday.
 */
export function weekStartMonday(dateStr: string): string {
	const d = new Date(dateStr + "T12:00:00")
	const day = d.getDay()
	const diff = day === 0 ? -6 : 1 - day
	d.setDate(d.getDate() + diff)
	return d.toISOString().slice(0, 10)
}

/** Local date arithmetic; avoids mixing UTC from `toISOString` with calendar intent. */
export function ymdAddDays(ymd: string, days: number): string {
	const [y, mo, d] = ymd.split("-").map(Number)
	const dt = new Date(y, mo - 1, d + days, 12, 0, 0)
	return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

function calendarMonthFirstLast(ymd: string): { from: string; to: string } {
	const [y, mo] = ymd.split("-").map(Number)
	const firstD = new Date(y, mo - 1, 1, 12, 0, 0)
	const lastD = new Date(y, mo, 0, 12, 0, 0)
	const fmt = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
	return { from: fmt(firstD), to: fmt(lastD) }
}

/**
 * Inclusive [from, to] (YYYY-MM-DD) for how many existing lessons to count when comparing
 * to `desired_lessons_count`. Weekly = one ISO week; weekend-only = Sat–Sun of that week;
 * monthly = full calendar month that contains the viewed `mondayYyyyMmDd`;
 * bi-weekly = 14 days starting on that Monday.
 */
export function shortfallLessonCountRange(
	mondayYyyyMmDd: string,
	recurrence: string,
	isWeekendsOnly: boolean,
): { from: string; to: string; kind: "week" | "fortnight" | "month" } {
	if (isWeekendsOnly) {
		const sat = ymdAddDays(mondayYyyyMmDd, 5)
		const sun = ymdAddDays(sat, 1)
		return { from: sat, to: sun, kind: "week" }
	}
	if (recurrence === "monthly") {
		const { from, to } = calendarMonthFirstLast(mondayYyyyMmDd)
		return { from, to, kind: "month" }
	}
	if (recurrence === "bi_weekly") {
		return { from: mondayYyyyMmDd, to: ymdAddDays(mondayYyyyMmDd, 13), kind: "fortnight" }
	}
	return { from: mondayYyyyMmDd, to: ymdAddDays(mondayYyyyMmDd, 6), kind: "week" }
}
