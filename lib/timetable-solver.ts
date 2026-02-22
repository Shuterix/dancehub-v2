/**
 * Greedy timetable solver: assigns individual/couple lessons to time slots
 * for one week based on targets, preferences, trainer limits, and availability.
 */

import type { AvailabilitySlot } from "./availability"

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const

function getDayName(dateStr: string): string {
	const d = new Date(dateStr + "T12:00:00")
	const i = d.getDay()
	return DAY_NAMES[i]
}

/** "HH:mm" to minutes since midnight */
function timeToMinutes(t: string): number {
	const [h, m] = t.split(":").map(Number)
	return (h ?? 0) * 60 + (m ?? 0)
}

/** Does [start1, end1) overlap [start2, end2) in time? */
function timeOverlaps(start1: string, end1: string, start2: string, end2: string): boolean {
	const s1 = timeToMinutes(start1)
	const e1 = timeToMinutes(end1)
	const s2 = timeToMinutes(start2)
	const e2 = timeToMinutes(end2)
	return s1 < e2 && s2 < e1
}

/**
 * Returns true if the person is available at the given slot.
 * Empty availability is treated as "available" (no constraints), so lessons can be
 * generated when profiles/couples haven't set availability yet.
 */
export function isAvailableAtSlot(
	availability: AvailabilitySlot[],
	dateStr: string,
	startTime: string,
	endTime: string
): boolean {
	if (!availability || availability.length === 0) return true
	const day = getDayName(dateStr)
	for (const s of availability) {
		if (s.day.toLowerCase() !== day) continue
		if (timeOverlaps(s.start, s.end, startTime, endTime)) return true
	}
	return false
}

/** Parse "HH:mm" or "H:mm"; return minutes or 0. */
function parseDayTime(s: string): number {
	if (!s || typeof s !== "string") return 0
	const [h, m] = s.split(":").map(Number)
	return (h ?? 0) * 60 + (m ?? 0)
}

function formatDateLocal(d: Date): string {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	return `${y}-${m}-${day}`
}

/** Generate all bookable slots for one week (Mon–Sun) in timetable's day window. */
export function buildWeekSlots(
	weekStartMonday: string,
	dayStart: string,
	dayEnd: string,
	durationMinutes: number
): { date: string; startTime: string; endTime: string; dayName: string }[] {
	const startMin = parseDayTime(dayStart)
	const endMin = parseDayTime(dayEnd)
	const slots: { date: string; startTime: string; endTime: string; dayName: string }[] = []

	const [y, month, day] = weekStartMonday.split("-").map(Number)
	const monday = new Date(y, (month ?? 1) - 1, day ?? 1)
	for (let d = 0; d < 7; d++) {
		const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d)
		const dateStr = formatDateLocal(date)
		const dayName = getDayName(dateStr)

		for (let min = startMin; min + durationMinutes <= endMin; min += durationMinutes) {
			const h = Math.floor(min / 60)
			const m = min % 60
			const eh = Math.floor((min + durationMinutes) / 60)
			const em = (min + durationMinutes) % 60
			const startTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
			const endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`
			slots.push({ date: dateStr, startTime, endTime, dayName })
		}
	}
	return slots
}

type Slot = { date: string; startTime: string; endTime: string; dayName: string }

/** Monday = 0, Tuesday = 1, ... Sunday = 6 */
function dayIndex(dateStr: string): number {
	const d = new Date(dateStr + "T12:00:00")
	return (d.getDay() + 6) % 7
}

/** Reorder slots so distribution is respected: same = spread across days per time; first_half = Mon–Wed first; second_half = Thu–Sun first. */
export function orderSlotsByDistribution(
	slots: Slot[],
	distribution: DistributionPreference = "same"
): Slot[] {
	if (distribution === "same") {
		// Group by (startTime, endTime), then for each time put all 7 days in order → try same time on different days first
		const byTime = new Map<string, Slot[]>()
		for (const s of slots) {
			const key = `${s.startTime}-${s.endTime}`
			if (!byTime.has(key)) byTime.set(key, [])
			byTime.get(key)!.push(s)
		}
		const sorted = [...byTime.entries()].sort(([a], [b]) => a.localeCompare(b))
		const result: Slot[] = []
		for (const [, daySlots] of sorted) {
			daySlots.sort((a, b) => dayIndex(a.date) - dayIndex(b.date))
			result.push(...daySlots)
		}
		return result
	}
	if (distribution === "first_half") {
		return [...slots].sort((a, b) => {
			const da = dayIndex(a.date)
			const db = dayIndex(b.date)
			const halfA = da <= 2 ? 0 : 1
			const halfB = db <= 2 ? 0 : 1
			if (halfA !== halfB) return halfA - halfB
			if (da !== db) return da - db
			return a.startTime.localeCompare(b.startTime)
		})
	}
	// second_half: Thu(3)–Sun(6) first
	return [...slots].sort((a, b) => {
		const da = dayIndex(a.date)
		const db = dayIndex(b.date)
		const halfA = da >= 3 ? 0 : 1
		const halfB = db >= 3 ? 0 : 1
		if (halfA !== halfB) return halfA - halfB
		if (da !== db) return da - db
		return a.startTime.localeCompare(b.startTime)
	})
}

export type SolverTarget = {
	id: string
	student_id: string | null
	couple_id: string | null
	desired_lessons_count: number
	priority: "high" | "medium" | "low"
	preferred_trainer_id: string | null
}

export type SolverGroupTarget = {
	id: string
	group_id: string
	group_lesson_type_id: string
	desired_lessons_count: number
	priority: "high" | "medium" | "low"
	preferred_trainer_id: string | null
}

export type DistributionPreference = "first_half" | "second_half" | "same"

export type SolverInput = {
	timetable_id: string
	week_start_monday: string
	day_start: string
	day_end: string
	duration_minutes: number
	targets: SolverTarget[]
	trainer_ids: string[]
	trainer_availability: Map<string, AvailabilitySlot[]>
	target_availability: Map<string, AvailabilitySlot[]>
	trainer_limits: Map<string, number>
	room_ids: string[]
	/** When "same", slots are ordered to spread across the week (try each time slot on all days first). */
	distribution?: DistributionPreference
	/** Group lesson targets (optional). */
	group_targets?: SolverGroupTarget[]
	/** Group id -> availability (intersection of members). */
	group_availability?: Map<string, AvailabilitySlot[]>
	/** Group lesson type id -> duration in minutes. */
	group_duration_minutes?: Map<string, number>
}

export type LessonRow = {
	timetable_id: string
	lesson_type: "individual" | "couple" | "group"
	start_at: string
	end_at: string
	room_id: string | null
	trainer_id: string
	student_id: string | null
	couple_id: string | null
	group_id?: string | null
	group_lesson_type_id?: string | null
	is_static: false
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

/**
 * Greedy solver: for each target (by priority), assign desired_lessons_count lessons
 * to the first valid slots (target + trainer available, trainer under limit, room free).
 */
export function solveTimetable(input: SolverInput): LessonRow[] {
	const {
		timetable_id,
		week_start_monday,
		duration_minutes,
		targets,
		trainer_ids,
		trainer_availability,
		target_availability,
		trainer_limits,
		room_ids,
		day_start,
		day_end,
		distribution = "same",
	} = input

	const slots = buildWeekSlots(week_start_monday, day_start, day_end, duration_minutes)
	const orderedSlots = orderSlotsByDistribution(slots, distribution)
	const sortedTargets = [...targets].sort(
		(a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
	)

	const lessons: LessonRow[] = []
	const trainerDayCount = new Map<string, Map<string, number>>()
	const slotKey = (date: string, start: string, end: string) => `${date}T${start}-${end}`
	const roomUsage = new Map<string, Set<string>>()

	function getTrainerCount(trainerId: string, date: string): number {
		return trainerDayCount.get(trainerId)?.get(date) ?? 0
	}
	function incTrainerCount(trainerId: string, date: string): void {
		if (!trainerDayCount.has(trainerId)) trainerDayCount.set(trainerId, new Map())
		const m = trainerDayCount.get(trainerId)!
		m.set(date, (m.get(date) ?? 0) + 1)
	}
	function isRoomFreeAtSlot(roomId: string, date: string, start: string, end: string): boolean {
		const key = slotKey(date, start, end)
		const used = roomUsage.get(key)
		return !used || !used.has(roomId)
	}
	function useRoom(roomId: string, date: string, start: string, end: string): void {
		const key = slotKey(date, start, end)
		if (!roomUsage.has(key)) roomUsage.set(key, new Set())
		roomUsage.get(key)!.add(roomId)
	}

	function trainerAvailable(trainerId: string, date: string, start: string, end: string): boolean {
		const limit = trainer_limits.get(trainerId)
		if (limit != null && getTrainerCount(trainerId, date) >= limit) return false
		const av = trainer_availability.get(trainerId) ?? []
		return isAvailableAtSlot(av, date, start, end)
	}

	function trainerBusyAtSlot(trainerId: string, date: string, start: string, end: string): boolean {
		return lessons.some(
			(l) =>
				l.trainer_id === trainerId &&
				l.start_at.slice(0, 10) === date &&
				timeOverlaps(l.start_at.slice(11, 16), l.end_at.slice(11, 16), start, end)
		)
	}

	function pickTrainerAndRoom(
		date: string,
		start: string,
		end: string,
		preferredTrainerId: string | null
	): { trainerId: string; roomId: string | null } | null {
		const candidates = preferredTrainerId && trainer_ids.includes(preferredTrainerId)
			? [preferredTrainerId, ...trainer_ids.filter((id) => id !== preferredTrainerId)]
			: trainer_ids

		for (const tid of candidates) {
			if (!trainerAvailable(tid, date, start, end)) continue
			if (trainerBusyAtSlot(tid, date, start, end)) continue
			for (const rid of room_ids) {
				if (isRoomFreeAtSlot(rid, date, start, end)) {
					return { trainerId: tid, roomId: rid }
				}
			}
			if (room_ids.length === 0) return { trainerId: tid, roomId: null }
		}
		return null
	}

	// Group lessons first (highest priority): place before individual/couple so they get best slots
	const groupTargets = input.group_targets ?? []
	const groupAvailability = input.group_availability ?? new Map()
	const groupDurations = input.group_duration_minutes ?? new Map()
	const defaultDuration = duration_minutes
	if (groupTargets.length > 0) {
		const byDuration = new Map<number, SolverGroupTarget[]>()
		for (const gt of groupTargets) {
			const dur = groupDurations.get(gt.group_lesson_type_id) ?? defaultDuration
			if (dur <= 0) continue
			if (!byDuration.has(dur)) byDuration.set(dur, [])
			byDuration.get(dur)!.push(gt)
		}
		for (const [dur, targetsWithDur] of byDuration) {
			const groupSlots = buildWeekSlots(week_start_monday, day_start, day_end, dur)
			const orderedGroupSlots = orderSlotsByDistribution(groupSlots, distribution)
			const sorted = [...targetsWithDur].sort(
				(a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
			)
			for (const gt of sorted) {
				const av = groupAvailability.get(gt.group_id) ?? []
				let placed = 0
				for (const slot of orderedGroupSlots) {
					if (placed >= gt.desired_lessons_count) break
					if (!isAvailableAtSlot(av, slot.date, slot.startTime, slot.endTime)) continue
					const assigned = pickTrainerAndRoom(
						slot.date,
						slot.startTime,
						slot.endTime,
						gt.preferred_trainer_id
					)
					if (!assigned) continue
					const startAt = `${slot.date}T${slot.startTime}:00`
					const endAt = `${slot.date}T${slot.endTime}:00`
					lessons.push({
						timetable_id,
						lesson_type: "group",
						start_at: startAt,
						end_at: endAt,
						room_id: assigned.roomId,
						trainer_id: assigned.trainerId,
						student_id: null,
						couple_id: null,
						group_id: gt.group_id,
						group_lesson_type_id: gt.group_lesson_type_id,
						is_static: false,
					})
					incTrainerCount(assigned.trainerId, slot.date)
					if (assigned.roomId) useRoom(assigned.roomId, slot.date, slot.startTime, slot.endTime)
					placed++
				}
			}
		}
	}

	// Individual/couple lessons: placed after group lessons
	for (const target of sortedTargets) {
		const key = target.student_id ?? target.couple_id ?? target.id
		const av = target_availability.get(key) ?? []
		const lessonType: "individual" | "couple" = target.student_id ? "individual" : "couple"
		let placed = 0

		for (const slot of orderedSlots) {
			if (placed >= target.desired_lessons_count) break
			if (!isAvailableAtSlot(av, slot.date, slot.startTime, slot.endTime)) continue

			const assigned = pickTrainerAndRoom(
				slot.date,
				slot.startTime,
				slot.endTime,
				target.preferred_trainer_id
			)
			if (!assigned) continue

			const startAt = `${slot.date}T${slot.startTime}:00`
			const endAt = `${slot.date}T${slot.endTime}:00`
			lessons.push({
				timetable_id,
				lesson_type: lessonType,
				start_at: startAt,
				end_at: endAt,
				room_id: assigned.roomId,
				trainer_id: assigned.trainerId,
				student_id: target.student_id,
				couple_id: target.couple_id,
				is_static: false,
			})
			incTrainerCount(assigned.trainerId, slot.date)
			if (assigned.roomId) useRoom(assigned.roomId, slot.date, slot.startTime, slot.endTime)
			placed++
		}
	}

	return lessons
}
