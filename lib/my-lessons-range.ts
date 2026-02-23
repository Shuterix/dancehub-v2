/**
 * End of period for user-selected range (local date).
 * Returns ISO string or null for "year" (no cap).
 * Used by GET /api/app/my-lessons.
 */
export function getPeriodEndForRange(
	range: string,
	now: Date = new Date()
): string | null {
	if (range === "year") return null
	const y = now.getFullYear()
	const m = now.getMonth()
	const d = now.getDate()
	const dayOfWeek = now.getDay() // 0 = Sun, 1 = Mon, ...

	if (range === "week") {
		const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek
		const sunday = new Date(y, m, d + daysUntilSunday)
		sunday.setHours(23, 59, 59, 999)
		return sunday.toISOString()
	}
	if (range === "two_weeks") {
		const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
		const thisMonday = new Date(y, m, d + daysToMonday)
		const periodEnd = new Date(thisMonday)
		periodEnd.setDate(periodEnd.getDate() + 13)
		periodEnd.setHours(23, 59, 59, 999)
		return periodEnd.toISOString()
	}
	if (range === "month") {
		// Next 30 days so month always shows more than week (7 days) and less than year
		const monthEnd = new Date(y, m, d + 30)
		monthEnd.setHours(23, 59, 59, 999)
		return monthEnd.toISOString()
	}
	// default: week
	const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek
	const sunday = new Date(y, m, d + daysUntilSunday)
	sunday.setHours(23, 59, 59, 999)
	return sunday.toISOString()
}
