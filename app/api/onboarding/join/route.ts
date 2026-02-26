import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
	}

	const body = await request.json().catch(() => ({}))
	const code = (body?.code as string)?.trim()?.toUpperCase()
	if (!code) {
		return NextResponse.json({ error: "Club code is required." }, { status: 400 })
	}

	const { data: club, error: clubError } = await supabase
		.from("clubs")
		.select("id")
		.eq("code", code)
		.single()

	if (clubError || !club) {
		return NextResponse.json({ error: "Invalid or expired club code." }, { status: 400 })
	}

	const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
	const role = (profile?.role as string) === "trainer" ? "trainer" : "student"

	const { error: memberError } = await supabase
		.from("club_members")
		.upsert({ club_id: club.id, user_id: user.id, role }, { onConflict: "club_id,user_id" })

	if (memberError) {
		return NextResponse.json({ error: memberError.message }, { status: 500 })
	}

	const { error: profileUpdateError } = await supabase
		.from("profiles")
		.update({ club_id: club.id, onboarding_completed: true })
		.eq("id", user.id)

	if (profileUpdateError) {
		return NextResponse.json({ error: profileUpdateError.message }, { status: 500 })
	}

	return NextResponse.json({ ok: true, club_id: club.id })
}
