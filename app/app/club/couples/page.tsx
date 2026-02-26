import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getClubData } from "@/lib/club-data"
import { Button } from "@/components/ui/button"
import { ClubCouplesClient } from "./couples-client"
import { ChevronLeft } from "lucide-react"

export default async function ClubCouplesPage() {
	const cookieStore = await cookies()
	const result = await getClubData(cookieStore)

	if (!result.ok && result.status === 401) {
		redirect("/auth/login")
	}

	if (!result.ok && result.status === 404) {
		return (
			<div className="space-y-6">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Couples</h1>
					<p className="text-muted-foreground text-sm">You are not in a club.</p>
				</div>
			</div>
		)
	}

	return <ClubCouplesClient initialData={result.data} />
}
