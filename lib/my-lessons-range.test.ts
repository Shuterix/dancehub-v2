import { describe, it, expect } from "vitest"
import { getPeriodEndForRange } from "./my-lessons-range"

describe("getPeriodEndForRange", () => {
	it('returns null for range "year"', () => {
		expect(getPeriodEndForRange("year", new Date("2026-02-23T12:00:00"))).toBeNull()
	})

	it('"week" returns end of current week (Sunday 23:59:59)', () => {
		// Monday 23 Feb 2026 → Sunday 1 Mar 2026 23:59:59
		const monday = new Date("2026-02-23T12:00:00")
		const end = getPeriodEndForRange("week", monday)
		expect(end).not.toBeNull()
		const d = new Date(end!)
		expect(d.getDay()).toBe(0) // Sunday
		expect(d.getHours()).toBe(23)
		expect(d.getMinutes()).toBe(59)
		expect(d.getDate()).toBe(1)
		expect(d.getMonth()).toBe(2) // March (0-indexed)
	})

	it('"week" on Sunday returns next Sunday', () => {
		const sunday = new Date("2026-03-01T12:00:00")
		const end = getPeriodEndForRange("week", sunday)
		expect(end).not.toBeNull()
		const d = new Date(end!)
		expect(d.getDay()).toBe(0)
		expect(d.getDate()).toBe(8) // next week
	})

	it('"two_weeks" returns Sunday of second week in block', () => {
		// Monday 23 Feb 2026 → +13 days = Sunday 8 Mar 2026
		const monday = new Date("2026-02-23T12:00:00")
		const end = getPeriodEndForRange("two_weeks", monday)
		expect(end).not.toBeNull()
		const d = new Date(end!)
		expect(d.getDay()).toBe(0)
		expect(d.getDate()).toBe(8)
		expect(d.getMonth()).toBe(2) // March (0-indexed: 3)
	})

	it('"month" returns 30 days from now 23:59:59', () => {
		const midFeb = new Date("2026-02-15T12:00:00")
		const end = getPeriodEndForRange("month", midFeb)
		expect(end).not.toBeNull()
		const d = new Date(end!)
		expect(d.getDate()).toBe(17) // 15 + 30 = 45, March 17 (Feb has 28)
		expect(d.getMonth()).toBe(2) // March
		expect(d.getHours()).toBe(23)
	})

	it('unknown range defaults to week', () => {
		const monday = new Date("2026-02-23T12:00:00")
		const end = getPeriodEndForRange("other", monday)
		expect(end).not.toBeNull()
		const d = new Date(end!)
		expect(d.getDay()).toBe(0)
	})
})
