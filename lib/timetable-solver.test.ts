import { describe, it, expect } from "vitest"
import {
	isAvailableAtSlot,
	buildWeekSlots,
	solveTimetable,
	orderSlotsByDistribution,
	allowedDaysForDistribution,
} from "./timetable-solver"
import type { SolverInput } from "./timetable-solver"
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

	it("requires strict containment, not partial overlap", () => {
		// Availability Mon 15:00–20:00; a lesson 14:30–15:15 partially overlaps
		// but part of it (14:30–15:00) is outside the window → MUST be rejected.
		const av = [slot("monday", "15:00", "20:00")]
		expect(isAvailableAtSlot(av, "2026-02-23", "14:30", "15:15")).toBe(false)
		// Lesson 19:45–20:30 partially overlaps at the other end → rejected.
		expect(isAvailableAtSlot(av, "2026-02-23", "19:45", "20:30")).toBe(false)
		// Fully contained → accepted.
		expect(isAvailableAtSlot(av, "2026-02-23", "15:00", "15:45")).toBe(true)
		expect(isAvailableAtSlot(av, "2026-02-23", "19:15", "20:00")).toBe(true)
	})

	it("merges adjacent same-day windows so continuous availability is honored", () => {
		// Two entries that touch at 11:00 should behave like a single 09:00–13:00 block.
		const av = [
			slot("monday", "09:00", "11:00"),
			slot("monday", "11:00", "13:00"),
		]
		expect(isAvailableAtSlot(av, "2026-02-23", "10:30", "11:30")).toBe(true)
		expect(isAvailableAtSlot(av, "2026-02-23", "12:15", "13:00")).toBe(true)
		// Overlapping entries also merge.
		const av2 = [
			slot("monday", "09:00", "12:00"),
			slot("monday", "11:00", "14:00"),
		]
		expect(isAvailableAtSlot(av2, "2026-02-23", "13:00", "13:45")).toBe(true)
	})

	it("rejects a lesson that spans a gap between two windows", () => {
		const av = [
			slot("monday", "09:00", "11:00"),
			slot("monday", "12:00", "14:00"),
		]
		// 10:30–12:30 crosses the 11:00–12:00 gap → rejected.
		expect(isAvailableAtSlot(av, "2026-02-23", "10:30", "12:30")).toBe(false)
		// Fits entirely in second block → accepted.
		expect(isAvailableAtSlot(av, "2026-02-23", "12:00", "12:45")).toBe(true)
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

	it("only_weekend_days: group lessons are placed only on Saturday or Sunday (week anchor Saturday)", () => {
		const input = defaultInput({
			targets: [],
			week_start_monday: "2026-04-25", // Saturday
			only_weekend_days: true,
			group_targets: [
				{
					id: "g1",
					group_id: "g-a",
					group_lesson_type_id: "glt-1",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
					user_ids: [],
				},
			],
			group_availability: new Map([["g-a", []]]),
			group_duration_minutes: new Map([["glt-1", 60]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(1)
		const w = new Date(lessons[0]!.start_at.slice(0, 10) + "T12:00:00").getDay()
		expect(w === 0 || w === 6).toBe(true)
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

	it("with distribution 'same' and full-week availability, spreads a single target's lessons across multiple days", () => {
		const studentId = "student-1"
		const trainerId = "trainer-1"
		const fullWeekAvailability: AvailabilitySlot[] = [
			slot("monday", "15:00", "20:00"),
			slot("tuesday", "15:00", "20:00"),
			slot("wednesday", "15:00", "20:00"),
			slot("thursday", "15:00", "20:00"),
			slot("friday", "15:00", "20:00"),
			slot("saturday", "09:00", "18:00"),
			slot("sunday", "09:00", "18:00"),
		]

		const input = defaultInput({
			week_start_monday: "2026-03-09", // Monday
			day_start: "15:00",
			day_end: "18:00",
			duration_minutes: 45,
			distribution: "same",
			targets: [
				{
					id: "t1",
					student_id: studentId,
					couple_id: null,
					desired_lessons_count: 4,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([[studentId, fullWeekAvailability]]),
			trainer_ids: [trainerId],
			trainer_availability: new Map([[trainerId, fullWeekAvailability]]),
		})

		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(4)
		const dates = [...new Set(lessons.map((l) => l.start_at.slice(0, 10)))]
		// With plenty of availability and Spread, we expect lessons to land on at least 3 different days.
		expect(dates.length).toBeGreaterThanOrEqual(3)
	})

	it("with distribution 'same' and one trainer, multiple targets are scheduled on different days when availability allows", () => {
		const trainerId = "trainer-1"
		const fullWeekAvailability: AvailabilitySlot[] = [
			slot("monday", "15:00", "20:00"),
			slot("tuesday", "15:00", "20:00"),
			slot("wednesday", "15:00", "20:00"),
			slot("thursday", "15:00", "20:00"),
			slot("friday", "15:00", "20:00"),
		]

		const targets = [
			{ id: "t1", student_id: "s1" },
			{ id: "t2", student_id: "s2" },
			{ id: "t3", student_id: "s3" },
		] as const

		const input = defaultInput({
			week_start_monday: "2026-03-09",
			day_start: "15:00",
			day_end: "17:00",
			duration_minutes: 45,
			distribution: "same",
			targets: targets.map((t) => ({
				id: t.id,
				student_id: t.student_id,
				couple_id: null,
				desired_lessons_count: 2,
				priority: "medium",
				preferred_trainer_id: null,
			})),
			target_availability: new Map(
				targets.map((t) => [t.student_id, fullWeekAvailability] as [string, AvailabilitySlot[]])
			),
			trainer_ids: [trainerId],
			trainer_availability: new Map([[trainerId, fullWeekAvailability]]),
		})

		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(targets.length * 2)

		// For each target, check that their two lessons are not both on the same day when the week has enough free slots.
		for (const t of targets) {
			const perTargetDates = [
				...new Set(
					lessons
						.filter((l) => l.student_id === t.student_id)
						.map((l) => l.start_at.slice(0, 10))
				),
			]
			expect(perTargetDates.length).toBeGreaterThanOrEqual(2)
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

	it("does not assign a different trainer when preferred_trainer cannot cover all lessons", () => {
		// trainer-A only has one 45-minute window on Monday; need 2 lessons → at most one with A.
		// trainer-B is fully free — must NOT receive the second lesson for this target.
		const input = defaultInput({
			week_start_monday: "2026-02-23",
			duration_minutes: 45,
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
			trainer_ids: ["trainer-A", "trainer-B"],
			trainer_availability: new Map([
				["trainer-A", [slot("monday", "09:00", "09:45")]],
				["trainer-B", []],
			]),
			trainer_limits: new Map([
				["trainer-A", 8],
				["trainer-B", 8],
			]),
			target_availability: new Map([["s1", []]]),
			room_ids: ["r1"],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(1)
		expect(lessons[0]?.trainer_id).toBe("trainer-A")
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

	it("returns empty when desired_lessons_count is 0", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 0,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
		})
		expect(solveTimetable(input)).toHaveLength(0)
	})

	it("buildWeekSlots: duration larger than window yields no slots for that day segment", () => {
		const slots = buildWeekSlots("2026-02-23", "09:00", "10:00", 90)
		const mondaySlots = slots.filter((s) => s.date === "2026-02-23")
		expect(mondaySlots).toHaveLength(0)
	})

	it("isAvailableAtSlot: null/undefined availability treated as available", () => {
		expect(isAvailableAtSlot([], "2026-02-23", "09:00", "09:45")).toBe(true)
	})

	it("avoids trainer conflict with existing_lessons from other timetables", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", [slot("monday", "09:00", "11:00")]]]),
			trainer_availability: new Map([["trainer-1", [slot("monday", "09:00", "11:00")]]]),
			day_start: "09:00",
			day_end: "11:00",
			existing_lessons: [
				{ trainer_id: "trainer-1", room_id: null, start_at: "2026-02-23T09:00:00", end_at: "2026-02-23T09:45:00" },
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(1)
		expect(lessons[0].start_at).not.toBe("2026-02-23T09:00:00")
	})

	it("does not place lesson when trainer is fully busy from existing_lessons", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", [slot("monday", "09:00", "10:30")]]]),
			trainer_availability: new Map([["trainer-1", [slot("monday", "09:00", "10:30")]]]),
			day_start: "09:00",
			day_end: "10:30",
			existing_lessons: [
				{ trainer_id: "trainer-1", room_id: null, start_at: "2026-02-23T09:00:00", end_at: "2026-02-23T09:45:00" },
				{ trainer_id: "trainer-1", room_id: null, start_at: "2026-02-23T09:45:00", end_at: "2026-02-23T10:30:00" },
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(0)
	})

	it("avoids room conflict with existing_lessons from other timetables", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", [slot("monday", "09:00", "10:30")]]]),
			trainer_availability: new Map([["trainer-1", []]]),
			day_start: "09:00",
			day_end: "10:30",
			room_ids: ["room-1"],
			existing_lessons: [
				{ trainer_id: "other-trainer", room_id: "room-1", start_at: "2026-02-23T09:00:00", end_at: "2026-02-23T09:45:00" },
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(1)
		expect(lessons[0].start_at).toBe("2026-02-23T09:45:00")
	})

	it("does not double-book a room with different-duration lessons in same run", () => {
		// Regression: the in-run room tracker used to key by exact (date,start,end),
		// so a 60-min group at 18:00–19:00 and a 90-min group at 18:00–19:30 in
		// the same room on the same day were never detected as conflicting.
		const input = defaultInput({
			targets: [],
			group_targets: [
				{
					id: "g60",
					group_id: "grp-60",
					group_lesson_type_id: "glt-60",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
				},
				{
					id: "g90",
					group_id: "grp-90",
					group_lesson_type_id: "glt-90",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
				},
			],
			group_availability: new Map([
				["grp-60", [slot("monday", "18:00", "19:30")]],
				["grp-90", [slot("monday", "18:00", "19:30")]],
			]),
			group_duration_minutes: new Map([
				["glt-60", 60],
				["glt-90", 90],
			]),
			trainer_ids: ["trainer-A", "trainer-B"],
			trainer_availability: new Map([
				["trainer-A", [slot("monday", "18:00", "19:30")]],
				["trainer-B", [slot("monday", "18:00", "19:30")]],
			]),
			trainer_limits: new Map([
				["trainer-A", 8],
				["trainer-B", 8],
			]),
			room_ids: ["only-room"],
			day_start: "18:00",
			day_end: "19:30",
		})
		const lessons = solveTimetable(input)
		// With exactly one room + overlapping windows, only one of the two groups
		// can be placed. The second must be dropped for lack of a free room.
		expect(lessons).toHaveLength(1)
	})

	it("places different-duration lessons in same room when they don't overlap", () => {
		const input = defaultInput({
			targets: [],
			group_targets: [
				{
					id: "g60",
					group_id: "grp-60",
					group_lesson_type_id: "glt-60",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
				},
				{
					id: "g90",
					group_id: "grp-90",
					group_lesson_type_id: "glt-90",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
				},
			],
			group_availability: new Map([
				["grp-60", [slot("monday", "18:00", "21:00")]],
				["grp-90", [slot("monday", "18:00", "21:00")]],
			]),
			group_duration_minutes: new Map([
				["glt-60", 60],
				["glt-90", 90],
			]),
			trainer_ids: ["trainer-A", "trainer-B"],
			trainer_availability: new Map([
				["trainer-A", [slot("monday", "18:00", "21:00")]],
				["trainer-B", [slot("monday", "18:00", "21:00")]],
			]),
			trainer_limits: new Map([
				["trainer-A", 8],
				["trainer-B", 8],
			]),
			room_ids: ["only-room"],
			day_start: "18:00",
			day_end: "21:00",
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(2)
		for (let i = 0; i < lessons.length; i++) {
			for (let j = i + 1; j < lessons.length; j++) {
				const a = lessons[i]!
				const b = lessons[j]!
				if (a.room_id && b.room_id && a.room_id === b.room_id) {
					const aS = a.start_at.slice(11, 16)
					const aE = a.end_at.slice(11, 16)
					const bS = b.start_at.slice(11, 16)
					const bE = b.end_at.slice(11, 16)
					expect(aS < bE && bS < aE).toBe(false)
				}
			}
		}
	})

	it("handles existing_lessons with different duration (overlap check)", () => {
		const input = defaultInput({
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", [slot("monday", "15:00", "18:00")]]]),
			trainer_availability: new Map([["trainer-1", [slot("monday", "15:00", "18:00")]]]),
			day_start: "15:00",
			day_end: "18:00",
			existing_lessons: [
				{ trainer_id: "trainer-1", room_id: null, start_at: "2026-02-23T15:00:00", end_at: "2026-02-23T16:30:00" },
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(1)
		const startMin = parseInt(lessons[0].start_at.slice(11, 13)) * 60 + parseInt(lessons[0].start_at.slice(14, 16))
		expect(startMin).toBeGreaterThanOrEqual(16 * 60 + 30)
	})
})

describe("allowedDaysForDistribution", () => {
	it("returns all 7 days for 'same'", () => {
		const days = allowedDaysForDistribution("same")
		expect(days.size).toBe(7)
	})

	it("returns only Mon, Tue, Wed for 'first_half'", () => {
		const days = allowedDaysForDistribution("first_half")
		expect([...days].sort()).toEqual(["monday", "tuesday", "wednesday"])
	})

	it("returns only Thu, Fri, Sat, Sun for 'second_half'", () => {
		const days = allowedDaysForDistribution("second_half")
		expect([...days].sort()).toEqual(["friday", "saturday", "sunday", "thursday"])
	})
})

describe("orderSlotsByDistribution (hard day filters)", () => {
	const slots = buildWeekSlots("2026-02-23", "09:00", "10:30", 45)

	it("keeps all 7 days for 'same'", () => {
		const out = orderSlotsByDistribution(slots, "same")
		const uniqueDays = new Set(out.map((s) => s.dayName))
		expect(uniqueDays.size).toBe(7)
	})

	it("returns only Mon/Tue/Wed slots for 'first_half'", () => {
		const out = orderSlotsByDistribution(slots, "first_half")
		const uniqueDays = new Set(out.map((s) => s.dayName))
		expect([...uniqueDays].sort()).toEqual(["monday", "tuesday", "wednesday"])
	})

	it("returns only Thu/Fri/Sat/Sun slots for 'second_half'", () => {
		const out = orderSlotsByDistribution(slots, "second_half")
		const uniqueDays = new Set(out.map((s) => s.dayName))
		expect([...uniqueDays].sort()).toEqual(["friday", "saturday", "sunday", "thursday"])
	})
})

describe("solveTimetable with day-filter distributions", () => {
	it("does NOT schedule lessons on Mon–Wed when distribution is 'second_half'", () => {
		const input = defaultInput({
			distribution: "second_half",
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 7,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", []]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons.length).toBeGreaterThan(0)
		for (const l of lessons) {
			const d = new Date(l.start_at.slice(0, 10) + "T12:00:00").getDay()
			// JS: Sun=0, Mon=1, ... Sat=6. Allowed days: Thu(4), Fri(5), Sat(6), Sun(0).
			expect([0, 4, 5, 6]).toContain(d)
		}
	})

	it("does NOT schedule lessons on Thu–Sun when distribution is 'first_half'", () => {
		const input = defaultInput({
			distribution: "first_half",
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 7,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", []]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons.length).toBeGreaterThan(0)
		for (const l of lessons) {
			const d = new Date(l.start_at.slice(0, 10) + "T12:00:00").getDay()
			// Allowed days: Mon(1), Tue(2), Wed(3)
			expect([1, 2, 3]).toContain(d)
		}
	})

	it("produces a shortfall when availability has no overlap with the distribution", () => {
		// Couple only available Monday, distribution Thu–Sun → zero lessons should be placed
		const input = defaultInput({
			distribution: "second_half",
			targets: [
				{
					id: "t1",
					student_id: null,
					couple_id: "c1",
					desired_lessons_count: 3,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["c1", [slot("monday", "09:00", "18:00")]]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(0)
	})
})

describe("solveTimetable with buffer_minutes", () => {
	it("buffer_minutes = 0 allows back-to-back trainer lessons (touching)", () => {
		// Restrict availability to a single day so spread distribution can't split the two
		// lessons across days — we want to observe back-to-back placement.
		const input = defaultInput({
			duration_minutes: 45,
			buffer_minutes: 0,
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
			target_availability: new Map([["s1", [slot("monday", "09:00", "12:00")]]]),
			trainer_availability: new Map([["trainer-1", [slot("monday", "09:00", "12:00")]]]),
		})
		const lessons = solveTimetable(input)
		const monday = lessons.filter((l) => l.start_at.slice(0, 10) === "2026-02-23")
		expect(monday.length).toBe(2)
		const sorted = monday
			.map((l) => ({ s: l.start_at.slice(11, 16), e: l.end_at.slice(11, 16) }))
			.sort((a, b) => a.s.localeCompare(b.s))
		expect(sorted[1]!.s).toBe(sorted[0]!.e)
	})

	it("buffer_minutes = 15 forbids back-to-back trainer lessons with 0 gap", () => {
		const input = defaultInput({
			duration_minutes: 45,
			buffer_minutes: 15,
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
		// All placed lessons for this trainer on any day must be separated by >= 15 minutes
		const toMin = (t: string) => {
			const [h, m] = t.split(":").map(Number)
			return (h ?? 0) * 60 + (m ?? 0)
		}
		const byDate = new Map<string, { s: number; e: number }[]>()
		for (const l of lessons) {
			const d = l.start_at.slice(0, 10)
			const s = toMin(l.start_at.slice(11, 16))
			const e = toMin(l.end_at.slice(11, 16))
			if (!byDate.has(d)) byDate.set(d, [])
			byDate.get(d)!.push({ s, e })
		}
		for (const list of byDate.values()) {
			list.sort((a, b) => a.s - b.s)
			for (let i = 1; i < list.length; i++) {
				expect(list[i]!.s - list[i - 1]!.e).toBeGreaterThanOrEqual(15)
			}
		}
	})

	it("buffer_minutes = 15 also forbids back-to-back for same student across trainers", () => {
		// Two trainers, one student, touching slots: if buffer is enabled the student can't be
		// placed twice without a gap even though different trainers are free at those times.
		const input = defaultInput({
			duration_minutes: 45,
			buffer_minutes: 15,
			trainer_ids: ["trainer-1", "trainer-2"],
			trainer_availability: new Map([
				["trainer-1", []],
				["trainer-2", []],
			]),
			trainer_limits: new Map([
				["trainer-1", 8],
				["trainer-2", 8],
			]),
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
		})
		const lessons = solveTimetable(input)
		const toMin = (t: string) => {
			const [h, m] = t.split(":").map(Number)
			return (h ?? 0) * 60 + (m ?? 0)
		}
		for (const a of lessons) {
			for (const b of lessons) {
				if (a === b) continue
				if (a.student_id !== b.student_id) continue
				if (a.start_at.slice(0, 10) !== b.start_at.slice(0, 10)) continue
				const gap = Math.abs(
					toMin(a.start_at.slice(11, 16)) - toMin(b.end_at.slice(11, 16))
				)
				const overlap =
					toMin(a.start_at.slice(11, 16)) < toMin(b.end_at.slice(11, 16)) &&
					toMin(b.start_at.slice(11, 16)) < toMin(a.end_at.slice(11, 16))
				expect(overlap).toBe(false)
				expect(gap).toBeGreaterThanOrEqual(15)
			}
		}
	})
})

describe("solveTimetable with max_consecutive_minutes + min_break_minutes", () => {
	it("allows two back-to-back 45-min lessons (streak = 90, cap = 90)", () => {
		const input = defaultInput({
			duration_minutes: 45,
			max_consecutive_minutes: 90,
			min_break_minutes: 15,
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
			target_availability: new Map([["s1", [slot("monday", "10:00", "12:00")]]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons.length).toBeGreaterThanOrEqual(2)
	})

	it("rejects a third touching lesson when streak would exceed cap without break", () => {
		// Narrow the whole day window so that the only candidate slots are the three touching
		// 45-min blocks 10:00–10:45, 10:45–11:30, 11:30–12:15. After placing the first two
		// (streak = 90) the third is touching and would exceed the cap — must be rejected.
		const input = defaultInput({
			day_start: "10:00",
			day_end: "12:15",
			duration_minutes: 45,
			max_consecutive_minutes: 90,
			min_break_minutes: 15,
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 3,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", [slot("monday", "10:00", "12:15")]]]),
			trainer_availability: new Map([["trainer-1", [slot("monday", "10:00", "12:15")]]]),
			distribution: "first_half",
		})
		const lessons = solveTimetable(input)
		const monday = lessons.filter((l) => l.start_at.slice(0, 10) === "2026-02-23")
		expect(monday.length).toBe(2)
	})

	it("allows a third lesson when separated by at least min_break_minutes", () => {
		// Window is wide enough for two touching lessons plus a third one starting 15+ minutes
		// after the second ends.
		const input = defaultInput({
			day_start: "10:00",
			day_end: "13:00",
			duration_minutes: 45,
			max_consecutive_minutes: 90,
			min_break_minutes: 15,
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 3,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", [slot("monday", "10:00", "13:00")]]]),
			trainer_availability: new Map([["trainer-1", [slot("monday", "10:00", "13:00")]]]),
			distribution: "first_half",
		})
		const lessons = solveTimetable(input)
		const monday = lessons
			.filter((l) => l.start_at.slice(0, 10) === "2026-02-23")
			.map((l) => ({ s: l.start_at.slice(11, 16), e: l.end_at.slice(11, 16) }))
			.sort((a, b) => a.s.localeCompare(b.s))
		expect(monday).toHaveLength(3)
		const toMin = (t: string) => {
			const [h, m] = t.split(":").map(Number)
			return (h ?? 0) * 60 + (m ?? 0)
		}
		// Gap between 2nd and 3rd must be >= 15
		expect(toMin(monday[2]!.s) - toMin(monday[1]!.e)).toBeGreaterThanOrEqual(15)
	})
})

describe("solveTimetable with cross-timetable participant conflicts", () => {
	it("does not place a student at a time that clashes with an existing lesson in another timetable", () => {
		const input = defaultInput({
			duration_minutes: 45,
			targets: [
				{
					id: "t1",
					student_id: "s1",
					couple_id: null,
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			target_availability: new Map([["s1", [slot("monday", "09:00", "09:45")]]]),
			trainer_availability: new Map([["trainer-1", []]]),
			existing_lessons: [
				{
					trainer_id: "trainer-other",
					room_id: null,
					student_id: "s1",
					couple_id: null,
					group_id: null,
					start_at: "2026-02-23T09:00:00",
					end_at: "2026-02-23T09:45:00",
				},
			],
		})
		const lessons = solveTimetable(input)
		// Student s1 is only free Monday 09:00–09:45; that slot collides with the existing
		// cross-timetable lesson, so nothing can be placed.
		expect(lessons).toHaveLength(0)
	})

	it("does not place a group at a time that clashes with an existing group lesson in another timetable", () => {
		const input = defaultInput({
			targets: [],
			group_targets: [
				{
					id: "gt-1",
					group_id: "g1",
					group_lesson_type_id: "glt-1",
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
				},
			],
			group_availability: new Map([["g1", [slot("monday", "09:00", "09:45")]]]),
			group_duration_minutes: new Map([["glt-1", 45]]),
			trainer_availability: new Map([["trainer-1", []]]),
			existing_lessons: [
				{
					trainer_id: "trainer-other",
					room_id: null,
					student_id: null,
					couple_id: null,
					group_id: "g1",
					start_at: "2026-02-23T09:00:00",
					end_at: "2026-02-23T09:45:00",
				},
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(0)
	})
})

describe("solveTimetable with member-level participant conflicts", () => {
	it("does not place a group at a time that clashes with an existing couple lesson sharing a member", () => {
		// Alice is in couple_ab (already scheduled elsewhere on Mon 09:00–09:45)
		// AND is a member of group_comp (we're trying to place it this week).
		// The group lesson must not land on Mon 09:00 because Alice is busy.
		const input = defaultInput({
			targets: [],
			group_targets: [
				{
					id: "gt-comp",
					group_id: "g-comp",
					group_lesson_type_id: "glt-1",
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
					user_ids: ["alice", "carol"],
				},
			],
			// Only Monday 09:00–09:45 is available — normally the group would land there.
			group_availability: new Map([["g-comp", [slot("monday", "09:00", "09:45")]]]),
			group_duration_minutes: new Map([["glt-1", 45]]),
			trainer_availability: new Map([["trainer-1", []]]),
			existing_lessons: [
				{
					trainer_id: "trainer-other",
					room_id: null,
					student_id: null,
					couple_id: "couple-ab",
					group_id: null,
					start_at: "2026-02-23T09:00:00",
					end_at: "2026-02-23T09:45:00",
					user_ids: ["alice", "bob"],
				},
			],
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(0)
	})

	it("does not place two groups sharing a member at the same slot within one run", () => {
		// Alice is in both group_comp and group_beg. If both have only Mon 09:00 open,
		// exactly one of them should be placed (member Alice cannot be in two places).
		const input = defaultInput({
			targets: [],
			group_targets: [
				{
					id: "gt-comp",
					group_id: "g-comp",
					group_lesson_type_id: "glt-1",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
					user_ids: ["alice", "carol"],
				},
				{
					id: "gt-beg",
					group_id: "g-beg",
					group_lesson_type_id: "glt-1",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
					user_ids: ["alice", "dave"],
				},
			],
			group_availability: new Map([
				["g-comp", [slot("monday", "09:00", "09:45")]],
				["g-beg", [slot("monday", "09:00", "09:45")]],
			]),
			group_duration_minutes: new Map([["glt-1", 45]]),
			trainer_ids: ["trainer-1", "trainer-2"],
			trainer_availability: new Map([
				["trainer-1", []],
				["trainer-2", []],
			]),
			trainer_limits: new Map([
				["trainer-1", 8],
				["trainer-2", 8],
			]),
			// Two rooms so room conflicts can't be the reason one is skipped.
			room_ids: ["room-1", "room-2"],
		})
		const lessons = solveTimetable(input)
		// Only one of the two groups can go at 09:00 — the shared member "alice"
		// blocks the second from landing at the same slot.
		expect(lessons).toHaveLength(1)
	})

	it("does not place a couple at a time that clashes with a same-run group sharing a member", () => {
		// Alice is in couple_ab AND in group_comp. The group is placed first (groups
		// run before individual/couple targets in the solver), so the couple must
		// not land at the same time. Group has only Monday open; couple has Monday
		// and Tuesday — we expect the couple to shift to Tuesday.
		const input = defaultInput({
			targets: [
				{
					id: "t-ab",
					student_id: null,
					couple_id: "couple-ab",
					desired_lessons_count: 1,
					priority: "medium",
					preferred_trainer_id: null,
					user_ids: ["alice", "bob"],
				},
			],
			target_availability: new Map([
				[
					"couple-ab",
					[slot("monday", "09:00", "09:45"), slot("tuesday", "09:00", "09:45")],
				],
			]),
			group_targets: [
				{
					id: "gt-comp",
					group_id: "g-comp",
					group_lesson_type_id: "glt-1",
					desired_lessons_count: 1,
					priority: "high",
					preferred_trainer_id: null,
					user_ids: ["alice", "carol"],
				},
			],
			group_availability: new Map([["g-comp", [slot("monday", "09:00", "09:45")]]]),
			group_duration_minutes: new Map([["glt-1", 45]]),
			trainer_availability: new Map([["trainer-1", []]]),
		})
		const lessons = solveTimetable(input)
		expect(lessons).toHaveLength(2)
		const group = lessons.find((l) => l.lesson_type === "group")
		const couple = lessons.find((l) => l.lesson_type === "couple")
		expect(group?.start_at.slice(0, 10)).toBe("2026-02-23") // Monday
		expect(couple?.start_at.slice(0, 10)).toBe("2026-02-24") // Tuesday – shifted because Alice is busy Monday
	})
})
