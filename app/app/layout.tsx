import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebarLayout } from "./_components/sidebar"

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const supabase = await createClient()
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser()

	if (userError || !user) {
		redirect("/auth/login")
	}

	const { data: profile } = await supabase
		.from("profiles")
		.select("onboarding_completed, club_id")
		.eq("id", user.id)
		.single()

	if (!profile?.onboarding_completed || !profile?.club_id) {
		redirect("/onboarding")
	}

	return <DashboardSidebarLayout>{children}</DashboardSidebarLayout>
}
