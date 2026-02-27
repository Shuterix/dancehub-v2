import { ClubOverviewClient } from "./club-overview-client"

export default function ClubPage() {
	// Data is now loaded on the client from `/api/club` with caching,
	// so this server component only needs to render the shell.
	return <ClubOverviewClient />
}
