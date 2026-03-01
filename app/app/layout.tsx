import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { ErrorBoundary } from "@/components/error-boundary"
import { AppNavigationProvider } from "./_components/app-navigation-context"
import { DashboardSidebarLayout } from "./_components/sidebar"

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode
}) {
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
		.select("onboarding_completed, club_id")
		.eq("id", user.id)
		.single()

	if (!profile?.onboarding_completed || !profile?.club_id) {
		redirect("/onboarding")
	}

	return (
		<ErrorBoundary>
			<AppNavigationProvider>
				<DashboardSidebarLayout>{children}</DashboardSidebarLayout>
			</AppNavigationProvider>
		</ErrorBoundary>
	)
}
