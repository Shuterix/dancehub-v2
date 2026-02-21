import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Protects /app and /onboarding: redirect to login if no session. Refreshes session cookies. */
export async function proxy(request: NextRequest) {
	let response = NextResponse.next({ request })

	const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return request.cookies.getAll()
			},
			setAll(cookiesToSet) {
				cookiesToSet.forEach(({ name, value, options }) =>
					response.cookies.set(name, value, options)
				)
			},
		},
	})

	const {
		data: { user },
	} = await supabase.auth.getUser()

	const pathname = request.nextUrl.pathname
	const isProtected = pathname.startsWith("/app") || pathname === "/onboarding" || pathname.startsWith("/onboarding/")

	if (isProtected && !user) {
		const loginUrl = new URL("/auth/login", request.url)
		loginUrl.searchParams.set("next", pathname)
		return NextResponse.redirect(loginUrl)
	}

	return response
}

export const config = {
	matcher: ["/app/:path*", "/onboarding", "/onboarding/:path*"],
}
