import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Server Supabase client that reads/writes the auth session via cookies.
 * Use this in API routes and Server Components to get the current user.
 * After signInWithPassword, the session is stored in cookies automatically.
 */
export async function createClient() {
	const cookieStore = await cookies()

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
