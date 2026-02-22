import { describe, it, expect } from "vitest"
import {
	intersectAvailability,
	intersectAllAvailability,
	formatSlot,
	formatTimeHHmm,
	type AvailabilitySlot,
} from "./availability"

function slot(day: string, start: string, end: string): AvailabilitySlot {
	return { day, start, end }
}

describe("intersectAvailability (couple: only times when both can)", () => {
	it("returns [] when both are empty", () => {
		expect(intersectAvailability([], [])).toEqual([])
	})

	it("returns [] when one partner has no availability", () => {
		const alice = [slot("monday", "10:00", "12:00")]
		expect(intersectAvailability(alice, [])).toEqual([])
		expect(intersectAvailability([], alice)).toEqual([])
	})

	it("returns [] when same day but times do not overlap", () => {
		const a = [slot("monday", "09:00", "10:00")]
		const b = [slot("monday", "11:00", "12:00")]
		expect(intersectAvailability(a, b)).toEqual([])
	})

	it("returns overlap when same day and times overlap", () => {
		const a = [slot("monday", "09:00", "12:00")]
		const b = [slot("monday", "10:00", "11:00")]
		expect(intersectAvailability(a, b)).toEqual([slot("monday", "10:00", "11:00")])
	})

	it("returns [] when different days (no common day)", () => {
		const a = [slot("monday", "10:00", "12:00")]
		const b = [slot("wednesday", "10:00", "12:00")]
		expect(intersectAvailability(a, b)).toEqual([])
	})

	it("handles multiple overlapping slots on same day", () => {
		const a = [
			slot("monday", "09:00", "11:00"),
			slot("monday", "14:00", "17:00"),
		]
		const b = [
			slot("monday", "10:00", "12:00"),
			slot("monday", "15:00", "16:00"),
		]
		const result = intersectAvailability(a, b)
		expect(result).toHaveLength(2)
		expect(result).toContainEqual(slot("monday", "10:00", "11:00"))
		expect(result).toContainEqual(slot("monday", "15:00", "16:00"))
	})

	it("handles partial overlap (later start, earlier end)", () => {
		const a = [slot("wednesday", "14:00", "18:00")]
		const b = [slot("wednesday", "10:00", "17:00")]
		expect(intersectAvailability(a, b)).toEqual([slot("wednesday", "14:00", "17:00")])
	})

	it("handles touching but non-overlapping (end equals start)", () => {
		const a = [slot("monday", "09:00", "10:00")]
		const b = [slot("monday", "10:00", "11:00")]
		expect(intersectAvailability(a, b)).toEqual([])
	})

	it("Alice & Bob: both have Mon 10–12 → result Mon 10–12", () => {
		const alice = [slot("monday", "10:00", "12:00")]
		const bob = [slot("monday", "10:00", "12:00")]
		expect(intersectAvailability(alice, bob)).toEqual([slot("monday", "10:00", "12:00")])
	})

	it("One partner only has Wed 14–17, other has Mon 10–12 → no overlap", () => {
		const partner1 = [slot("wednesday", "14:00", "17:00")]
		const partner2 = [slot("monday", "10:00", "12:00")]
		expect(intersectAvailability(partner1, partner2)).toEqual([])
	})
})

describe("intersectAllAvailability (group: only times when everyone can)", () => {
	it("returns [] for 0 members", () => {
		expect(intersectAllAvailability([])).toEqual([])
	})

	it("returns that member's slots for 1 member", () => {
		const one = [slot("monday", "10:00", "12:00")]
		expect(intersectAllAvailability([one])).toEqual(one)
	})

	it("returns [] when any member has no availability (group cannot train)", () => {
		const hasSlots = [slot("monday", "10:00", "12:00")]
		const noSlots: AvailabilitySlot[] = []
		expect(intersectAllAvailability([hasSlots, noSlots])).toEqual([])
		expect(intersectAllAvailability([noSlots, hasSlots])).toEqual([])
	})

	it("returns overlap when two members share one window", () => {
		const a = [slot("monday", "10:00", "12:00")]
		const b = [slot("monday", "10:00", "12:00")]
		expect(intersectAllAvailability([a, b])).toEqual([slot("monday", "10:00", "12:00")])
	})

	it("returns [] when two members have no overlapping time", () => {
		const a = [slot("monday", "09:00", "10:00")]
		const b = [slot("monday", "11:00", "12:00")]
		expect(intersectAllAvailability([a, b])).toEqual([])
	})

	it("three members: only the common slot is returned", () => {
		const a = [slot("monday", "09:00", "12:00"), slot("wednesday", "14:00", "17:00")]
		const b = [slot("monday", "10:00", "11:00"), slot("friday", "09:00", "10:00")]
		const c = [slot("monday", "10:00", "11:30")]
		expect(intersectAllAvailability([a, b, c])).toEqual([slot("monday", "10:00", "11:00")])
	})

	it("two couples + one student: if one couple has [] then group has []", () => {
		const couple1 = [slot("monday", "10:00", "12:00")]
		const couple2: AvailabilitySlot[] = [] // e.g. only one partner has availability
		const student = [slot("monday", "10:00", "12:00")]
		expect(intersectAllAvailability([couple1, couple2, student])).toEqual([])
	})

	it("two couples both with same slot → group has that slot", () => {
		const couple1 = [slot("monday", "10:00", "12:00")]
		const couple2 = [slot("monday", "10:00", "12:00")]
		expect(intersectAllAvailability([couple1, couple2])).toEqual([
			slot("monday", "10:00", "12:00"),
		])
	})

	it("two couples overlapping only in a smaller window", () => {
		const couple1 = [slot("monday", "09:00", "12:00")]
		const couple2 = [slot("monday", "10:00", "11:00")]
		expect(intersectAllAvailability([couple1, couple2])).toEqual([
			slot("monday", "10:00", "11:00"),
		])
	})

	it("four people (e.g. 2 couples or 4 students): only the one window everyone has", () => {
		const person1 = [slot("monday", "08:00", "14:00"), slot("wednesday", "09:00", "12:00")]
		const person2 = [slot("monday", "10:00", "12:00"), slot("friday", "14:00", "16:00")]
		const person3 = [slot("monday", "09:00", "11:30")]
		const person4 = [slot("monday", "10:00", "13:00")]
		const result = intersectAllAvailability([person1, person2, person3, person4])
		expect(result).toEqual([slot("monday", "10:00", "11:30")])
	})

	it("five people: multiple slots each, only one common slot across all", () => {
		const a = [slot("monday", "09:00", "12:00"), slot("tuesday", "10:00", "11:00")]
		const b = [slot("monday", "10:00", "11:00"), slot("wednesday", "14:00", "15:00")]
		const c = [slot("monday", "10:00", "11:00"), slot("thursday", "08:00", "09:00")]
		const d = [slot("monday", "09:30", "11:30")]
		const e = [slot("monday", "10:00", "10:45")]
		const result = intersectAllAvailability([a, b, c, d, e])
		expect(result).toEqual([slot("monday", "10:00", "10:45")])
	})

	it("three couples in a group: all three must overlap → single window", () => {
		const couple1 = [slot("monday", "09:00", "12:00")]
		const couple2 = [slot("monday", "10:00", "11:30")]
		const couple3 = [slot("monday", "10:15", "11:00")]
		const result = intersectAllAvailability([couple1, couple2, couple3])
		expect(result).toEqual([slot("monday", "10:15", "11:00")])
	})

	it("two couples + two individual students (4 members): only when all four can", () => {
		const couple1 = [slot("monday", "10:00", "12:00")]
		const couple2 = [slot("monday", "10:00", "11:00")]
		const student1 = [slot("monday", "09:30", "11:30")]
		const student2 = [slot("monday", "10:00", "10:45")]
		const result = intersectAllAvailability([couple1, couple2, student1, student2])
		expect(result).toEqual([slot("monday", "10:00", "10:45")])
	})

	it("four members with two common slots → both slots returned", () => {
		const a = [slot("monday", "10:00", "11:00"), slot("wednesday", "14:00", "15:00")]
		const b = [slot("monday", "10:00", "11:00"), slot("wednesday", "14:00", "15:00")]
		const c = [slot("monday", "10:00", "11:00"), slot("wednesday", "14:00", "15:00")]
		const d = [slot("monday", "10:00", "11:00"), slot("wednesday", "14:00", "15:00")]
		const result = intersectAllAvailability([a, b, c, d])
		expect(result).toHaveLength(2)
		expect(result).toContainEqual(slot("monday", "10:00", "11:00"))
		expect(result).toContainEqual(slot("wednesday", "14:00", "15:00"))
	})

	it("four people: one has no availability → group has []", () => {
		const a = [slot("monday", "10:00", "12:00")]
		const b = [slot("monday", "10:00", "12:00")]
		const c = [slot("monday", "10:00", "12:00")]
		const d: AvailabilitySlot[] = []
		expect(intersectAllAvailability([a, b, c, d])).toEqual([])
		expect(intersectAllAvailability([d, a, b, c])).toEqual([])
	})

	it("three couples: one couple has [] → group has []", () => {
		const couple1 = [slot("monday", "10:00", "12:00")]
		const couple2: AvailabilitySlot[] = []
		const couple3 = [slot("monday", "10:00", "12:00")]
		expect(intersectAllAvailability([couple1, couple2, couple3])).toEqual([])
	})

	it("six members (e.g. 3 couples): narrow overlap only", () => {
		const members = [
			[slot("monday", "09:00", "12:00")],
			[slot("monday", "10:00", "11:00")],
			[slot("monday", "10:00", "11:00")],
			[slot("monday", "10:15", "10:45")],
			[slot("monday", "10:00", "11:00")],
			[slot("monday", "10:20", "10:50")],
		]
		const result = intersectAllAvailability(members)
		expect(result).toEqual([slot("monday", "10:20", "10:45")])
	})
})

describe("formatTimeHHmm and formatSlot", () => {
	it("formats HH:mm", () => {
		expect(formatTimeHHmm("09:00")).toBe("09:00")
		expect(formatTimeHHmm("")).toBe("–")
	})

	it("formats slot with day abbreviation", () => {
		expect(formatSlot(slot("monday", "10:00", "12:00"))).toBe("Mon 10:00 – 12:00")
		expect(formatSlot(slot("wednesday", "14:00", "17:00"))).toBe("Wed 14:00 – 17:00")
	})

	it("formatTimeHHmm: single segment (e.g. 12) yields NaN for minutes, still formats", () => {
		expect(formatTimeHHmm("12")).toBe("12:00")
	})

	it("formatSlot: unknown day key is passed through", () => {
		expect(formatSlot(slot("unknown", "10:00", "12:00"))).toContain("10:00")
		expect(formatSlot(slot("unknown", "10:00", "12:00"))).toContain("unknown")
	})
})

describe("Edge cases: intersectAvailability", () => {
	it("same day different casing is not merged (different keys)", () => {
		const a = [slot("Monday", "10:00", "12:00")]
		const b = [slot("monday", "10:00", "12:00")]
		expect(intersectAvailability(a, b)).toEqual([])
	})
})

describe("Edge cases: intersectAllAvailability", () => {
	it("single member empty slots returns []", () => {
		expect(intersectAllAvailability([[]])).toEqual([])
	})
})
