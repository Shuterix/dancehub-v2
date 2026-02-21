import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser Supabase client. Session is stored in cookies (set by server on login).
 * Use in Client Components for auth state: getSession(), getUser(), onAuthStateChange().
 */
export function createClient() {
	return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
