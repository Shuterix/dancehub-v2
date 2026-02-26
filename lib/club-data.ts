import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { CookieStore } from "@/lib/supabase/server"
import { refreshCoupleAvailability, refreshGroupAvailability } from "@/lib/availability-db"
import type { AvailabilitySlot } from "@/lib/availability"
import type { ClubData } from "./club-data.types"

export type { ClubData } from "./club-data.types"
export type { AvailabilitySlot } from "@/lib/availability"

export type GetClubDataResult =
	| { ok: true; data: ClubData }
	| { ok: false; status: 401 }
	| { ok: false; status: 404 }

function ageFromDateOfBirth(dob: string | null | undefined): number | null {
	if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
	const birth = new Date(dob)
	const today = new Date()
	let a = today.getFullYear() - birth.getFullYear()
	const m = today.getMonth() - birth.getMonth()
	if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--
	return a >= 0 && a <= 150 ? a : null
}

/**
 * Server-only: fetch full club data for the current user.
 * Pass the result of `await cookies()` from "next/headers".
 */
export const getClubData = cache(async (cookieStore: CookieStore): Promise<GetClubDataResult> => {
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return { ok: false, status: 401 }
	}

	const { data: myProfile } = await supabase
		.from("profiles")
		.select("club_id")
		.eq("id", user.id)
		.maybeSingle()

	if (!myProfile?.club_id) {
		return { ok: false, status: 404 }
	}

	const clubId = myProfile.club_id

	const { data: club, error: clubError } = await supabase
		.from("clubs")
		.select("id, name, code")
		.eq("id", clubId)
		.single()

	if (clubError || !club) {
		return { ok: false, status: 404 }
	}

	const { data: members } = await supabase
		.from("club_members")
		.select("user_id, role")
		.eq("club_id", clubId)

	const myMembership = (members ?? []).find((m) => m.user_id === user.id)
	const isTrainer = myMembership?.role === "trainer"

	let { data: couples } = await supabase
		.from("couples")
		.select("id, name, partner1_user_id, partner2_user_id, availability")
		.eq("club_id", clubId)
		.order("created_at", { ascending: true })

	for (const c of couples ?? []) {
		const hasPartners = c.partner1_user_id && c.partner2_user_id
		const emptyAvail = !c.availability || (Array.isArray(c.availability) && c.availability.length === 0)
		if (hasPartners && emptyAvail) {
			await refreshCoupleAvailability(supabase, c.id)
		}
	}
	if (couples?.length) {
		const { data: refetched } = await supabase
			.from("couples")
			.select("id, name, partner1_user_id, partner2_user_id, availability")
			.eq("club_id", clubId)
			.order("created_at", { ascending: true })
		if (refetched) couples = refetched
	}

	const userIds = [...new Set((members ?? []).map((m) => m.user_id))]
	const { data: profiles } = await supabase
		.from("profiles")
		.select("id, full_name, phone, email, rank_standard, rank_latin, date_of_birth, availability, login_code")
		.in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])

	const profileByUserId = new Map(
		(profiles ?? []).map((p) => [
			p.id,
			{
				full_name: p.full_name ?? "—",
				phone: p.phone ?? null,
				email: p.email ?? null,
				rank_standard: p.rank_standard ?? null,
				rank_latin: p.rank_latin ?? null,
				date_of_birth: p.date_of_birth ?? null,
				availability: (Array.isArray(p.availability) ? p.availability : []) as AvailabilitySlot[],
				login_code: p.login_code ?? null,
			},
		])
	)
	const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "—"]))

	const pairedUserIds = new Set<string>()
	for (const c of couples ?? []) {
		if (c.partner1_user_id) pairedUserIds.add(c.partner1_user_id)
		if (c.partner2_user_id) pairedUserIds.add(c.partner2_user_id)
	}

	const students = (members ?? []).filter((m) => m.role === "student")
	const trainers = (members ?? []).filter((m) => m.role === "trainer")

	const partnerNameByUserId = new Map<string, string>()
	for (const c of couples ?? []) {
		if (c.partner1_user_id && c.partner2_user_id) {
			partnerNameByUserId.set(c.partner1_user_id, nameByUserId.get(c.partner2_user_id) ?? "—")
			partnerNameByUserId.set(c.partner2_user_id, nameByUserId.get(c.partner1_user_id) ?? "—")
		}
	}

	const allStudents = students.map((m) => {
		const p = profileByUserId.get(m.user_id)
		const dob = p?.date_of_birth ?? null
		return {
			user_id: m.user_id,
			full_name: p?.full_name ?? "—",
			phone: p?.phone ?? null,
			email: p?.email ?? null,
			rank_standard: p?.rank_standard ?? null,
			rank_latin: p?.rank_latin ?? null,
			age: dob ? ageFromDateOfBirth(dob) : null,
			partner_name: partnerNameByUserId.get(m.user_id) ?? null,
			availability: (p?.availability ?? []) as AvailabilitySlot[],
		}
	})

	const unpairedStudents = allStudents.filter((s) => !pairedUserIds.has(s.user_id))

	const allTrainers = trainers.map((m) => {
		const p = profileByUserId.get(m.user_id)
		const dob = p?.date_of_birth ?? null
		const loginCode = p?.login_code ?? null
		return {
			user_id: m.user_id,
			full_name: p?.full_name ?? "—",
			phone: p?.phone ?? null,
			email: p?.email ?? null,
			rank_standard: p?.rank_standard ?? null,
			rank_latin: p?.rank_latin ?? null,
			age: dob ? ageFromDateOfBirth(dob) : null,
			is_external: !!loginCode,
			login_code: loginCode ?? undefined,
			availability: (p?.availability ?? []) as AvailabilitySlot[],
		}
	})

	const couplesWithNames = (couples ?? []).map((c) => {
		const p1 = c.partner1_user_id ? profileByUserId.get(c.partner1_user_id) : null
		const p2 = c.partner2_user_id ? profileByUserId.get(c.partner2_user_id) : null
		return {
			id: c.id,
			name: c.name ?? null,
			partner1_user_id: c.partner1_user_id ?? null,
			partner2_user_id: c.partner2_user_id ?? null,
			partner1_name: c.partner1_user_id ? nameByUserId.get(c.partner1_user_id) ?? null : null,
			partner2_name: c.partner2_user_id ? nameByUserId.get(c.partner2_user_id) ?? null : null,
			partner1_phone: p1?.phone ?? null,
			partner2_phone: p2?.phone ?? null,
			partner1_email: p1?.email ?? null,
			partner2_email: p2?.email ?? null,
			partner1_availability: (p1?.availability ?? []) as AvailabilitySlot[],
			partner2_availability: (p2?.availability ?? []) as AvailabilitySlot[],
			availability: (Array.isArray(c.availability) ? c.availability : []) as AvailabilitySlot[],
		}
	})

	let { data: groupsRows } = await supabase
		.from("groups")
		.select("id, name, created_at, availability")
		.eq("club_id", clubId)
		.order("name", { ascending: true })

	const groupIds = (groupsRows ?? []).map((g) => g.id)
	const { data: groupMembersRows } = groupIds.length
		? await supabase
				.from("group_members")
				.select("group_id, user_id, couple_id")
				.in("group_id", groupIds)
		: { data: [] }

	for (const g of groupsRows ?? []) {
		const memberCount = (groupMembersRows ?? []).filter((m) => m.group_id === g.id).length
		const emptyAvail = !g.availability || (Array.isArray(g.availability) && g.availability.length === 0)
		if (memberCount > 0 && emptyAvail) {
			await refreshGroupAvailability(supabase, g.id)
		}
	}
	if (groupsRows?.length) {
		const { data: refetched } = await supabase
			.from("groups")
			.select("id, name, created_at, availability")
			.eq("club_id", clubId)
			.order("name", { ascending: true })
		if (refetched) groupsRows = refetched
	}

	const groups = (groupsRows ?? []).map((g) => {
		const groupMembers = (groupMembersRows ?? []).filter((m) => m.group_id === g.id)
		const studentIds = groupMembers.map((m) => m.user_id).filter(Boolean) as string[]
		const coupleIds = groupMembers.map((m) => m.couple_id).filter(Boolean) as string[]
		return {
			id: g.id,
			name: g.name,
			created_at: g.created_at,
			student_ids: studentIds,
			couple_ids: coupleIds,
			member_count: groupMembers.length,
			availability: (Array.isArray(g.availability) ? g.availability : []) as AvailabilitySlot[],
		}
	})

	return {
		ok: true,
		data: {
			club: { id: club.id, name: club.name, code: club.code },
			isTrainer: !!isTrainer,
			couples: couplesWithNames,
			allStudents,
			allTrainers,
			unpairedStudents,
			groups,
		},
	}
})
