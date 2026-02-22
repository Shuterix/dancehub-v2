export type AvailabilitySlot = { day: string; start: string; end: string }

/**
 * Returns time slots when both partners are available (intersection per day).
 * Assumes start/end are "HH:mm" and same day slots are compared by time overlap.
 */
export function intersectAvailability(
	a: AvailabilitySlot[],
	b: AvailabilitySlot[]
): AvailabilitySlot[] {
	const result: AvailabilitySlot[] = []
	const byDayA = new Map<string, { start: string; end: string }[]>()
	const byDayB = new Map<string, { start: string; end: string }[]>()
	for (const s of a) {
		if (!byDayA.has(s.day)) byDayA.set(s.day, [])
		byDayA.get(s.day)!.push({ start: s.start, end: s.end })
	}
	for (const s of b) {
		if (!byDayB.has(s.day)) byDayB.set(s.day, [])
		byDayB.get(s.day)!.push({ start: s.start, end: s.end })
	}
	const days = new Set([...byDayA.keys(), ...byDayB.keys()])
	for (const day of days) {
		const slotsA = byDayA.get(day) ?? []
		const slotsB = byDayB.get(day) ?? []
		for (const sa of slotsA) {
			for (const sb of slotsB) {
				const startOverlap = sa.start > sb.start ? sa.start : sb.start
				const endOverlap = sa.end < sb.end ? sa.end : sb.end
				if (startOverlap < endOverlap) {
					result.push({ day, start: startOverlap, end: endOverlap })
				}
			}
		}
	}
	return result
}

/** Intersect multiple availability arrays (e.g. for a group). */
export function intersectAllAvailability(slotsArray: AvailabilitySlot[][]): AvailabilitySlot[] {
	if (slotsArray.length === 0) return []
	if (slotsArray.length === 1) return slotsArray[0]
	return slotsArray.reduce((acc, arr) => intersectAvailability(acc, arr))
}

export function formatTimeHHmm(hhmm: string): string {
	if (!hhmm) return "–"
	const [h, m] = hhmm.split(":").map(Number)
	return `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`
}

const DAY_ABBREV: Record<string, string> = {
	monday: "Mon",
	tuesday: "Tue",
	wednesday: "Wed",
	thursday: "Thu",
	friday: "Fri",
	saturday: "Sat",
	sunday: "Sun",
}

export function formatSlot(slot: AvailabilitySlot): string {
	const day = DAY_ABBREV[slot.day.toLowerCase()] ?? slot.day
	return `${day} ${formatTimeHHmm(slot.start)} – ${formatTimeHHmm(slot.end)}`
}
