"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Copy, UserPlus, GraduationCap, Heart, DoorOpen, BookOpen, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"

type ClubOverviewData = {
	club: { id: string; name: string; code: string }
	allStudents: unknown[]
	allTrainers: unknown[]
	couples: unknown[]
}

function CountBadge({ count }: { count: number }) {
	return (
		<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary ring-1 ring-primary/20">
			{count}
		</span>
	)
}

export function ClubOverviewClient({ initialData }: { initialData: ClubOverviewData }) {
	const [copied, setCopied] = useState(false)
	const [refreshing, setRefreshing] = useState(false)

	useEffect(() => {
		setRefreshing(false)
	}, [initialData])

	const { club, couples, allStudents = [], allTrainers = [] } = initialData
	const studentCount = allStudents.length
	const trainerCount = allTrainers.length
	const coupleCount = couples.length

	async function copyCode() {
		if (!club?.code) return
		await navigator.clipboard.writeText(club.code)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	if (refreshing) {
		return <PageSkeleton backHref="/app" cardRowCount={4} />
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<div className="min-w-0 flex-1">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Club</h1>
					<p className="text-muted-foreground text-sm">
						{club.name} — manage students, trainers, and couples.
					</p>
				</div>
				<PageRefreshButton refreshing={refreshing} onRefresh={() => setRefreshing(true)} aria-label="Refresh club" />
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Club code</CardTitle>
					<CardDescription>Share this code so others can join your club.</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center gap-3">
					<code className="rounded-md bg-muted px-3 py-2 text-lg font-mono font-semibold">
						{club.code}
					</code>
					<Button variant="outline" size="icon" onClick={copyCode} aria-label="Copy club code">
						<Copy className="size-4" />
					</Button>
					{copied && (
						<span className="text-muted-foreground text-sm">Copied!</span>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Manage club</CardTitle>
					<CardDescription>
						View students (with partner status), trainers, or manage couples and their availability.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-3">
					<Button variant="outline" asChild className="gap-2">
						<Link href="/app/club/students">
							<UserPlus className="size-4" />
							Students
							<CountBadge count={studentCount} />
						</Link>
					</Button>
					<Button variant="outline" asChild className="gap-2">
						<Link href="/app/club/trainers">
							<GraduationCap className="size-4" />
							Trainers
							<CountBadge count={trainerCount} />
						</Link>
					</Button>
					<Button variant="outline" asChild className="gap-2">
						<Link href="/app/club/couples">
							<Heart className="size-4" />
							Couples
							<CountBadge count={coupleCount} />
						</Link>
					</Button>
					<Button variant="outline" asChild className="gap-2">
						<Link href="/app/club/rooms">
							<DoorOpen className="size-4" />
							Rooms
						</Link>
					</Button>
					<Button variant="outline" asChild className="gap-2">
						<Link href="/app/club/lesson-types">
							<BookOpen className="size-4" />
							Lesson types
						</Link>
					</Button>
					<Button variant="outline" asChild className="gap-2">
						<Link href="/app/club/timetables">
							<Calendar className="size-4" />
							Timetables
						</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	)
}
