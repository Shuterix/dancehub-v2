import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export default async function HomePage() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const { data: { user } } = await supabase.auth.getUser()

	if (!user) return redirect("/auth/login")

	const { data: profile } = await supabase
		.from("profiles")
		.select("onboarding_completed, club_id")
		.eq("id", user.id)
		.single()

	if (!profile?.onboarding_completed || !profile?.club_id) {
		return redirect("/onboarding")
	}

	return redirect("/app")
}