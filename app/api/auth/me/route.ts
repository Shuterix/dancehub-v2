import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

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

	let { data: profile } = await supabase
		.from("profiles")
		.select("full_name, phone, email, dance_partner, category, rank_standard, rank_latin, date_of_birth, availability, onboarding_completed, role, club_id")
		.eq("id", user.id)
		.single()

	// Backfill profiles.email from auth so club contact dialog shows it for existing users
	const authEmail = user.email?.trim() || null
	if (authEmail && profile && profile.email !== authEmail) {
		await supabase.from("profiles").update({ email: authEmail }).eq("id", user.id)
		profile = { ...profile, email: authEmail }
	}

	let club: { id: string; name: string } | null = null
	if (profile?.club_id) {
		const { data: clubRow } = await supabase
			.from("clubs")
			.select("id, name")
			.eq("id", profile.club_id)
			.maybeSingle()
		if (clubRow) club = { id: clubRow.id, name: clubRow.name }
	}

	return NextResponse.json({
		user: {
			id: user.id,
			email: user.email ?? null,
			created_at: user.created_at,
			user_metadata: user.user_metadata,
		},
		profile: profile ?? null,
		club: club ?? null,
	})
}
