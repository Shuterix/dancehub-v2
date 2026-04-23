import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
	TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY,
	isYyyyMmDd,
	getShortfallsSummaryApiPath,
	getPreferredShortfallsWeekStart,
	setPreferredShortfallsWeekStart,
} from "./timetable-shortfalls-week"

describe("isYyyyMmDd", () => {
	it("accepts valid calendar dates (shape only, not day/month validity in DB)", () => {
		expect(isYyyyMmDd("2026-04-23")).toBe(true)
		expect(isYyyyMmDd("2000-01-01")).toBe(true)
		expect(isYyyyMmDd("2099-12-31")).toBe(true)
	})

	it("rejects wrong length or separators", () => {
		expect(isYyyyMmDd("26-04-23")).toBe(false)
		expect(isYyyyMmDd("2026-4-23")).toBe(false)
		expect(isYyyyMmDd("2026-04-2")).toBe(false)
		expect(isYyyyMmDd("20260423")).toBe(false)
	})

	it("rejects non-numeric parts", () => {
		expect(isYyyyMmDd("abcd-ef-gh")).toBe(false)
		expect(isYyyyMmDd("2026-04-2x")).toBe(false)
	})

	it("rejects empty and whitespace-padded", () => {
		expect(isYyyyMmDd("")).toBe(false)
		expect(isYyyyMmDd(" 2026-04-23")).toBe(false)
		expect(isYyyyMmDd("2026-04-23 ")).toBe(false)
	})
})

describe("getShortfallsSummaryApiPath", () => {
	it("returns base path when week is null or undefined", () => {
		expect(getShortfallsSummaryApiPath(null)).toBe("/api/club/timetables/shortfalls-summary")
		expect(getShortfallsSummaryApiPath(undefined)).toBe("/api/club/timetables/shortfalls-summary")
	})

	it("returns base path for invalid week strings", () => {
		expect(getShortfallsSummaryApiPath("not-a-date")).toBe("/api/club/timetables/shortfalls-summary")
		expect(getShortfallsSummaryApiPath("2026-4-23")).toBe("/api/club/timetables/shortfalls-summary")
	})

	it("appends week_start for valid YYYY-MM-DD", () => {
		expect(getShortfallsSummaryApiPath("2026-04-27")).toBe(
			"/api/club/timetables/shortfalls-summary?week_start=2026-04-27",
		)
	})

	it("encodes the query (reserved chars would be escaped)", () => {
		// If someone stored junk that passed regex, still encode
		const path = getShortfallsSummaryApiPath("2026-12-01")
		expect(path).not.toContain(" ")
		expect(path).toContain(encodeURIComponent("2026-12-01"))
	})
})

describe("localStorage: getPreferredShortfallsWeekStart / setPreferredShortfallsWeekStart", () => {
	let store: Record<string, string>

	beforeEach(() => {
		store = {}
		// Browsers expose `localStorage` on `globalThis`; production code uses that (not `window`), so tests match.
		globalThis.localStorage = {
			getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k]! : null),
			setItem: (k: string, v: string) => {
				store[k] = v
			},
		} as unknown as Storage
	})

	afterEach(() => {
		delete (globalThis as { localStorage?: unknown }).localStorage
	})

	it("get returns null when key is missing", () => {
		expect(getPreferredShortfallsWeekStart()).toBeNull()
	})

	it("get returns the stored value when valid", () => {
		store[TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY] = "2026-04-27"
		expect(getPreferredShortfallsWeekStart()).toBe("2026-04-27")
	})

	it("get returns null when stored value is not YYYY-MM-DD", () => {
		store[TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY] = "invalid"
		expect(getPreferredShortfallsWeekStart()).toBeNull()
	})

	it("set writes valid date to the expected key", () => {
		setPreferredShortfallsWeekStart("2026-05-19")
		expect(store[TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY]).toBe("2026-05-19")
	})

	it("set ignores week strings that do not match YYYY-MM-DD (shape)", () => {
		store[TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY] = "2026-01-01"
		setPreferredShortfallsWeekStart("2026-4-02")
		expect(store[TIMETABLE_SHORTFALLS_WEEK_STORAGE_KEY]).toBe("2026-01-01")
	})

	it("get swallows getItem throw and returns null", () => {
		globalThis.localStorage = {
			getItem: () => {
				throw new Error("denied")
			},
			setItem: vi.fn(),
		} as unknown as Storage
		expect(getPreferredShortfallsWeekStart()).toBeNull()
	})

	it("set swallows setItem throw without throwing to caller", () => {
		globalThis.localStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error("quota")
			},
		} as unknown as Storage
		expect(() => setPreferredShortfallsWeekStart("2026-06-01")).not.toThrow()
	})
})

describe("getPreferredShortfallsWeekStart (no localStorage)", () => {
	beforeEach(() => {
		delete (globalThis as { localStorage?: unknown }).localStorage
	})

	it("returns null when localStorage is unavailable", () => {
		expect(getPreferredShortfallsWeekStart()).toBeNull()
	})
})

describe("setPreferredShortfallsWeekStart (no localStorage)", () => {
	beforeEach(() => {
		delete (globalThis as { localStorage?: unknown }).localStorage
	})

	it("is a no-op when localStorage is unavailable", () => {
		expect(() => setPreferredShortfallsWeekStart("2026-07-01")).not.toThrow()
	})
})
