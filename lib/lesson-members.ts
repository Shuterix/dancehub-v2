import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Context for expanding lessons into the set of individual user IDs they
 * occupy. A single lesson may block one user (individual), two (couple) or
 * many (group). This information is needed to detect conflicts and compute
 * availability correctly — a group lesson is only valid if *every* member is
 * free, and a member conflict exists whenever the same person appears in two
 * overlapping lessons regardless of whether they participate as a solo
 * student, as part of a couple, or as a group member.
 */
export type LessonMemberContext = {
	/** couple_id -> [partner1_user_id, partner2_user_id] (nulls filtered out) */
	coupleMembers: Map<string, string[]>
	/**
	 * group_id -> flattened list of user IDs. Student members contribute their
	 * own user_id. Couple members contribute both partner user IDs.
	 */
	groupMembers: Map<string, string[]>
}

/**
 * Load the member context for every couple and group in a club in one round
 * trip. Safe to call once per request and reuse for many lessons.
 */
export async function loadMemberContext(
	supabase: SupabaseClient,
	clubId: string,
): Promise<LessonMemberContext> {
	const [{ data: couples }, { data: groups }] = await Promise.all([
		supabase.from("couples").select("id, partner1_user_id, partner2_user_id").eq("club_id", clubId),
		supabase.from("groups").select("id").eq("club_id", clubId),
	])

	const coupleMembers = new Map<string, string[]>()
	for (const c of couples ?? []) {
		const arr: string[] = []
		if (c.partner1_user_id) arr.push(c.partner1_user_id)
		if (c.partner2_user_id) arr.push(c.partner2_user_id)
		coupleMembers.set(c.id, arr)
	}

	const groupMembers = new Map<string, string[]>()
	const groupIds = (groups ?? []).map((g) => g.id)
	if (groupIds.length > 0) {
		const { data: members } = await supabase
			.from("group_members")
			.select("group_id, user_id, couple_id")
			.in("group_id", groupIds)
		for (const gid of groupIds) groupMembers.set(gid, [])
		for (const m of members ?? []) {
			const bucket = groupMembers.get(m.group_id)
			if (!bucket) continue
			if (m.user_id) {
				bucket.push(m.user_id)
			} else if (m.couple_id) {
				const pair = coupleMembers.get(m.couple_id) ?? []
				for (const uid of pair) bucket.push(uid)
			}
		}
		// Deduplicate (same person may appear twice if they're in a couple AND
		// also added directly — rare but not forbidden by schema).
		for (const [gid, arr] of groupMembers) {
			groupMembers.set(gid, [...new Set(arr)])
		}
	}

	return { coupleMembers, groupMembers }
}

/**
 * Return the set of user IDs that a lesson "occupies". Any of these users
 * being busy at the same time as the lesson constitutes a conflict.
 */
export function getLessonUserIds(
	lesson: {
		lesson_type?: string | null
		student_id?: string | null
		couple_id?: string | null
		group_id?: string | null
	},
	ctx: LessonMemberContext,
): string[] {
	if (lesson.student_id) return [lesson.student_id]
	if (lesson.couple_id) return ctx.coupleMembers.get(lesson.couple_id) ?? []
	if (lesson.group_id) return ctx.groupMembers.get(lesson.group_id) ?? []
	return []
}

/** True iff the two arrays share at least one element. */
export function sharesUser(a: string[], b: string[]): boolean {
	if (a.length === 0 || b.length === 0) return false
	const set = new Set(a)
	for (const u of b) if (set.has(u)) return true
	return false
}
