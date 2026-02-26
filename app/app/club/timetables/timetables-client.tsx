"use client"

import { useCallback, useEffect, useState } from "react"
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
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { TimetablesPageData, TimetableRow } from "@/lib/club-pages-data.types"

const RECURRENCE_LABELS: Record<string, string> = {
	weekly: "Weekly",
	bi_weekly: "Bi-weekly",
	monthly: "Monthly",
	weekends_only: "Weekends only",
	fixed_period: "Fixed period",
}

export function ClubTimetablesClient({ initialData }: { initialData: TimetablesPageData }) {
	const [data, setData] = useState(initialData)
	const [refreshing, setRefreshing] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const [duplicateId, setDuplicateId] = useState<string | null>(null)
	const [deleteConfirm, setDeleteConfirm] = useState<TimetableRow | null>(null)

	useEffect(() => {
		setData(initialData)
		setRefreshing(false)
	}, [initialData])

	const { timetables, isTrainer } = data

	const loadTimetables = useCallback(() => {
		return fetch("/api/club/timetables")
			.then((res) => {
				if (res.status === 401 || res.status === 404) return null
				if (!res.ok) throw new Error("Failed to load timetables")
				return res.json()
			})
			.then((json) => {
				if (json?.timetables) setData((prev) => ({ ...prev, timetables: json.timetables }))
			})
	}, [])

	async function handleDuplicate(t: TimetableRow) {
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
		setDeleteConfirm(null)
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

	if (refreshing) {
		return <PageSkeleton backHref="/app/club" cardGridCount={6} />
	}

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
				<PageRefreshButton refreshing={refreshing} onRefresh={() => setRefreshing(true)} aria-label="Refresh timetables" />
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
								<Link
									key={t.id}
									href={`/app/club/timetables/${t.id}`}
									className={cn(
										"flex flex-col rounded-xl border border-border bg-muted/30 p-4 transition-colors cursor-pointer",
										"hover:bg-muted/50"
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<span className="font-semibold text-foreground truncate block">
												{t.name}
											</span>
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
											<div className="flex shrink-0 gap-1" onClick={(e) => e.preventDefault()}>
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
													onClick={(e) => {
														e.preventDefault()
														e.stopPropagation()
														handleDuplicate(t)
													}}
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
													onClick={(e) => {
														e.preventDefault()
														e.stopPropagation()
														setDeleteConfirm(t)
													}}
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
								</Link>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete timetable</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This will remove the timetable and all its lessons, targets, and settings. This cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button variant="outline" onClick={() => setDeleteConfirm(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
							disabled={deletingId === deleteConfirm?.id}
						>
							{deletingId === deleteConfirm?.id ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
