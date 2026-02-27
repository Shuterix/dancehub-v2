import { MyLessonsClient } from "./my-lessons-client"

export default function MyLessonsPage() {
	// Data is now loaded on the client from `/api/app/my-lessons` with caching.
	return <MyLessonsClient />
}
