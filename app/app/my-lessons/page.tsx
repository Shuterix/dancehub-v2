import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getMyLessonsData } from "@/lib/my-lessons-data"
import { MyLessonsClient } from "./my-lessons-client"

export default async function MyLessonsPage() {
	const cookieStore = await cookies()
	const result = await getMyLessonsData(cookieStore, { range: "week" })
	if (result.ok === false) {
		if (result.status === 401) {
			redirect("/auth/login")
		}
	}
	const initialData = result.ok
		? { lessons: result.lessons, availableTimetables: result.availableTimetables }
		: { lessons: [], availableTimetables: [] }
	return <MyLessonsClient initialData={initialData} />
}
