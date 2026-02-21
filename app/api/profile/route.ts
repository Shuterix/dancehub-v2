import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
	const supabase = await createClient()
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const { data: profile, error: profileError } = await supabase
		.from("profiles")
		.select("full_name, phone, dance_partner, category, rank_standard, rank_latin, date_of_birth, availability, onboarding_completed, role, club_id, created_at, updated_at")
		.eq("id", user.id)
		.single()

	if (profileError && profileError.code !== "PGRST116") {
		return NextResponse.json({ error: profileError.message }, { status: 500 })
	}

	return NextResponse.json({
		profile: profile ?? null,
		email: user.email,
		created_at: user.created_at,
	})
}

export async function PATCH(request: Request) {
	const supabase = await createClient()
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
		dance_partner?: string | null
		date_of_birth?: string | null
		availability?: { day: string; start: string; end: string }[]
	} = { id: user.id }
	if (typeof full_name === "string") profilePayload.full_name = full_name.trim()
	if (phone !== undefined) profilePayload.phone = typeof phone === "string" ? (phone.trim() || null) : null
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
	return NextResponse.json({ ok: true })
}
