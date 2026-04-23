/**
 * Keeps the timetables list "target shortfalls" summary in sync with the week
 * the user last picked on a timetable detail page (same `week_start` as
 * `/api/club/timetables/[id]/shortfalls`).
 */
export const TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY = "dancehub:timetable-shortfalls-week"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isYyyyMmDd(s: string): boolean {
	return DATE_RE.test(s)
}

function getBrowserLocalStorage(): Storage | null {
	if (typeof globalThis === "undefined") return null
	try {
		const ls = (globalThis as unknown as { localStorage?: Storage }).localStorage
		if (ls && typeof ls.getItem === "function" && typeof ls.setItem === "function") {
			return ls
		}
	} catch {
		return null
	}
	return null
}

export function getPreferredShortfallsWeekStart(): string | null {
	const storage = getBrowserLocalStorage()
	if (!storage) return null
	try {
		const raw = storage.getItem(TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY)
		if (!raw || !isYyyyMmDd(raw)) return null
		return raw
	} catch {
		return null
	}
}

export function setPreferredShortfallsWeekStart(weekStart: string): void {
	if (!isYyyyMmDd(weekStart)) return
	const storage = getBrowserLocalStorage()
	if (!storage) return
	try {
		storage.setItem(TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY, weekStart)
	} catch {
		/* ignore quota / private mode */
	}
}

/**
 * Path (with query) for `fetch` so the list summary uses the same `week_start` as timetable detail.
 */
export function getShortfallsSummaryApiPath(weekStart: string | null | undefined): string {
	if (weekStart && isYyyyMmDd(weekStart)) {
		return `/api/club/timetables/shortfalls-summary?week_start=${encodeURIComponent(weekStart)}`
	}
	return "/api/club/timetables/shortfalls-summary"
}
