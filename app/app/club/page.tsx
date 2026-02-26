import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getClubData } from "@/lib/club-data"
import { ClubOverviewClient } from "./club-overview-client"

export default async function ClubPage() {
	const cookieStore = await cookies()
	const result = await getClubData(cookieStore)

	if (!result.ok && result.status === 401) {
		redirect("/auth/login")
	}

	if (!result.ok && result.status === 404) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Club</h1>
					<p className="text-muted-foreground text-sm">You are not in a club.</p>
				</div>
			</div>
		)
	}

	return <ClubOverviewClient initialData={result.data} />
}
