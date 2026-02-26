import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { refreshCoupleAvailability, refreshGroupAvailability } from "@/lib/availability-db"

export async function GET() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	let { data: profile, error: profileError } = await supabase
		.from("profiles")
		.select("full_name, phone, email, dance_partner, category, rank_standard, rank_latin, date_of_birth, availability, onboarding_completed, role, club_id, created_at, updated_at")
		.eq("id", user.id)
		.single()

	if (profileError && profileError.code !== "PGRST116") {
		return NextResponse.json({ error: profileError.message }, { status: 500 })
	}

	// Backfill profiles.email from auth so club contact dialog can show it (existing users may have null)
	const authEmail = user.email?.trim() || null
	if (authEmail && profile && profile.email !== authEmail) {
		await supabase.from("profiles").update({ email: authEmail }).eq("id", user.id)
		profile = { ...profile, email: authEmail }
	}

	return NextResponse.json({
		profile: profile ?? null,
		email: user.email,
		created_at: user.created_at,
	})
}

export async function PATCH(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	let body: {
		full_name?: string
		email?: string
		phone?: string | null
		dance_partner?: string | null
		date_of_birth?: string | null
		availability?: { day: string; start: string; end: string }[]
	}
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
	}

	const { full_name, email, phone, dance_partner, date_of_birth, availability } = body

	const authPayload: { email?: string; data?: { full_name: string } } = {}
	if (typeof email === "string") authPayload.email = email.trim()
	if (typeof full_name === "string") authPayload.data = { full_name: full_name.trim() }
	if (Object.keys(authPayload).length > 0) {
		const { error: updateError } = await supabase.auth.updateUser(authPayload)
		if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
	}

	const profilePayload: {
		id: string
		full_name?: string
		phone?: string | null
		email?: string | null
		dance_partner?: string | null
		date_of_birth?: string | null
		availability?: { day: string; start: string; end: string }[]
	} = { id: user.id }
	if (typeof full_name === "string") profilePayload.full_name = full_name.trim()
	if (phone !== undefined) profilePayload.phone = typeof phone === "string" ? (phone.trim() || null) : null
	if (email !== undefined) profilePayload.email = typeof email === "string" ? (email.trim() || null) : null
	if (dance_partner !== undefined) profilePayload.dance_partner = typeof dance_partner === "string" ? (dance_partner.trim() || null) : null
	if (date_of_birth !== undefined) {
		const dob = typeof date_of_birth === "string" ? date_of_birth.trim() || null : null
		profilePayload.date_of_birth = dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null
	}
	if (Array.isArray(availability)) {
		profilePayload.availability = availability.filter(
			(s): s is { day: string; start: string; end: string } =>
				s && typeof s.day === "string" && typeof s.start === "string" && typeof s.end === "string"
		)
	}

	const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" })

	if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

	// Cascade: recompute couple and group availability (use admin client so students can trigger updates)
	if (availability !== undefined) {
		const { data: couplesWithUser } = await supabase
			.from("couples")
			.select("id")
			.or(`partner1_user_id.eq.${user.id},partner2_user_id.eq.${user.id}`)
		const admin = createAdminClient()
		for (const c of couplesWithUser ?? []) {
			await refreshCoupleAvailability(admin, c.id)
		}
		const coupleIds = (couplesWithUser ?? []).map((c) => c.id)
		const { data: groupMembers } = await supabase
			.from("group_members")
			.select("group_id")
			.eq("user_id", user.id)
		const { data: groupMembersByCouple } = coupleIds.length
			? await supabase.from("group_members").select("group_id").in("couple_id", coupleIds)
			: { data: [] }
		const groupIds = new Set<string>()
		for (const m of groupMembers ?? []) groupIds.add(m.group_id)
		for (const m of groupMembersByCouple ?? []) groupIds.add(m.group_id)
		for (const gid of groupIds) {
			await refreshGroupAvailability(admin, gid)
		}
	}

	return NextResponse.json({ ok: true })
}
