"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Copy, Users, UserPlus, GraduationCap, Heart, DoorOpen, BookOpen, Calendar } from "lucide-react"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type ClubData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
	couples: Array<{
		id: string
		name: string | null
		partner1_user_id: string | null
		partner2_user_id: string | null
		partner1_name: string | null
		partner2_name: string | null
	}>
	allStudents?: unknown[]
	allTrainers?: unknown[]
}

export default function ClubPage() {
	const router = useRouter()
	const [data, setData] = useState<ClubData | null>(null)
	const [copied, setCopied] = useState(false)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		fetch("/api/club")
			.then((res) => {
				if (res.status === 401) {
					toast.error("Session expired. Please sign in again.")
					router.push("/auth/login")
					return null
				}
				if (res.status === 404) {
					setError("You are not in a club.")
					return null
				}
				if (!res.ok) throw new Error("Failed to load club")
				return res.json()
			})
			.then((json) => {
				if (json) setData(json)
			})
			.catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
			.finally(() => setLoading(false))
	}, [router])

	async function copyCode() {
		if (!data?.club?.code) return
		await navigator.clipboard.writeText(data.club.code)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	if (loading) {
		return (
			<PageSkeleton backHref="/app" showBack={false} singleCard />
		)
	}

	if (error || !data) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Club</h1>
					<p className="text-muted-foreground text-sm">{error ?? "Unable to load club."}</p>
				</div>
			</div>
		)
	}

	const { club, couples, allStudents = [], allTrainers = [] } = data
	const studentCount = allStudents.length
	const trainerCount = allTrainers.length
	const coupleCount = couples.length

		function CountBadge({ count }: { count: number }) {
		return (
			<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary ring-1 ring-primary/20">
				{count}
			</span>
		)
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">Club</h1>
				<p className="text-muted-foreground text-sm">
					{club.name} — manage students, trainers, and couples.
				</p>
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
