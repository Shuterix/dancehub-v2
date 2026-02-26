import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { getLessonTypesData } from "@/lib/club-pages-data"
import { ClubLessonTypesClient } from "./lesson-types-client"

export default async function ClubLessonTypesPage() {
	const cookieStore = await cookies()
	const result = await getLessonTypesData(cookieStore)
	if (result.ok === false) {
		if (result.status === 401) {
			redirect("/auth/login")
		}
		return (
			<div className="space-y-6">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Group lesson types</h1>
					<p className="text-muted-foreground text-sm">
						{result.status === 404 ? "You are not in a club." : "Unable to load."}
					</p>
				</div>
			</div>
		)
	}
	return <ClubLessonTypesClient initialData={result.data} />
}
