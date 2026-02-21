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

	const { data: profile } = await supabase
		.from("profiles")
		.select("full_name, phone, dance_partner, category, rank_standard, rank_latin, date_of_birth, availability, onboarding_completed, role, club_id")
		.eq("id", user.id)
		.single()

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
