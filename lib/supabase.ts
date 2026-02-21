import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Single server-side Supabase client. Import this in API routes and server code — do not create a new client per route. */
export const supabase = createClient(supabaseUrl, supabaseKey)