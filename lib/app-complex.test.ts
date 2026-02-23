/**
 * Comprehensive mocked tests for app-wide functionality:
 * utils, rate-limit, api helpers, health route, my-lessons query parsing,
 * and smoke checks for period range and availability.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { cn } from "./utils"
import { getClientIp, checkAuthRateLimit } from "./rate-limit"
import { apiError, apiSuccess } from "./api"
import { getPeriodEndForRange } from "./my-lessons-range"
import { intersectAvailability, type AvailabilitySlot } from "./availability"
import { isAvailableAtSlot } from "./timetable-solver"

// ---- Utils ----
describe("cn (utils)", () => {
	it("merges class names", () => {
		expect(cn("a", "b")).toBe("a b")
	})

	it("handles undefined and null", () => {
		expect(cn("a", undefined, "b", null)).toBe("a b")
	})

	it("merges tailwind classes correctly (later overrides)", () => {
		expect(cn("p-4", "p-2")).toBe("p-2")
	})

	it("handles conditional object", () => {
		expect(cn("base", { "opacity-50": true, "hidden": false })).toContain("base")
		expect(cn("base", { "opacity-50": true, "hidden": false })).toContain("opacity-50")
		expect(cn("base", { "opacity-50": true, "hidden": false })).not.toContain("hidden")
	})
})

// ---- Rate limit ----
describe("getClientIp", () => {
	it("uses x-forwarded-for first", () => {
		const req = new Request("https://x.com", {
			headers: { "x-forwarded-for": " 1.2.3.4 , 5.6.7.8" },
		})
		expect(getClientIp(req)).toBe("1.2.3.4")
	})

	it("falls back to x-real-ip", () => {
		const req = new Request("https://x.com", { headers: { "x-real-ip": "10.0.0.1" } })
		expect(getClientIp(req)).toBe("10.0.0.1")
	})

	it("returns unknown when no headers", () => {
		const req = new Request("https://x.com")
		expect(getClientIp(req)).toBe("unknown")
	})
})

describe("checkAuthRateLimit", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it("allows first request", () => {
		const req = new Request("https://x.com", { headers: { "x-real-ip": "192.168.1.1" } })
		expect(checkAuthRateLimit(req)).toBe(true)
	})

	it("allows up to maxRequests from same IP", () => {
		const req = new Request("https://x.com", { headers: { "x-real-ip": "192.168.1.2" } })
		for (let i = 0; i < 10; i++) {
			expect(checkAuthRateLimit(req)).toBe(true)
		}
		expect(checkAuthRateLimit(req)).toBe(false)
	})

	it("resets after window", () => {
		const req = new Request("https://x.com", { headers: { "x-real-ip": "192.168.1.3" } })
		for (let i = 0; i < 10; i++) checkAuthRateLimit(req)
		expect(checkAuthRateLimit(req)).toBe(false)
		vi.advanceTimersByTime(61_000)
		expect(checkAuthRateLimit(req)).toBe(true)
	})

	it("different IPs have separate counters", () => {
		const reqA = new Request("https://x.com", { headers: { "x-real-ip": "1.1.1.1" } })
		const reqB = new Request("https://x.com", { headers: { "x-real-ip": "2.2.2.2" } })
		for (let i = 0; i < 10; i++) checkAuthRateLimit(reqA)
		expect(checkAuthRateLimit(reqB)).toBe(true)
	})
})

// ---- API helpers ----
describe("apiError", () => {
	it("returns 400 by default", async () => {
		const res = apiError("Bad request")
		expect(res.status).toBe(400)
		const j = await res.json()
		expect(j).toEqual({ error: "Bad request" })
	})

	it("uses custom status", async () => {
		const res = apiError("Forbidden", 403)
		expect(res.status).toBe(403)
	})
})

describe("apiSuccess", () => {
	it("returns 200 with data", async () => {
		const res = apiSuccess({ foo: "bar" })
		expect(res.status).toBe(200)
		const j = await res.json()
		expect(j).toEqual({ foo: "bar" })
	})

	it("uses custom status", () => {
		const res = apiSuccess({ id: "1" }, 201)
		expect(res.status).toBe(201)
	})
})

// ---- Health route ----
describe("Health API", () => {
	it("GET returns ok and status healthy", async () => {
		const { GET } = await import("../app/api/health/route")
		const res = await GET()
		expect(res.status).toBe(200)
		const j = await res.json()
		expect(j).toEqual({ ok: true, status: "healthy" })
	})
})

// ---- My-lessons query param parsing (mirrors API logic) ----
function parseTimetablesParam(
	allTimetableIds: string[],
	timetablesParam: string | null
): string[] {
	if (!timetablesParam || timetablesParam.trim().length === 0) return allTimetableIds
	const filterIds = timetablesParam
		.split(",")
		.map((s) => s.trim())
		.filter((id) => /^[0-9a-f-]{36}$/i.test(id) && allTimetableIds.includes(id))
	return filterIds.length > 0 ? filterIds : allTimetableIds
}

describe("My-lessons: timetables query param", () => {
	const clubTimetables = [
		"a0000000-0000-4000-8000-000000000001",
		"a0000000-0000-4000-8000-000000000002",
		"a0000000-0000-4000-8000-000000000003",
	]

	it("returns all when param missing or empty", () => {
		expect(parseTimetablesParam(clubTimetables, null)).toEqual(clubTimetables)
		expect(parseTimetablesParam(clubTimetables, "")).toEqual(clubTimetables)
		expect(parseTimetablesParam(clubTimetables, "   ")).toEqual(clubTimetables)
	})

	it("returns only valid IDs that are in club", () => {
		const one = clubTimetables[0]
		expect(parseTimetablesParam(clubTimetables, one)).toEqual([one])
		expect(parseTimetablesParam(clubTimetables, `${one},${clubTimetables[1]}`)).toEqual([
			clubTimetables[0],
			clubTimetables[1],
		])
	})

	it("ignores invalid UUIDs and IDs not in club", () => {
		const one = clubTimetables[0]
		expect(parseTimetablesParam(clubTimetables, "not-a-uuid")).toEqual(clubTimetables)
		expect(parseTimetablesParam(clubTimetables, "a0000000-0000-4000-8000-000000000099")).toEqual(clubTimetables)
		expect(parseTimetablesParam(clubTimetables, `${one},not-uuid,${clubTimetables[1]}`)).toEqual([
			clubTimetables[0],
			clubTimetables[1],
		])
	})

	it("trims whitespace", () => {
		const one = clubTimetables[0]
		expect(parseTimetablesParam(clubTimetables, `  ${one}  `)).toEqual([one])
	})
})

// ---- Period range (smoke) ----
describe("getPeriodEndForRange (smoke)", () => {
	it("year returns null", () => {
		expect(getPeriodEndForRange("year", new Date("2026-02-23T12:00:00"))).toBeNull()
	})

	it("week returns Sunday 23:59:59", () => {
		const end = getPeriodEndForRange("week", new Date("2026-02-23T12:00:00"))
		expect(end).not.toBeNull()
		const d = new Date(end!)
		expect(d.getDay()).toBe(0)
		expect(d.getHours()).toBe(23)
		expect(d.getMinutes()).toBe(59)
	})
})

// ---- Availability (smoke) ----
describe("intersectAvailability (smoke)", () => {
	function slot(day: string, start: string, end: string): AvailabilitySlot {
		return { day, start, end }
	}

	it("empty returns empty", () => {
		expect(intersectAvailability([], [])).toEqual([])
	})

	it("overlap on same day returns intersection", () => {
		const a = [slot("monday", "09:00", "12:00")]
		const b = [slot("monday", "10:00", "11:00")]
		expect(intersectAvailability(a, b)).toEqual([slot("monday", "10:00", "11:00")])
	})
})

// ---- Timetable solver (smoke) ----
describe("isAvailableAtSlot (smoke)", () => {
	function slot(day: string, start: string, end: string): AvailabilitySlot {
		return { day, start, end }
	}

	it("empty availability allows any slot", () => {
		expect(isAvailableAtSlot([], "2026-02-23", "09:00", "09:45")).toBe(true)
	})

	it("slot inside availability returns true", () => {
		const av = [slot("monday", "09:00", "12:00")]
		expect(isAvailableAtSlot(av, "2026-02-23", "09:00", "09:45")).toBe(true)
	})

	it("slot outside availability returns false", () => {
		const av = [slot("monday", "09:00", "12:00")]
		expect(isAvailableAtSlot(av, "2026-02-23", "14:00", "14:45")).toBe(false)
	})
})
