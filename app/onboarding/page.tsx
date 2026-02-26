import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { OnboardingClient } from "./_components/onboarding-client"

export default async function OnboardingPage() {
	const cookieStore = await cookies()
	const supabase = createClient(cookieStore)
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		redirect("/auth/login")
	}

	const { data: profile } = await supabase
		.from("profiles")
		.select("onboarding_completed, role, club_id")
		.eq("id", user.id)
		.maybeSingle()

	if (profile?.onboarding_completed && profile?.club_id) {
		redirect("/app")
	}

	return (
		<div className="bg-muted flex min-h-svh flex-col items-center justify-center p-4 md:p-6">
			<div className="w-full max-w-md">
				<OnboardingClient
					initialRole={(profile?.role as "student" | "trainer") ?? null}
					initialClubId={profile?.club_id ?? null}
				/>
			</div>
		</div>
	)
}
