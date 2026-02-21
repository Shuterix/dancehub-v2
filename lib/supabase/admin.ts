import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Server-only Supabase client with service role. Bypasses RLS.
 * Use only in API routes for: creating users (external teachers), looking up by login_code.
 * Never expose this client to the browser.
 */
export function createAdminClient() {
	if (!serviceRoleKey) {
		throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations")
	}
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	})
}
