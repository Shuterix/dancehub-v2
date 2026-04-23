import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const code = searchParams.get("code")
	const next = searchParams.get("next") ?? "/onboarding"

	if (!code) {
		return NextResponse.redirect(new URL("/auth/login", request.url))
	}

	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const { error } = await supabase.auth.exchangeCodeForSession(code)

	if (error) {
		// PKCE verifier missing: the OAuth flow was started in a different
		// browser/tab/device, the link was reopened later, or cookies were
		// blocked. Send the user back to login with a friendly message
		// instead of the raw Supabase error.
		const isPkceError =
			/code verifier/i.test(error.message) || /pkce/i.test(error.message)

		const friendly = isPkceError
			? "Your sign-in link expired or was opened in a different browser. Please sign in again from this device."
			: error.message

		return NextResponse.redirect(
			new URL(`/auth/login?error=${encodeURIComponent(friendly)}`, request.url)
		)
	}

	return NextResponse.redirect(new URL(next, request.url))
}
