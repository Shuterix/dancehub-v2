"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
	Calendar,
	ChevronLeft,
	Plus,
	Loader2,
	Copy,
	Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const RECURRENCE_LABELS: Record<string, string> = {
	weekly: "Weekly",
	bi_weekly: "Bi-weekly",
	monthly: "Monthly",
	weekends_only: "Weekends only",
	fixed_period: "Fixed period",
}

type Timetable = {
	id: string
	name: string
	recurrence: string
	valid_from: string
	valid_until: string | null
	is_active: boolean
	paused_at: string | null
	day_start: string
	day_end: string
	created_at: string
}

type ClubData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
}

export default function ClubTimetablesPage() {
	const router = useRouter()
	const [clubData, setClubData] = useState<ClubData | null>(null)
	const [timetables, setTimetables] = useState<Timetable[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const [duplicateId, setDuplicateId] = useState<string | null>(null)

	const loadClub = useCallback(() => {
		return fetch("/api/club")
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
				if (json) setClubData(json)
			})
	}, [router])

	const loadTimetables = useCallback(() => {
		return fetch("/api/club/timetables")
			.then((res) => {
				if (res.status === 401 || res.status === 404) return null
				if (!res.ok) throw new Error("Failed to load timetables")
				return res.json()
			})
			.then((json) => {
				if (json?.timetables) setTimetables(json.timetables)
			})
	}, [])

	const loadData = useCallback(() => {
		return Promise.all([loadClub(), loadTimetables()]).catch((e) =>
			setError(e instanceof Error ? e.message : "Something went wrong")
		)
	}, [loadClub, loadTimetables])

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		loadData().finally(() => {
			if (!cancelled) setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [loadData])

	async function handleDuplicate(t: Timetable) {
		setDuplicateId(t.id)
		try {
			const res = await fetch("/api/club/timetables", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ duplicate_from_id: t.id, name: `${t.name} (copy)` }),
			})
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				toast.error(json.error ?? "Failed to duplicate")
				return
			}
			toast.success("Timetable duplicated")
			loadTimetables()
		} finally {
			setDuplicateId(null)
		}
	}

	async function handleDelete(id: string) {
		setDeletingId(id)
		try {
			const res = await fetch(`/api/club/timetables/${id}`, { method: "DELETE" })
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				toast.error(json.error ?? "Failed to delete")
				return
			}
			toast.success("Timetable deleted")
			loadTimetables()
		} finally {
			setDeletingId(null)
		}
	}

	function formatDate(s: string) {
		try {
			return new Date(s + "Z").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
		} catch {
			return s
		}
	}

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" asChild>
						<Link href="/app/club" aria-label="Back to club">
							<ChevronLeft className="size-4" />
						</Link>
					</Button>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">Timetables</h1>
						<p className="text-muted-foreground text-sm">Loading…</p>
					</div>
				</div>
			</div>
		)
	}

	if (error || !clubData) {
		return (
			<div className="space-y-6">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Timetables</h1>
					<p className="text-muted-foreground text-sm">{error ?? "Unable to load."}</p>
				</div>
			</div>
		)
	}

	const { isTrainer } = clubData

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
						Timetables
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{timetables.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						{isTrainer
							? "Create and manage timetables. Set students, couples, and trainers, then generate lessons."
							: "View club timetables."}
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Calendar className="size-5" />
						Timetables
					</CardTitle>
					<CardDescription>
						{timetables.length === 0
							? "No timetables yet. Create one to set preferences and generate lessons."
							: `${timetables.length} timetable${timetables.length === 1 ? "" : "s"}.`}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isTrainer && (
						<Button asChild className="cursor-pointer rounded-xl">
							<Link href="/app/club/timetables/new">
								<Plus className="mr-2 size-4" />
								Create timetable
							</Link>
						</Button>
					)}

					{timetables.length === 0 && !isTrainer ? (
						<p className="text-muted-foreground text-sm">No timetables in this club yet.</p>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{timetables.map((t) => (
								<div
									key={t.id}
									className={cn(
										"flex flex-col rounded-xl border border-border bg-muted/30 p-4 transition-colors",
										"hover:bg-muted/50"
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<Link
												href={`/app/club/timetables/${t.id}`}
												className="font-semibold text-foreground hover:underline truncate block"
											>
												{t.name}
											</Link>
											<p className="mt-0.5 text-muted-foreground text-sm">
												{RECURRENCE_LABELS[t.recurrence] ?? t.recurrence}
											</p>
											<p className="text-muted-foreground text-xs">
												{formatDate(t.valid_from)}
												{t.valid_until ? ` – ${formatDate(t.valid_until)}` : " (no end)"}
											</p>
											{t.is_active ? (
												<span className="mt-1 inline-flex items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
													Active
												</span>
											) : (
												<span className="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
													Inactive
												</span>
											)}
										</div>
										{isTrainer && (
											<div className="flex shrink-0 gap-1">
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
													onClick={() => handleDuplicate(t)}
													disabled={duplicateId === t.id}
													aria-label="Duplicate"
												>
													{duplicateId === t.id ? (
														<Loader2 className="size-4 animate-spin" />
													) : (
														<Copy className="size-4" />
													)}
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="size-8 text-destructive hover:text-destructive"
													onClick={() => handleDelete(t.id)}
													disabled={deletingId === t.id}
													aria-label="Delete"
												>
													{deletingId === t.id ? (
														<Loader2 className="size-4 animate-spin" />
													) : (
														<Trash2 className="size-4" />
													)}
												</Button>
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
