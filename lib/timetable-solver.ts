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
 * Returns true iff the lesson `[startTime, endTime)` is FULLY contained inside
 * at least one of the person's availability windows for the given date's
 * weekday.
 *
 * Strict containment (not just "overlaps") is required because a partial
 * overlap means part of the lesson happens when the person is NOT available.
 * E.g. trainer availability Mon 15:00–20:00 must reject a lesson 14:30–15:15
 * even though it shares 15 minutes with the window. The previous overlap-based
 * check was the root cause of "lessons outside availability" being generated
 * by the solver.
 *
 * Same-day windows that touch or overlap are merged first, so two adjacent
 * entries like `Mon 09:00–11:00` and `Mon 11:00–13:00` are treated as the
 * continuous block `Mon 09:00–13:00` and a 10:30–11:30 lesson is considered
 * valid.
 *
 * Empty availability is treated as "available" (no constraints), so lessons
 * can be generated when profiles/couples/groups haven't set availability yet.
 */
export function isAvailableAtSlot(
	availability: AvailabilitySlot[],
	dateStr: string,
	startTime: string,
	endTime: string
): boolean {
	if (!availability || availability.length === 0) return true
	const day = getDayName(dateStr)
	const ls = timeToMinutes(startTime)
	const le = timeToMinutes(endTime)
	if (le <= ls) return false

	// Gather every window on this weekday.
	const ranges: Array<[number, number]> = []
	for (const s of availability) {
		if (!s || typeof s.day !== "string") continue
		if (s.day.toLowerCase() !== day) continue
		const as = timeToMinutes(s.start)
		const ae = timeToMinutes(s.end)
		if (ae > as) ranges.push([as, ae])
	}
	if (ranges.length === 0) return false

	// Merge overlapping / touching windows so back-to-back entries form
	// one continuous range for the containment check.
	ranges.sort((a, b) => a[0] - b[0])
	const merged: Array<[number, number]> = [[ranges[0]![0], ranges[0]![1]]]
	for (let i = 1; i < ranges.length; i++) {
		const last = merged[merged.length - 1]!
		const [s, e] = ranges[i]!
		if (s <= last[1]) {
			last[1] = Math.max(last[1], e)
		} else {
			merged.push([s, e])
		}
	}

	// The lesson interval must be fully inside one of the merged ranges.
	for (const [ms, me] of merged) {
		if (ls >= ms && le <= me) return true
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

/**
 * Return the set of day names allowed by a distribution preference.
 * - "same": all 7 days are allowed.
 * - "first_half": only Mon, Tue, Wed (hard filter).
 * - "second_half": only Thu, Fri, Sat, Sun (hard filter).
 */
export function allowedDaysForDistribution(
	distribution: DistributionPreference
): Set<string> {
	if (distribution === "first_half") {
		return new Set(["monday", "tuesday", "wednesday"])
	}
	if (distribution === "second_half") {
		return new Set(["thursday", "friday", "saturday", "sunday"])
	}
	return new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
}

/**
 * Reorder slots so distribution is respected.
 * - "same": spread across days per time (try same time on different days first).
 * - "first_half": HARD filter to Mon–Wed only.
 * - "second_half": HARD filter to Thu–Sun only.
 */
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
	// Hard day filters: only slots on the allowed days are returned.
	const inRange =
		distribution === "first_half"
			? (i: number) => i <= 2
			: (i: number) => i >= 3
	return slots
		.filter((s) => inRange(dayIndex(s.date)))
		.sort((a, b) => {
			const da = dayIndex(a.date)
			const db = dayIndex(b.date)
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
	/**
	 * Individual user IDs this target "occupies": for a student target it's
	 * `[student_id]`, for a couple target it's both partner user IDs. Used to
	 * prevent double-booking the same person in two different kinds of
	 * lessons at the same time (e.g. Alice in couple_ab *and* Alice as a
	 * member of group_comp).
	 */
	user_ids?: string[]
}

export type SolverGroupTarget = {
	id: string
	group_id: string
	group_lesson_type_id: string
	desired_lessons_count: number
	priority: "high" | "medium" | "low"
	preferred_trainer_id: string | null
	/**
	 * Flattened list of individual user IDs that belong to this group.
	 * Couple members contribute their partner IDs; solo members contribute
	 * their own.
	 *
	 * TODO (group availability by member not couple maybe): right now the
	 * group's computed `availability` is treated as authoritative, which
	 * intersects couple partners' availabilities elsewhere — so a group
	 * lesson is considered valid as long as the group's own availability
	 * covers the slot, even if only one half of a member-couple is free.
	 * If we later want strict per-member availability (every individual
	 * must personally be free), the right hook is here: walk `user_ids`
	 * and call `isAvailableAtSlot` per profile before placing.
	 */
	user_ids?: string[]
}

export type DistributionPreference = "first_half" | "second_half" | "same"

/** Pre-existing lesson from another timetable that the solver must not conflict with. */
export type ExistingLesson = {
	trainer_id: string | null
	room_id: string | null
	student_id?: string | null
	couple_id?: string | null
	group_id?: string | null
	start_at: string
	end_at: string
	/**
	 * Individual user IDs this lesson occupies. Enables member-level conflict
	 * detection across different lesson kinds (e.g. Alice booked in a couple
	 * lesson cannot also be booked via a group lesson at the same time).
	 */
	user_ids?: string[]
}

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
	/** Lessons from other active timetables – solver avoids trainer, room, and participant conflicts with these. */
	existing_lessons?: ExistingLesson[]
	/**
	 * Minimum gap (minutes) that must separate every pair of lessons for the same
	 * trainer OR same participant (student/couple/group). `0` or missing disables the rule.
	 */
	buffer_minutes?: number
	/**
	 * Maximum zero-gap streak of minutes per trainer per day. Once exceeded, the
	 * next lesson for that trainer on that day must be separated by at least
	 * `min_break_minutes`. `0` or missing disables the rule.
	 */
	max_consecutive_minutes?: number
	/** Required gap (minutes) once the streak reaches `max_consecutive_minutes`. */
	min_break_minutes?: number
	/**
	 * If true, only Saturday and Sunday dates from the generated week are
	 * considered. Used for `recurrence = weekends_only`: the week anchor is
	 * the Saturday, but `buildWeekSlots` still creates Mon–Fri; without this,
	 * group/individual passes can place on weekdays and the generate route
	 * later strips them — leaving "missing" lessons while diagnostics still
	 * show feasible weekend slots.
	 */
	only_weekend_days?: boolean
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
function keepOnlyWeekendDays<T extends { date: string }>(slots: T[]): T[] {
	return slots.filter((s) => {
		const w = new Date(s.date + "T12:00:00").getDay()
		return w === 0 || w === 6
	})
}

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
		only_weekend_days: onlyWeekendDays = false,
	} = input

	const slots = (() => {
		const s = buildWeekSlots(week_start_monday, day_start, day_end, duration_minutes)
		return onlyWeekendDays ? keepOnlyWeekendDays(s) : s
	})()
	const orderedSlots = orderSlotsByDistribution(slots, distribution)
	const sortedTargets = [...targets].sort(
		(a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
	)

	const existingLessons = input.existing_lessons ?? []
	const bufferMinutes = Math.max(0, input.buffer_minutes ?? 0)
	const maxConsecutiveMinutes = Math.max(0, input.max_consecutive_minutes ?? 0)
	const minBreakMinutes = Math.max(0, input.min_break_minutes ?? 0)

	const lessons: LessonRow[] = []
	/**
	 * Parallel to `lessons`: the individual user IDs occupied by the lesson at
	 * each index. Kept in lock-step with `lessons.push(...)` so member-level
	 * conflict checks can reason about who's already booked.
	 */
	const lessonUserIds: string[][] = []
	const trainerDayCount = new Map<string, Map<string, number>>()
	// roomUsage: `${roomId}|${date}` → list of [start, end) intervals booked this run.
	// Keyed by room+date (NOT exact slot start/end) so lessons of different
	// durations in the same room on the same day are correctly detected as
	// overlapping. Example: a 60-min group at 18:00–19:00 and a 90-min group
	// at 18:00–19:30 share the room at 18:00 and must collide.
	const roomUsage = new Map<string, { start: string; end: string }[]>()

	// Index external lessons by room+date for efficient overlap lookups
	const externalRoomLessons = new Map<string, { start: string; end: string }[]>()
	for (const el of existingLessons) {
		if (!el.room_id) continue
		const date = el.start_at.slice(0, 10)
		const k = `${el.room_id}|${date}`
		if (!externalRoomLessons.has(k)) externalRoomLessons.set(k, [])
		externalRoomLessons.get(k)!.push({ start: el.start_at.slice(11, 16), end: el.end_at.slice(11, 16) })
	}

	/** For "same"/spread distribution, prefer days where the given entity (target or group) has fewer lessons so far. */
	function sortSlotsForEntity(
		baseSlots: Slot[],
		entityDayCounts: Map<string, number>
	): Slot[] {
		if (distribution !== "same") return baseSlots
		return [...baseSlots].sort((a, b) => {
			const ca = entityDayCounts.get(a.date) ?? 0
			const cb = entityDayCounts.get(b.date) ?? 0
			if (ca !== cb) return ca - cb
			const da = dayIndex(a.date)
			const db = dayIndex(b.date)
			if (da !== db) return da - db
			if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime)
			return a.endTime.localeCompare(b.endTime)
		})
	}

	function getTrainerCount(trainerId: string, date: string): number {
		return trainerDayCount.get(trainerId)?.get(date) ?? 0
	}
	function incTrainerCount(trainerId: string, date: string): void {
		if (!trainerDayCount.has(trainerId)) trainerDayCount.set(trainerId, new Map())
		const m = trainerDayCount.get(trainerId)!
		m.set(date, (m.get(date) ?? 0) + 1)
	}
	function isRoomFreeAtSlot(roomId: string, date: string, start: string, end: string): boolean {
		const inRunKey = `${roomId}|${date}`
		const inRun = roomUsage.get(inRunKey)
		if (inRun) {
			for (const e of inRun) {
				if (timeOverlaps(e.start, e.end, start, end)) return false
			}
		}
		const ext = externalRoomLessons.get(inRunKey)
		if (ext) {
			for (const e of ext) {
				if (timeOverlaps(e.start, e.end, start, end)) return false
			}
		}
		return true
	}
	function useRoom(roomId: string, date: string, start: string, end: string): void {
		const key = `${roomId}|${date}`
		if (!roomUsage.has(key)) roomUsage.set(key, [])
		roomUsage.get(key)!.push({ start, end })
	}

	function trainerAvailable(trainerId: string, date: string, start: string, end: string): boolean {
		const limit = trainer_limits.get(trainerId)
		if (limit != null && getTrainerCount(trainerId, date) >= limit) return false
		const av = trainer_availability.get(trainerId) ?? []
		return isAvailableAtSlot(av, date, start, end)
	}

	function trainerBusyAtSlot(trainerId: string, date: string, start: string, end: string): boolean {
		for (const l of lessons) {
			if (
				l.trainer_id === trainerId &&
				l.start_at.slice(0, 10) === date &&
				timeOverlaps(l.start_at.slice(11, 16), l.end_at.slice(11, 16), start, end)
			) return true
		}
		for (const el of existingLessons) {
			if (
				el.trainer_id === trainerId &&
				el.start_at.slice(0, 10) === date &&
				timeOverlaps(el.start_at.slice(11, 16), el.end_at.slice(11, 16), start, end)
			) return true
		}
		return false
	}

	/** Gap in minutes between [aStart,aEnd) and [bStart,bEnd) on the same day. 0 if touching, negative if overlapping. */
	function gapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
		const as = timeToMinutes(aStart)
		const ae = timeToMinutes(aEnd)
		const bs = timeToMinutes(bStart)
		const be = timeToMinutes(bEnd)
		if (ae <= bs) return bs - ae
		if (be <= as) return as - be
		return -1
	}

	type PlacedLesson = {
		date: string
		start: string
		end: string
		trainerId: string | null
		studentId: string | null
		coupleId: string | null
		groupId: string | null
		userIds: string[]
	}

	/** Iterate every lesson placed so far (this run + cross-timetable existing) on a given date. */
	function* lessonsOnDate(date: string): Iterable<PlacedLesson> {
		for (let i = 0; i < lessons.length; i++) {
			const l = lessons[i]!
			if (l.start_at.slice(0, 10) !== date) continue
			yield {
				date,
				start: l.start_at.slice(11, 16),
				end: l.end_at.slice(11, 16),
				trainerId: l.trainer_id,
				studentId: l.student_id,
				coupleId: l.couple_id,
				groupId: l.group_id ?? null,
				userIds: lessonUserIds[i] ?? [],
			}
		}
		for (const el of existingLessons) {
			if (el.start_at.slice(0, 10) !== date) continue
			yield {
				date,
				start: el.start_at.slice(11, 16),
				end: el.end_at.slice(11, 16),
				trainerId: el.trainer_id,
				studentId: el.student_id ?? null,
				coupleId: el.couple_id ?? null,
				groupId: el.group_id ?? null,
				userIds: el.user_ids ?? [],
			}
		}
	}

	/** True iff arrays `a` and `b` share at least one element. */
	function sharesAnyUser(a: string[], b: string[]): boolean {
		if (a.length === 0 || b.length === 0) return false
		const set = new Set(a)
		for (const x of b) if (set.has(x)) return true
		return false
	}

	/** True if placing [start,end) for trainerId on `date` would leave any lesson (same trainer) closer than bufferMinutes. */
	function violatesBufferTrainer(trainerId: string, date: string, start: string, end: string): boolean {
		if (bufferMinutes <= 0) return false
		for (const other of lessonsOnDate(date)) {
			if (other.trainerId !== trainerId) continue
			const gap = gapMinutes(start, end, other.start, other.end)
			if (gap >= 0 && gap < bufferMinutes) return true
		}
		return false
	}

	/**
	 * True if placing [start,end) for the given participant on `date` would leave any lesson
	 * for the same participant (student/couple/group) — or *any individual member shared*
	 * with this participant — closer than bufferMinutes.
	 * Passing `null` for an id means "no participant of that kind"; checks are skipped for nulls.
	 */
	function violatesBufferParticipant(
		participant: {
			student_id: string | null
			couple_id: string | null
			group_id: string | null
			user_ids: string[]
		},
		date: string,
		start: string,
		end: string
	): boolean {
		if (bufferMinutes <= 0) return false
		for (const other of lessonsOnDate(date)) {
			const sameStudent = participant.student_id != null && other.studentId === participant.student_id
			const sameCouple = participant.couple_id != null && other.coupleId === participant.couple_id
			const sameGroup = participant.group_id != null && other.groupId === participant.group_id
			const sharesMember = sharesAnyUser(participant.user_ids, other.userIds)
			if (!sameStudent && !sameCouple && !sameGroup && !sharesMember) continue
			const gap = gapMinutes(start, end, other.start, other.end)
			if (gap >= 0 && gap < bufferMinutes) return true
		}
		return false
	}

	/**
	 * True if a new lesson [start,end) for `trainerId` on `date` would exceed
	 * `maxConsecutiveMinutes` of zero-gap streak without at least `minBreakMinutes`
	 * separating it from the prior lesson.
	 *
	 * "Consecutive" = touching (end of one == start of next, i.e. gap == 0).
	 */
	function violatesConsecutiveRule(trainerId: string, date: string, start: string, end: string): boolean {
		if (maxConsecutiveMinutes <= 0) return false
		const trainerLessons: { start: string; end: string }[] = []
		for (const other of lessonsOnDate(date)) {
			if (other.trainerId !== trainerId) continue
			trainerLessons.push({ start: other.start, end: other.end })
		}
		const startMin = timeToMinutes(start)
		const endMin = timeToMinutes(end)
		const sorted = [...trainerLessons, { start, end }].sort(
			(a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)
		)
		// Walk the streak that contains [start,end) — chain of lessons where each touches the next (gap == 0)
		const idx = sorted.findIndex((l) => l.start === start && l.end === end)
		let streakStart = timeToMinutes(sorted[idx]!.start)
		let streakEnd = timeToMinutes(sorted[idx]!.end)
		for (let i = idx - 1; i >= 0; i--) {
			const cur = sorted[i]!
			if (timeToMinutes(cur.end) === streakStart) {
				streakStart = timeToMinutes(cur.start)
			} else break
		}
		for (let i = idx + 1; i < sorted.length; i++) {
			const cur = sorted[i]!
			if (timeToMinutes(cur.start) === streakEnd) {
				streakEnd = timeToMinutes(cur.end)
			} else break
		}
		const streak = streakEnd - streakStart
		if (streak <= maxConsecutiveMinutes) return false
		// Streak exceeds cap — require that the nearest earlier lesson ended at least
		// minBreakMinutes before the candidate start, or nearest later lesson starts
		// at least minBreakMinutes after the candidate end.
		let nearestPriorEnd: number | null = null
		let nearestNextStart: number | null = null
		for (const l of trainerLessons) {
			const ls = timeToMinutes(l.start)
			const le = timeToMinutes(l.end)
			if (le <= startMin) {
				if (nearestPriorEnd == null || le > nearestPriorEnd) nearestPriorEnd = le
			}
			if (ls >= endMin) {
				if (nearestNextStart == null || ls < nearestNextStart) nearestNextStart = ls
			}
		}
		const priorGap = nearestPriorEnd == null ? Infinity : startMin - nearestPriorEnd
		// The rule is "after the streak reaches the cap, the NEXT lesson can only be placed
		// if the gap since the prior lesson is >= min_break_minutes". So we only care about
		// the immediately-preceding lesson for the candidate — a break afterwards cannot
		// retroactively fix a missing break before this placement.
		return priorGap < minBreakMinutes
	}

	/**
	 * True if placing [start,end) on `date` would overlap any lesson — already
	 * placed this run OR from another active timetable — that shares one of
	 * the participant ids *or* any individual member with this participant.
	 *
	 * Checking both buckets (this run + existing) here means the solver can't
	 * double-book Alice inside one timetable either: if she's already in a
	 * couple lesson we just placed, she can't be placed again via a group
	 * target in the same pass.
	 */
	function participantBusy(
		participant: {
			student_id: string | null
			couple_id: string | null
			group_id: string | null
			user_ids: string[]
		},
		date: string,
		start: string,
		end: string
	): boolean {
		for (const other of lessonsOnDate(date)) {
			const sameStudent = participant.student_id != null && other.studentId === participant.student_id
			const sameCouple = participant.couple_id != null && other.coupleId === participant.couple_id
			const sameGroup = participant.group_id != null && other.groupId === participant.group_id
			const sharesMember = sharesAnyUser(participant.user_ids, other.userIds)
			if (!sameStudent && !sameCouple && !sameGroup && !sharesMember) continue
			if (timeOverlaps(other.start, other.end, start, end)) return true
		}
		return false
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
			if (violatesBufferTrainer(tid, date, start, end)) continue
			if (violatesConsecutiveRule(tid, date, start, end)) continue
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
			const groupSlots = (() => {
				const s = buildWeekSlots(week_start_monday, day_start, day_end, dur)
				return onlyWeekendDays ? keepOnlyWeekendDays(s) : s
			})()
			const orderedGroupSlots = orderSlotsByDistribution(groupSlots, distribution)
			const sorted = [...targetsWithDur].sort(
				(a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
			)
			for (const gt of sorted) {
				const av = groupAvailability.get(gt.group_id) ?? []
				let placed = 0
				const dayCounts = new Map<string, number>()
				const participant = {
					student_id: null,
					couple_id: null,
					group_id: gt.group_id,
					user_ids: gt.user_ids ?? [],
				}

				// Try to spread this group's lessons across the week when using "Spread" distribution
				while (placed < gt.desired_lessons_count) {
					let placedInThisPass = false
					const candidateSlots = sortSlotsForEntity(orderedGroupSlots, dayCounts)
					for (const slot of candidateSlots) {
						if (placed >= gt.desired_lessons_count) break
						if (!isAvailableAtSlot(av, slot.date, slot.startTime, slot.endTime)) continue
						if (participantBusy(participant, slot.date, slot.startTime, slot.endTime)) continue
						if (violatesBufferParticipant(participant, slot.date, slot.startTime, slot.endTime)) continue
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
						lessonUserIds.push(gt.user_ids ?? [])
						incTrainerCount(assigned.trainerId, slot.date)
						if (assigned.roomId) useRoom(assigned.roomId, slot.date, slot.startTime, slot.endTime)
						dayCounts.set(slot.date, (dayCounts.get(slot.date) ?? 0) + 1)
						placed++
						placedInThisPass = true
					}
					if (!placedInThisPass) break
				}
			}
		}
	}

	// Individual/couple lessons: placed after group lessons
	if (distribution === "same") {
		// Global, slot-first strategy for "Spread":
		// - Walk through time slots in spread-friendly order (orderSlotsByDistribution).
		// - At each slot, pick the best target (by priority, then fewest lessons so far) that is available.
		type TargetState = {
			target: SolverTarget
			remaining: number
			totalPlaced: number
		}
		const stateById = new Map<string, TargetState>()
		for (const t of sortedTargets) {
			if (t.desired_lessons_count <= 0) continue
			stateById.set(t.id, {
				target: t,
				remaining: t.desired_lessons_count,
				totalPlaced: 0,
			})
		}

		for (const slot of orderedSlots) {
			// Find the best candidate target for this slot.
			let best: TargetState | null = null
			for (const t of sortedTargets) {
				const st = stateById.get(t.id)
				if (!st || st.remaining <= 0) continue
				const key = t.student_id ?? t.couple_id ?? t.id
				const av = target_availability.get(key) ?? []
				if (!isAvailableAtSlot(av, slot.date, slot.startTime, slot.endTime)) continue
				const participant = {
					student_id: t.student_id,
					couple_id: t.couple_id,
					group_id: null,
					user_ids: t.user_ids ?? [],
				}
				if (participantBusy(participant, slot.date, slot.startTime, slot.endTime)) continue
				if (violatesBufferParticipant(participant, slot.date, slot.startTime, slot.endTime)) continue

				if (!best) {
					best = st
					continue
				}
				// Both have same priority because we iterate sortedTargets (high -> low).
				// Prefer the one with fewer total lessons placed so far.
				if (st.totalPlaced < best.totalPlaced) {
					best = st
				}
			}

			if (!best) continue

			const t = best.target
			const lessonType: "individual" | "couple" = t.student_id ? "individual" : "couple"
			const assigned = pickTrainerAndRoom(
				slot.date,
				slot.startTime,
				slot.endTime,
				t.preferred_trainer_id
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
				student_id: t.student_id,
				couple_id: t.couple_id,
				is_static: false,
			})
			lessonUserIds.push(t.user_ids ?? [])
			incTrainerCount(assigned.trainerId, slot.date)
			if (assigned.roomId) useRoom(assigned.roomId, slot.date, slot.startTime, slot.endTime)
			best.remaining -= 1
			best.totalPlaced += 1
		}
	} else {
		// For other distributions (Mon–Wed / Thu–Sun first), keep the simpler per-target greedy behavior.
		for (const target of sortedTargets) {
			const key = target.student_id ?? target.couple_id ?? target.id
			const av = target_availability.get(key) ?? []
			const lessonType: "individual" | "couple" = target.student_id ? "individual" : "couple"
			const participant = {
				student_id: target.student_id,
				couple_id: target.couple_id,
				group_id: null,
				user_ids: target.user_ids ?? [],
			}
			let placed = 0

			for (const slot of orderedSlots) {
				if (placed >= target.desired_lessons_count) break
				if (!isAvailableAtSlot(av, slot.date, slot.startTime, slot.endTime)) continue
				if (participantBusy(participant, slot.date, slot.startTime, slot.endTime)) continue
				if (violatesBufferParticipant(participant, slot.date, slot.startTime, slot.endTime)) continue

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
				lessonUserIds.push(target.user_ids ?? [])
				incTrainerCount(assigned.trainerId, slot.date)
				if (assigned.roomId) useRoom(assigned.roomId, slot.date, slot.startTime, slot.endTime)
				placed++
			}
		}
	}

	return lessons
}
