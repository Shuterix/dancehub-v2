import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const EXTERNAL_EMAIL_DOMAIN = "external.dancehub.internal"
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 8

function generateCode(): string {
	let code = ""
	const bytes = new Uint8Array(CODE_LENGTH)
	if (typeof crypto !== "undefined" && crypto.getRandomValues) {
		crypto.getRandomValues(bytes)
		for (let i = 0; i < CODE_LENGTH; i++) {
			code += CODE_CHARS[bytes[i]! % CODE_CHARS.length]
		}
	} else {
		for (let i = 0; i < CODE_LENGTH; i++) {
			code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
		}
	}
	return code
}

export async function POST(request: Request) {
	try {
		const cookieStore = await cookies()
		const supabase = createClient(cookieStore)
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser()
		if (userError || !user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
		}

		const { data: myProfile } = await supabase
			.from("profiles")
			.select("club_id")
			.eq("id", user.id)
			.maybeSingle()
		if (!myProfile?.club_id) {
			return NextResponse.json({ error: "Not in a club" }, { status: 404 })
		}

		const { data: members } = await supabase
			.from("club_members")
			.select("role")
			.eq("club_id", myProfile.club_id)
			.eq("user_id", user.id)
			.maybeSingle()
		if (members?.role !== "trainer") {
			return NextResponse.json({ error: "Only trainers can add external teachers" }, { status: 403 })
		}

		const body = await request.json().catch(() => ({}))
		const displayName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "External Teacher"

		const code = generateCode()
		const internalEmail = `ext-${crypto.randomUUID()}@${EXTERNAL_EMAIL_DOMAIN}`

		const admin = createAdminClient()
		const { data: newUser, error: createError } = await admin.auth.admin.createUser({
			email: internalEmail,
			password: code,
			email_confirm: true,
			user_metadata: { full_name: displayName },
		})
		if (createError || !newUser.user) {
			return NextResponse.json(
				{ error: createError?.message ?? "Failed to create external teacher" },
				{ status: 400 }
			)
		}

		const userId = newUser.user.id
		const { error: profileError } = await admin
			.from("profiles")
			.update({
				login_code: code,
				external_login_email: internalEmail,
				full_name: displayName,
				club_id: myProfile.club_id,
				role: "trainer",
				onboarding_completed: true,
			})
			.eq("id", userId)
		if (profileError) {
			await admin.auth.admin.deleteUser(userId)
			return NextResponse.json({ error: "Failed to update profile" }, { status: 500 })
		}

		const { error: memberError } = await admin.from("club_members").insert({
			club_id: myProfile.club_id,
			user_id: userId,
			role: "trainer",
		})
		if (memberError) {
			await admin.auth.admin.deleteUser(userId)
			return NextResponse.json({ error: "Failed to add to club" }, { status: 500 })
		}

		return NextResponse.json({
			code,
			display_name: displayName,
			message: "Share this code with the external teacher. They use it once to sign in (no email or password).",
		})
	} catch (e) {
		return NextResponse.json(
			{ error: e instanceof Error ? e.message : "Failed to create external teacher" },
			{ status: 500 }
		)
	}
}
