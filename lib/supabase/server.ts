import { createServerClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Cookie store interface compatible with Next.js cookies() return value.
 * Callers must pass the result of `await cookies()` from "next/headers".
 * Minimal shape so Next's RequestCookies/ReadonlyRequestCookies are assignable.
 */
export type CookieStore = {
	getAll: () => { name: string; value: string }[]
	set: (key: string, value: string, cookie?: object) => unknown
}

/**
 * Server Supabase client that reads/writes the auth session via cookies.
 * Use in API routes and Server Components: pass `await cookies()` from "next/headers".
 */
export function createClient(cookieStore: CookieStore) {
	return createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return cookieStore.getAll()
			},
			setAll(cookiesToSet) {
				try {
					cookiesToSet.forEach(({ name, value, options }) =>
						cookieStore.set(name, value, options)
					)
				} catch {
					// Ignored when called from a Server Component
				}
			},
		},
	})
}
