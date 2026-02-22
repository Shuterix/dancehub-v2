import type { SupabaseClient } from "@supabase/supabase-js"
import { intersectAvailability, intersectAllAvailability, type AvailabilitySlot } from "./availability"

/** Recompute couple.availability from both partners' profiles and update DB. */
export async function refreshCoupleAvailability(
	supabase: SupabaseClient,
	coupleId: string
): Promise<void> {
	const { data: couple } = await supabase
		.from("couples")
		.select("partner1_user_id, partner2_user_id")
		.eq("id", coupleId)
		.single()
	if (!couple?.partner1_user_id || !couple?.partner2_user_id) return

	const { data: profiles } = await supabase
		.from("profiles")
		.select("id, availability")
		.in("id", [couple.partner1_user_id, couple.partner2_user_id])
	const p1 = (profiles ?? []).find((p) => p.id === couple.partner1_user_id)
	const p2 = (profiles ?? []).find((p) => p.id === couple.partner2_user_id)
	const av1 = (Array.isArray(p1?.availability) ? p1?.availability : []) as AvailabilitySlot[]
	const av2 = (Array.isArray(p2?.availability) ? p2?.availability : []) as AvailabilitySlot[]
	const availability = intersectAvailability(av1, av2)
	await supabase.from("couples").update({ availability }).eq("id", coupleId)
}

/** Recompute group.availability from all members (students' profiles + couples' availability) and update DB. */
export async function refreshGroupAvailability(
	supabase: SupabaseClient,
	groupId: string
): Promise<void> {
	const { data: members } = await supabase
		.from("group_members")
		.select("user_id, couple_id")
		.eq("group_id", groupId)
	if (!members?.length) {
		await supabase.from("groups").update({ availability: [] }).eq("id", groupId)
		return
	}

	const memberAvailabilities: AvailabilitySlot[][] = []
	const userIds = members.map((m) => m.user_id).filter(Boolean) as string[]
	const coupleIds = members.map((m) => m.couple_id).filter(Boolean) as string[]

	// Include every member's availability (even empty). If any member has none, group has none.
	if (userIds.length > 0) {
		const { data: profiles } = await supabase
			.from("profiles")
			.select("id, availability")
			.in("id", userIds)
		for (const userId of userIds) {
			const p = (profiles ?? []).find((r) => r.id === userId)
			const av = (Array.isArray(p?.availability) ? p?.availability : []) as AvailabilitySlot[]
			memberAvailabilities.push(av)
		}
	}
	if (coupleIds.length > 0) {
		const { data: couples } = await supabase
			.from("couples")
			.select("id, availability")
			.in("id", coupleIds)
		for (const coupleId of coupleIds) {
			const c = (couples ?? []).find((r) => r.id === coupleId)
			const av = (Array.isArray(c?.availability) ? c?.availability : []) as AvailabilitySlot[]
			memberAvailabilities.push(av)
		}
	}

	const availability = intersectAllAvailability(memberAvailabilities)
	await supabase.from("groups").update({ availability }).eq("id", groupId)
}
