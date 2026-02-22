import { describe, it, expect } from "vitest"
import {
	isAvailableAtSlot,
	buildWeekSlots,
	solveTimetable,
	type SolverInput,
} from "./timetable-solver"
import type { AvailabilitySlot } from "./availability"

function slot(day: string, start: string, end: string): AvailabilitySlot {
	return { day, start, end }
}

describe("isAvailableAtSlot", () => {
	it("returns true when availability is empty (no constraints)", () => {
		expect(isAvailableAtSlot([], "2026-02-23", "09:00", "09:45")).toBe(true)
		expect(isAvailableAtSlot([], "2026-02-24", "15:00", "15:45")).toBe(true)
	})

	it("returns true when slot overlaps an availability slot on same day", () => {
		const av = [slot("monday", "09:00", "12:00")]
		// 2026-02-23 is Monday
		expect(isAvailableAtSlot(av, "2026-02-23", "09:00", "09:45")).toBe(true)
		expect(isAvailableAtSlot(av, "2026-02-23", "11:00", "11:45")).toBe(true)
	})

	it("returns false when slot is outside availability on same day", () => {
		const av = [slot("monday", "09:00", "12:00")]
		expect(isAvailableAtSlot(av, "2026-02-23", "08:00", "08:45")).toBe(false)
		expect(isAvailableAtSlot(av, "2026-02-23", "12:00", "12:45")).toBe(false)
		expect(isAvailableAtSlot(av, "2026-02-23", "14:00", "14:45")).toBe(false)
	})

	it("returns false when slot is on a day with no availability", () => {
		const av = [slot("monday", "09:00", "12:00")]
		// 2026-02-24 is Tuesday
		expect(isAvailableAtSlot(av, "2026-02-24", "09:00", "09:45")).toBe(false)
	})

	it("uses case-insensitive day match", () => {
		const av = [slot("Monday", "10:00", "11:00")]
		expect(isAvailableAtSlot(av, "2026-02-23", "10:00", "10:45")).toBe(true)
	})
})

describe("buildWeekSlots", () => {
	it("builds slots for Mon–Sun within day_start and day_end", () => {
		const slots = buildWeekSlots("2026-02-23", "09:00", "12:00", 45)
		expect(slots.length).toBe(7 * 4) // 7 days, 4 slots of 45min (09:00, 09:45, 10:30, 11:15)
		const mondaySlots = slots.filter((s) => s.date === "2026-02-23")
		expect(mondaySlots.map((s) => s.startTime)).toEqual(["09:00", "09:45", "10:30", "11:15"])
	})

	it("uses correct dates for the week (local)", () => {
		const slots = buildWeekSlots("2026-02-23", "10:00", "11:00", 60)
		const dates = [...new Set(slots.map((s) => s.date))].sort()
		expect(dates).toEqual([
			"2026-02-23",
			"2026-02-24",
			"2026-02-25",
			"2026-02-26",
			"2026-02-27",
			"2026-02-28",
			"2026-03-01",
		])
	})

	it("respects duration step", () => {
		const slots = buildWeekSlots("2026-02-23", "08:00", "10:00", 30)
		const mon = slots.filter((s) => s.date === "2026-02-23")
		expect(mon.map((s) => `${s.startTime}-${s.endTime}`)).toEqual([
			"08:00-08:30",
			"08:30-09:00",
			"09:00-09:30",
			"09:30-10:00",
		])
	})
})

function defaultInput(overrides: Partial<SolverInput> = {}): SolverInput {
	const ttId = "tt-1"
	const studentId = "student-1"
	const trainerId = "trainer-1"
	const roomId = "room-1"
	return {
		timetable_id: ttId,
		week_start_monday: "2026-02-23",
		day_start: "09:00",
		day_end: "18:00",
		duration_minutes: 45,
		targets: [
			{
				id: "target-1",
				student_id: studentId,
				couple_id: null,
				desired_lessons_count: 2,
				priority: "medium",
				preferred_trainer_id: null,
			},
		],
		trainer_ids: [trainerId],
		trainer_availability: new Map([[trainerId, []]]),
		target_availability: new Map([[studentId, []]]),
		trainer_limits: new Map([[trainerId, 8]]),
		room_ids: [roomId],
		...overrides,
	}
}

describe("solveTimetable", () => {
	it("returns empty when no targets", () => {
		const input = defaultInput({ targets: [] })
		expect(solveTimetable(input)).toEqual([])
	})

	it("returns empty when no trainers", () => {
		const input = defaultInput({ trainer_ids: [] })
		expect(solveTimetable(input)).toEqual([])
	})

	it("places lessons when target and trainer have empty availability (treated as available)", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 2,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", []]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(2)
		expect(lessons.every((l) => l.student_id === "s1" && l.trainer_id === "trainer-1")).toBe(true)
		expect(lessons[0].start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
	})

	it("schedules lessons only when target is available (student availability)", () => {
		const targetSlots = [slot("monday", "10:00", "12:00"), slot("wednesday", "14:00", "16:00")]
		const input = defaultInput({
			target_availability: new Map([["student-1", targetSlots]]),
			trainer_availability: new Map([["trainer-1", []]]),
			targets: [
				{
					id: "t1",
					student_id: "student-1",
					couple_id: null,
					desired_lessons_count: 3,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(3)
		const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
		for (const l of lessons) {
			const date = l.start_at.slice(0, 10)
			const startTime = l.start_at.slice(11, 16)
			const endTime = l.end_at.slice(11, 16)
			const day = new Date(date + "T12:00:00").getDay()
			const dayName = dayNames[day]
			const overlapsSome = targetSlots.some(
				(s) =>
					s.day.toLowerCase() === dayName &&
					startTime < s.end &&
					endTime > s.start
			)
			expect(overlapsSome).toBe(true)
		}
	})

	it("schedules lessons only when trainer is available", () => {
		const input = defaultInput({
			target_availability: new Map([["student-1", []]]),
			trainer_availability: new Map([
				["trainer-1", [slot("tuesday", "09:00", "11:00"), slot("thursday", "15:00", "17:00")]],
			]),
			targets: [
				{
					id: "t1",
					student_id: "student-1",
					couple_id: null,
					desired_lessons_count: 3,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(3)
		for (const l of lessons) {
			const date = l.start_at.slice(0, 10)
			const time = l.start_at.slice(11, 16)
			const day = new Date(date + "T12:00:00").getDay()
			const dayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][day]
			if (dayName === "tuesday") {
				expect(time >= "09:00" && time < "11:00").toBe(true)
			} else if (dayName === "thursday") {
				expect(time >= "15:00" && time < "17:00").toBe(true)
			}
		}
	})

	it("places no lessons when target has no overlapping availability with schedule window", () => {
		const input = defaultInput({
			target_availability: new Map([["student-1", [slot("saturday", "20:00", "22:00")]]]),
			trainer_availability: new Map([["trainer-1", []]]),
			day_start: "09:00",
			day_end: "18:00",
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(0)
	})

	it("places no lessons when trainer has no overlapping availability with schedule window", () => {
		const input = defaultInput({
			target_availability: new Map([["student-1", []]]),
			trainer_availability: new Map([["trainer-1", [slot("sunday", "20:00", "22:00")]]]),
			day_start: "09:00",
			day_end: "18:00",
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(0)
	})

	it("respects trainer daily limit", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 5,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			trainer_limits: new Map([["trainer-1", 2]]),
			target_availability: new Map([["s1", []]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(5)
		const byDate = new Map<string, number>()
		for (const l of lessons) {
			const d = l.start_at.slice(0, 10)
			byDate.set(d, (byDate.get(d) ?? 0) + 1)
		}
		for (const count of byDate.values()) {
			expect(count).toBeLessThanOrEqual(2)
		}
	})

	it("prefers preferred_trainer_id when available", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 2,
					priority: "medium",
					preferred_trainer_id: "trainer-A",
				},
			],
			trainer_ids: ["trainer-B", "trainer-A"],
			trainer_availability: new Map([
				["trainer-A", []],
				["trainer-B", []],
			]),
			trainer_limits: new Map([
				["trainer-A", 8],
				["trainer-B", 8],
			]),
			target_availability: new Map([["s1", []]]),
			room_ids: ["r1", "r2"],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(2)
		expect(lessons.every((l) => l.trainer_id === "trainer-A")).toBe(true)
	})

	it("sorts targets by priority (high first)", () => {
		const input = defaultInput({
			targets: [
				{
					id: "low",
					student_id: "s-low",
					couple_id: null,
					desired_lessons_count: 1,
					priority: "low",
					preferred_trainer_id: null,
				},
				{
					id: "high",
					student_id: "s-high",
					couple_id: null,
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([
				["s-low", []],
				["s-high", []],
			]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(2)
		expect(lessons[0].student_id).toBe("s-high")
		expect(lessons[1].student_id).toBe("s-low")
	})

	it("assigns couple lessons with couple_id and lesson_type couple", () => {
		const input = defaultInput({
			targets: [
				{
					id: "tc",
					student_id: null,
					couple_id: "couple-1",
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["couple-1", []]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(1)
		expect(lessons[0].lesson_type).toBe("couple")
		expect(lessons[0].couple_id).toBe("couple-1")
		expect(lessons[0].student_id).toBeNull()
	})

	it("does not double-book trainer (no overlapping lesson times)", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 2,
					priority: "medium",
					preferred_trainer_id: null,
				},
				{
					id: "t2",
					student_id: "s2",
					couple_id: null,
					desired_lessons_count: 2,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([
				["s1", []],
				["s2", []],
			]),
			trainer_availability: new Map([["trainer-1", []]]),
			trainer_limits: new Map([["trainer-1", 8]]),
			room_ids: ["r1", "r2"],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(4)
		const trainerSlots: [string, string][] = lessons
			.filter((l) => l.trainer_id === "trainer-1")
			.map((l) => [l.start_at, l.end_at])
		for (let i = 0; i < trainerSlots.length; i++) {
			for (let j = i + 1; j < trainerSlots.length; j++) {
				const [s1, e1] = trainerSlots[i]
				const [s2, e2] = trainerSlots[j]
				const sameSlot = s1 === s2
				const overlap =
					s1 < e2 && s2 < e1
				expect(sameSlot || !overlap).toBe(true)
			}
		}
	})

	it("uses room when available; null when no rooms", () => {
		const withRoom = solveTimetable(defaultInput({ room_ids: ["room-1"] }))
		expect(withRoom.length).toBeGreaterThan(0)
		expect(withRoom[0].room_id).toBe("room-1")

		const noRoom = solveTimetable(defaultInput({ room_ids: [] }))
		expect(noRoom.length).toBeGreaterThan(0)
		expect(noRoom[0].room_id).toBeNull()
	})

	it("schedules group lessons with group_id and group_lesson_type_id when group_targets provided", () => {
		const input = defaultInput({
			targets: [],
			group_targets: [
				{
					id: "gt-1",
					group_id: "group-1",
					group_lesson_type_id: "type-90",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
				},
			],
			group_availability: new Map([["group-1", []]]),
			group_duration_minutes: new Map([["type-90", 90]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(1)
		expect(lessons[0].lesson_type).toBe("group")
		expect(lessons[0].group_id).toBe("group-1")
		expect(lessons[0].group_lesson_type_id).toBe("type-90")
		expect(lessons[0].student_id).toBeNull()
		expect(lessons[0].couple_id).toBeNull()
		expect(lessons[0].start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/)
		const start = lessons[0].start_at.slice(11, 16)
		const end = lessons[0].end_at.slice(11, 16)
		expect(end).toBe("10:30") // 90 min from 09:00
		expect(start).toBe("09:00")
	})
})
