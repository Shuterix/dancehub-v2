import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Recurrence-pattern helpers.
 *
 * Lessons don't carry an explicit `series_id` yet — a recurring "series" is
 * inferred on the fly from
 *   (timetable_id, lesson_type, trainer_id, student_id, couple_id, group_id,
 *    weekday, HH:MM).
 *
 * When two distinct sibling lessons happen to share that fingerprint in
 * the same week (e.g. the generator placed a group at the same Sunday
 * 15:45 slot twice, which the solver now rejects but legacy data might
 * still carry), naïve "match & shift all" logic treats them as the same
 * series and moves BOTH every week. That keeps them conflicted no matter
 * which one the user clicks. To avoid that we pair siblings across weeks
 * by a stable rank (created_at, then id) and only shift the k-th sibling
 * in each target week.
 *
 * TODO(lesson-series-id): replace this inference with an explicit
 * `series_id` column on `lessons` so reschedules stop depending on
 * (created_at, id) heuristics.
 */

export type PatternLesson = {
	id: string
	start_at: string
	end_at: string
	lesson_type: string
	trainer_id: string | null
	student_id: string | null
	couple_id: string | null
	group_id: string | null
	created_at?: string | null
}

/** UTC weekday 0–6 (Sun–Sat) of the date portion of an ISO timestamp. */
export function weekdayOfIso(iso: string): number {
	const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
	return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}

/** YYYY-MM-DD of the Monday of the UTC week containing the date portion of an ISO timestamp. */
export function weekMondayOfIso(iso: string): string {
	const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
	const base = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
	const dow = base.getUTCDay()
	const offsetToMonday = dow === 0 ? -6 : 1 - dow
	const monday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + offsetToMonday))
	return monday.toISOString().slice(0, 10)
}

/**
 * Stable comparator for ordering sibling lessons that share the exact
 * pattern fingerprint (same trainer, same participant, same weekday, same
 * HH:MM). Newer-first by `created_at` would be surprising; we want the
 * ordering to remain constant across all weeks so that "the first sibling"
 * in week A is paired with "the first sibling" in week B.
 */
function compareSiblings(a: PatternLesson, b: PatternLesson): number {
	const at = a.created_at ?? ""
	const bt = b.created_at ?? ""
	if (at !== bt) return at < bt ? -1 : 1
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Returns the sibling lessons across every week (other than the anchor
 * itself) that should move together with `anchor` when the user picks
 * "this + all future occurrences" or auto-reschedule's pattern shift.
 *
 * Matching rule:
 *   • same timetable_id (we scope by the anchor's own timetable_id)
 *   • same (lesson_type, trainer_id, student_id, couple_id, group_id)
 *   • same weekday and HH:MM start
 *   • in every week bucket, pick ONLY the lesson whose sibling rank
 *     within its week equals the anchor's rank within the anchor's week
 *
 * The anchor itself is excluded from the returned list.
 */
export async function fetchMatchingSiblings(
	supabase: SupabaseClient,
	anchor: PatternLesson & { timetable_id: string },
): Promise<PatternLesson[]> {
	const originalWeekday = weekdayOfIso(anchor.start_at)
	const originalStartTime = anchor.start_at.slice(11, 16)

	const { data: candidates } = await supabase
		.from("lessons")
		.select(
			"id, start_at, end_at, lesson_type, trainer_id, student_id, couple_id, group_id, created_at",
		)
		.eq("timetable_id", anchor.timetable_id)

	const fingerprinted: PatternLesson[] = []
	for (const c of (candidates ?? []) as PatternLesson[]) {
		if (c.lesson_type !== anchor.lesson_type) continue
		if ((c.trainer_id ?? null) !== (anchor.trainer_id ?? null)) continue
		if ((c.student_id ?? null) !== (anchor.student_id ?? null)) continue
		if ((c.couple_id ?? null) !== (anchor.couple_id ?? null)) continue
		if ((c.group_id ?? null) !== (anchor.group_id ?? null)) continue
		if (weekdayOfIso(c.start_at) !== originalWeekday) continue
		if (c.start_at.slice(11, 16) !== originalStartTime) continue
		fingerprinted.push(c)
	}

	// Bucket by ISO week Monday and sort each bucket so siblings line up
	// consistently across weeks.
	const byWeek = new Map<string, PatternLesson[]>()
	for (const l of fingerprinted) {
		const w = weekMondayOfIso(l.start_at)
		const bucket = byWeek.get(w) ?? []
		bucket.push(l)
		byWeek.set(w, bucket)
	}
	for (const arr of byWeek.values()) arr.sort(compareSiblings)

	// Find the anchor's rank within its own week.
	const anchorWeek = weekMondayOfIso(anchor.start_at)
	const anchorBucket = byWeek.get(anchorWeek) ?? []
	const rank = anchorBucket.findIndex((l) => l.id === anchor.id)
	// If we can't locate the anchor in its bucket (stale data, fingerprint
	// drift), fall back to rank 0 — at worst we shift one lesson per week.
	const targetRank = rank >= 0 ? rank : 0

	const siblings: PatternLesson[] = []
	for (const [week, bucket] of byWeek) {
		if (week === anchorWeek) continue
		const pick = bucket[targetRank]
		if (pick && pick.id !== anchor.id) siblings.push(pick)
	}
	return siblings
}
