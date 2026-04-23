import { describe, it, expect } from "vitest"
import { weekStartMonday, ymdAddDays, shortfallLessonCountRange } from "./timetable-week"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe("weekStartMonday", () => {
	it("returns a YYYY-MM-DD string", () => {
		expect(weekStartMonday("2026-04-23")).toMatch(ISO_DATE)
	})

	it("is idempotent for all seven local calendar days of a week (same Monday)", () => {
		const mon = weekStartMonday("2026-04-27")
		const [y, mo, da] = mon.split("-").map(Number)
		for (let i = 0; i < 7; i++) {
			const d = new Date(y, mo - 1, da + i, 12, 0, 0)
			const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
			expect(weekStartMonday(day)).toBe(mon)
		}
	})

	it("repeated application does not change a Monday result", () => {
		const once = weekStartMonday("2026-06-10")
		expect(weekStartMonday(once)).toBe(once)
	})

	it("normalizes a Sunday to the previous Monday (ISO week: Monday is start)", () => {
		const m = weekStartMonday("2026-06-14")
		expect(weekStartMonday(m)).toBe(m)
		const sun = "2026-06-14"
		expect(weekStartMonday(sun)).toBe(weekStartMonday("2026-06-08"))
	})

	it("agrees for adjacent days: Wednesday and Thursday in same week give same Monday", () => {
		expect(weekStartMonday("2026-12-16")).toBe(weekStartMonday("2026-12-17"))
	})

	it("crosses year boundary with valid output shape", () => {
		const w = weekStartMonday("2025-12-31")
		expect(w).toMatch(ISO_DATE)
		expect(weekStartMonday("2025-12-29")).toBe(w)
	})

	it("is stable for mid-year dates in both halves", () => {
		expect(weekStartMonday("2026-01-15")).toBe(weekStartMonday("2026-01-12"))
		expect(weekStartMonday("2026-08-20")).toBe(weekStartMonday("2026-08-17"))
	})
})

describe("ymdAddDays", () => {
	it("adds days within a month", () => {
		expect(ymdAddDays("2026-04-10", 5)).toBe("2026-04-15")
	})

	it("crosses month boundary", () => {
		expect(ymdAddDays("2026-04-28", 5)).toBe("2026-05-03")
	})
})

describe("shortfallLessonCountRange", () => {
	it("weekly: Mon…Sun of that ISO week", () => {
		const r = shortfallLessonCountRange("2026-04-27", "weekly", false)
		expect(r.kind).toBe("week")
		expect(r.from).toBe("2026-04-27")
		expect(r.to).toBe("2026-05-03")
	})

	it("weekends_only: Saturday–Sunday", () => {
		const r = shortfallLessonCountRange("2026-04-27", "weekends_only", true)
		expect(r.kind).toBe("week")
		expect(r.from).toBe("2026-05-02")
		expect(r.to).toBe("2026-05-03")
	})

	it("monthly: full calendar month of the Monday’s month", () => {
		const r = shortfallLessonCountRange("2026-04-27", "monthly", false)
		expect(r.kind).toBe("month")
		expect(r.from).toBe("2026-04-01")
		expect(r.to).toBe("2026-04-30")
	})

	it("monthly: year boundary (December Monday)", () => {
		const r = shortfallLessonCountRange("2025-12-29", "monthly", false)
		expect(r.from).toBe("2025-12-01")
		expect(r.to).toBe("2025-12-31")
	})

	it("bi_weekly: 14 days from Monday inclusive", () => {
		const r = shortfallLessonCountRange("2026-04-27", "bi_weekly", false)
		expect(r.kind).toBe("fortnight")
		expect(r.from).toBe("2026-04-27")
		expect(r.to).toBe("2026-05-10")
	})
})
