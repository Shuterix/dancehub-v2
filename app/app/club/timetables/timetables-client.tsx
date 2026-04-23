"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
	AlertTriangle,
	Calendar,
	Clock,
	ChevronLeft,
	Plus,
	Loader2,
	Copy,
	Trash2,
	ShieldCheck,
	CheckCircle2,
} from "lucide-react"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { getPageCache, setPageCache } from "@/lib/app-page-cache"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { getPreferredShortfallsWeekStart, getShortfallsSummaryApiPath } from "@/lib/timetable-shortfalls-week"
import type { TimetablesPageData, TimetableRow } from "@/lib/club-pages-data.types"

type ConflictLessonRef = {
	lesson_id: string
	timetable_id: string
	start_at: string
	end_at: string
	lesson_type: "individual" | "couple" | "group"
}
type ConflictMeta = {
	occurrences: number
	recurrence: "once" | "weekly" | "bi_weekly" | "monthly" | "irregular"
	first_occurrence: string
	all_lesson_ids: string[]
}
type ConflictItem = ConflictMeta &
	(
		| { kind: "trainer"; trainer_id: string; trainer_name: string; lessons: ConflictLessonRef[] }
		| { kind: "room"; room_id: string; room_name: string; lessons: ConflictLessonRef[] }
		| { kind: "student"; student_id: string; student_name: string; lessons: ConflictLessonRef[] }
		| { kind: "couple"; couple_id: string; couple_label: string; lessons: ConflictLessonRef[] }
		| { kind: "group"; group_id: string; group_name: string; lessons: ConflictLessonRef[] }
		| { kind: "member"; user_id: string; user_name: string; lessons: ConflictLessonRef[] }
		| {
				kind: "availability"
				subject: "trainer" | "student" | "couple" | "group"
				subject_id: string
				subject_name: string
				timetable_id: string
				timetable_name: string
				lessons: ConflictLessonRef[]
		  }
		| {
				kind: "window"
				timetable_id: string
				timetable_name: string
				day_start: string
				day_end: string
				lessons: ConflictLessonRef[]
		  }
	)

function conflictLabel(c: ConflictItem): { kind: string; name: string } {
	if (c.kind === "trainer") return { kind: "Trainer", name: c.trainer_name }
	if (c.kind === "room") return { kind: "Room", name: c.room_name }
	if (c.kind === "student") return { kind: "Student", name: c.student_name }
	if (c.kind === "couple") return { kind: "Couple", name: c.couple_label }
	if (c.kind === "group") return { kind: "Group", name: c.group_name }
	if (c.kind === "member") return { kind: "Member", name: c.user_name }
	if (c.kind === "availability") {
		const subj = c.subject.charAt(0).toUpperCase() + c.subject.slice(1)
		return { kind: `${subj} availability`, name: c.subject_name }
	}
	return { kind: "Outside day window", name: c.timetable_name }
}

type HealthOverlap = ConflictItem
type HealthAvailabilityIssue = ConflictMeta & {
	subject: "trainer" | "student" | "couple" | "group"
	subject_id: string
	subject_name: string
	timetable_id: string
	timetable_name: string
	lessons: ConflictLessonRef[]
}
type HealthWindowIssue = ConflictMeta & {
	timetable_id: string
	timetable_name: string
	day_start: string
	day_end: string
	lessons: ConflictLessonRef[]
}
type HealthCheckResponse = {
	summary: {
		total_issues: number
		overlaps: number
		availability_violations: number
		window_violations: number
		total_lessons_checked: number
		timetables_checked: number
	}
	overlaps: HealthOverlap[]
	availability_violations: HealthAvailabilityIssue[]
	window_violations: HealthWindowIssue[]
}

function formatOccurrencesSuffix(meta: ConflictMeta): string {
	if (meta.recurrence === "weekly") return ` · repeats weekly (${meta.occurrences}×)`
	if (meta.recurrence === "bi_weekly") return ` · every 2 weeks (${meta.occurrences}×)`
	if (meta.recurrence === "monthly") return ` · monthly (${meta.occurrences}×)`
	if (meta.occurrences > 1) return ` · recurring (${meta.occurrences}×)`
	return ""
}

function formatFirstOccurrence(iso: string): string {
	try {
		const d = new Date(iso)
		const date = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
		const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
		return `${date} ${time}`
	} catch {
		return iso.slice(0, 16).replace("T", " ")
	}
}

function subjectKindLabel(subject: HealthAvailabilityIssue["subject"]): string {
	if (subject === "trainer") return "Trainer"
	if (subject === "student") return "Student"
	if (subject === "couple") return "Couple"
	return "Group"
}

const RECURRENCE_LABELS: Record<string, string> = {
	weekly: "Weekly",
	bi_weekly: "Bi-weekly",
	monthly: "Monthly",
	weekends_only: "Weekends only",
	fixed_period: "Fixed period",
}

export function ClubTimetablesClient({ initialData }: { initialData: TimetablesPageData }) {
	const [data, setData] = useState<TimetablesPageData>(() => {
		return getPageCache<TimetablesPageData>("app/club/timetables") ?? initialData
	})
	const [refreshing, setRefreshing] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const [duplicateId, setDuplicateId] = useState<string | null>(null)
	const [deleteConfirm, setDeleteConfirm] = useState<TimetableRow | null>(null)
	const [conflicts, setConflicts] = useState<ConflictItem[]>([])
	const [scheduleBannersLoading, setScheduleBannersLoading] = useState(false)
	const [unmetTimetables, setUnmetTimetables] = useState<
		Array<{ timetable_id: string; name: string; missing_lessons: number }>
	>([])
	const [conflictsOpen, setConflictsOpen] = useState(false)
	const [unmetOpen, setUnmetOpen] = useState(false)
	const [healthChecking, setHealthChecking] = useState(false)
	const [healthResults, setHealthResults] = useState<HealthCheckResponse | null>(null)
	const [healthOpen, setHealthOpen] = useState(false)

	useEffect(() => {
		const cached = getPageCache<TimetablesPageData>("app/club/timetables")
		if (!cached) {
			setPageCache("app/club/timetables", initialData)
		}
	}, [initialData])

	const { timetables, isTrainer } = data

	const timetableNameById = useMemo(() => {
		const m = new Map<string, string>()
		for (const t of timetables) m.set(t.id, t.name)
		return m
	}, [timetables])

	// Group conflicts by timetable so the list reminds the user which timetable
	// still has unresolved issues. A single conflict can touch multiple timetables.
	const conflictsByTimetable = useMemo(() => {
		const m = new Map<string, ConflictItem[]>()
		for (const c of conflicts) {
			const tids = new Set(c.lessons.map((l) => l.timetable_id))
			for (const tid of tids) {
				if (!m.has(tid)) m.set(tid, [])
				m.get(tid)!.push(c)
			}
		}
		return m
	}, [conflicts])

	const refreshScheduleAlerts = useCallback(() => {
		if (!isTrainer) return Promise.resolve()
		setScheduleBannersLoading(true)
		const shortfallsSummaryUrl = getShortfallsSummaryApiPath(getPreferredShortfallsWeekStart())
		return Promise.all([
			fetch("/api/club/timetables/conflicts", { cache: "no-store" }).then((res) =>
				res.ok ? res.json() : { conflicts: [] },
			),
			fetch(shortfallsSummaryUrl, { cache: "no-store" }).then((res) =>
				res.ok ? res.json() : { items: [] },
			),
		])
			.then(([cJson, sJson]) => {
				setConflicts(Array.isArray(cJson?.conflicts) ? cJson.conflicts : [])
				setUnmetTimetables(Array.isArray(sJson?.items) ? sJson.items : [])
			})
			.catch(() => {
				setConflicts([])
				setUnmetTimetables([])
			})
			.finally(() => setScheduleBannersLoading(false))
	}, [isTrainer])

	useEffect(() => {
		refreshScheduleAlerts()
	}, [refreshScheduleAlerts, timetables.length])

	const loadTimetables = useCallback(() => {
		return fetch("/api/club/timetables")
			.then((res) => {
				if (res.status === 401 || res.status === 404) return null
				if (!res.ok) throw new Error("Failed to load timetables")
				return res.json()
			})
			.then((json) => {
				if (json?.timetables) {
					setData((prev) => {
						const next = { ...prev, timetables: json.timetables }
						setPageCache("app/club/timetables", next)
						return next
					})
				}
			})
	}, [])

	async function handleRefresh() {
		setRefreshing(true)
		try {
			await loadTimetables()
			await refreshScheduleAlerts()
		} finally {
			setRefreshing(false)
		}
	}

	const runHealthCheck = useCallback(async () => {
		setHealthChecking(true)
		try {
			const res = await fetch("/api/club/timetables/health-check", { cache: "no-store" })
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				toast.error(json?.error ?? "Health check failed")
				return
			}
			const json = (await res.json()) as HealthCheckResponse
			setHealthResults(json)
			setHealthOpen(true)
			await refreshScheduleAlerts()
			if (json.summary.total_issues === 0) {
				toast.success("All clear — no conflicts, availability, or window issues found.")
			} else {
				toast.warning(
					`${json.summary.total_issues} issue${json.summary.total_issues === 1 ? "" : "s"} found across ${json.summary.timetables_checked} timetable${json.summary.timetables_checked === 1 ? "" : "s"}.`,
				)
			}
		} catch {
			toast.error("Health check failed")
		} finally {
			setHealthChecking(false)
		}
	}, [refreshScheduleAlerts])

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
				<PageRefreshButton
					refreshing={refreshing}
					onRefresh={handleRefresh}
					aria-label="Refresh timetables"
				/>
				{isTrainer && (
					<Button
						variant="outline"
						size="sm"
						className="ml-auto cursor-pointer"
						onClick={runHealthCheck}
						disabled={healthChecking}
					>
						{healthChecking ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<ShieldCheck className="mr-2 size-4" />
						)}
						{healthChecking ? "Checking…" : "Run health check"}
					</Button>
				)}
			</div>

			{isTrainer && (
				<>
					{scheduleBannersLoading ? (
						<div className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
							<span className="flex items-center gap-2 min-w-0">
								<Skeleton className="h-4 w-4 shrink-0 rounded" />
								<Skeleton className="h-4 w-88 max-w-full" />
							</span>
							<Skeleton className="h-4 w-10 shrink-0" />
						</div>
					) : conflicts.length > 0 ? (
						<button
							type="button"
							onClick={() => setConflictsOpen(true)}
							className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-900 dark:text-amber-200 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
						>
							<span className="flex items-center gap-2">
								<AlertTriangle className="size-4 shrink-0" />
								<span>
									<strong>{conflicts.length}</strong> unresolved conflict{conflicts.length === 1 ? "" : "s"} across{" "}
									<strong>{conflictsByTimetable.size}</strong> timetable{conflictsByTimetable.size === 1 ? "" : "s"}. Review before next week.
								</span>
							</span>
							<span className="text-xs underline underline-offset-2">View</span>
						</button>
					) : (
						<div className="flex w-full items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-sm text-emerald-900 dark:text-emerald-200">
							<span className="flex items-center gap-2">
								<CheckCircle2 className="size-4 shrink-0" />
								<span>
									<strong>No conflicts found.</strong> Everything looks good right now.
								</span>
							</span>
						</div>
					)}
					{!scheduleBannersLoading && unmetTimetables.length > 0 && (() => {
						const totalMissing = unmetTimetables.reduce((a, t) => a + t.missing_lessons, 0)
						const weekOf = getPreferredShortfallsWeekStart()
						const weekNote = weekOf
							? ` Counts use the week of ${formatDate(weekOf)} (same as the last week you viewed on a timetable).`
							: " Counts use the current calendar week — open a timetable and pick a week to align the list with that view."
						return (
							<button
								type="button"
								onClick={() => setUnmetOpen(true)}
								className="flex w-full items-center justify-between gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-left text-sm text-orange-900 dark:text-orange-200 hover:bg-orange-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
							>
								<span className="flex min-w-0 items-start gap-2">
									<Clock className="size-4 shrink-0 mt-0.5" />
									<span className="min-w-0">
										<strong>{unmetTimetables.length}</strong> timetable{unmetTimetables.length === 1 ? "" : "s"}{" "}
										<strong>{totalMissing}</strong> missing lesson{totalMissing === 1 ? "" : "s"} (targets not fully scheduled — e.g. availability, rooms, or ordering in Generate). Open a timetable to see details.
										<span className="block text-xs text-orange-800/90 dark:text-orange-300/90 mt-1">{weekNote}</span>
									</span>
								</span>
								<span className="text-xs shrink-0 underline underline-offset-2">View</span>
							</button>
						)
					})()}
				</>
			)}

			<Card className="overflow-hidden">
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
				<CardContent className="space-y-4 overflow-x-hidden">
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
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
							{timetables.map((t) => (
								<Link
									key={t.id}
									href={`/app/club/timetables/${t.id}`}
									className={cn(
										"flex min-w-0 flex-col rounded-xl border border-border bg-muted/30 p-4 transition-colors cursor-pointer overflow-hidden",
										"hover:bg-muted/50"
									)}
								>
									<div className="flex items-start justify-between gap-2 min-w-0">
										<div className="min-w-0 flex-1">
											<span className="font-semibold text-foreground block wrap-break-word">
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
											<div className="flex shrink-0 gap-1 pl-2" onClick={(e) => e.preventDefault()}>
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

			<Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}>
				<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Unresolved conflicts</DialogTitle>
						<DialogDescription>
							These overlaps were detected across your club&apos;s active timetables. Open any timetable below to inspect and resolve the specific lessons.
						</DialogDescription>
					</DialogHeader>
					{conflictsByTimetable.size === 0 ? (
						<p className="text-sm text-muted-foreground">No conflicts.</p>
					) : (
						<ul className="space-y-3 text-sm">
							{[...conflictsByTimetable.entries()]
								.sort(([a], [b]) => (timetableNameById.get(a) ?? "").localeCompare(timetableNameById.get(b) ?? ""))
								.map(([tid, items]) => (
									<li key={tid} className="rounded-md border border-border bg-background/60 p-3">
										<div className="mb-2 flex items-center justify-between gap-2">
											<span className="font-medium wrap-break-word">
												{timetableNameById.get(tid) ?? "Unknown timetable"}
											</span>
											<Link
												href={`/app/club/timetables/${tid}`}
												className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
												onClick={() => setConflictsOpen(false)}
											>
												Open →
											</Link>
										</div>
										<ul className="space-y-1 text-xs text-muted-foreground">
											{items.slice(0, 6).map((c, i) => {
												const { kind, name } = conflictLabel(c)
												const suffix =
													c.recurrence === "weekly"
														? ` · repeats weekly (${c.occurrences}×)`
														: c.recurrence === "bi_weekly"
															? ` · every 2 weeks (${c.occurrences}×)`
															: c.recurrence === "monthly"
																? ` · monthly (${c.occurrences}×)`
																: c.occurrences > 1
																	? ` · recurring (${c.occurrences}×)`
																	: ""
												return (
													<li key={`${tid}-${i}`}>
														<span className="font-medium text-foreground">{kind}:</span> {name}
														<span className="opacity-70">{suffix}</span>
													</li>
												)
											})}
											{items.length > 6 && (
												<li className="italic">+ {items.length - 6} more…</li>
											)}
										</ul>
									</li>
								))}
						</ul>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={unmetOpen} onOpenChange={setUnmetOpen}>
				<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Clock className="size-5" />
							Targets not fully met
						</DialogTitle>
						<DialogDescription>
							These active timetables have fewer lessons scheduled this calendar week than your targets (same check as the “Fewer lessons than requested” card on the timetable detail view). It is not the same as overlap conflicts — often it means Generate could not find a free slot, or lessons were only partially created.
						</DialogDescription>
					</DialogHeader>
					{unmetTimetables.length === 0 ? (
						<p className="text-sm text-muted-foreground">None right now.</p>
					) : (
						<ul className="space-y-2 text-sm">
							{unmetTimetables.map((t) => (
								<li
									key={t.timetable_id}
									className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/60 p-3"
								>
									<span className="font-medium wrap-break-word">{t.name}</span>
									<div className="flex items-center gap-2 shrink-0">
										<Badge variant="secondary" className="text-xs">
											{t.missing_lessons} missing
										</Badge>
										<Link
											href={`/app/club/timetables/${t.timetable_id}`}
											className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
											onClick={() => setUnmetOpen(false)}
										>
											Open →
										</Link>
									</div>
								</li>
							))}
						</ul>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={healthOpen} onOpenChange={setHealthOpen}>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<ShieldCheck className="size-5" />
							Health check results
						</DialogTitle>
						<DialogDescription>
							Full audit of every active timetable: trainer, room, and participant overlaps, availability violations, and day-window violations. Everything listed here is something that should not be happening.
						</DialogDescription>
					</DialogHeader>

					{!healthResults ? (
						<p className="text-sm text-muted-foreground">No results yet.</p>
					) : (
						<div className="space-y-5 text-sm">
							{/* Summary */}
							<div className="rounded-lg border border-border bg-muted/30 p-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										{healthResults.summary.total_issues === 0 ? (
											<>
												<CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
												<span className="font-semibold text-emerald-700 dark:text-emerald-300">
													All clear — no issues found.
												</span>
											</>
										) : (
											<>
												<AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
												<span className="font-semibold">
													{healthResults.summary.total_issues} issue
													{healthResults.summary.total_issues === 1 ? "" : "s"} found
												</span>
											</>
										)}
									</div>
									<span className="text-xs text-muted-foreground">
										Checked {healthResults.summary.total_lessons_checked} lesson
										{healthResults.summary.total_lessons_checked === 1 ? "" : "s"} across{" "}
										{healthResults.summary.timetables_checked} timetable
										{healthResults.summary.timetables_checked === 1 ? "" : "s"}
									</span>
								</div>
								<div className="mt-2 grid grid-cols-3 gap-2 text-xs">
									<div className="rounded-md border border-border bg-background/60 p-2">
										<div className="text-muted-foreground">Overlaps</div>
										<div className="text-lg font-semibold">{healthResults.summary.overlaps}</div>
									</div>
									<div className="rounded-md border border-border bg-background/60 p-2">
										<div className="text-muted-foreground">Availability</div>
										<div className="text-lg font-semibold">
											{healthResults.summary.availability_violations}
										</div>
									</div>
									<div className="rounded-md border border-border bg-background/60 p-2">
										<div className="text-muted-foreground">Day window</div>
										<div className="text-lg font-semibold">
											{healthResults.summary.window_violations}
										</div>
									</div>
								</div>
							</div>

							{/* Overlap conflicts */}
							<section>
								<h3 className="mb-2 text-sm font-semibold">
									Overlap conflicts ({healthResults.overlaps.length})
								</h3>
								{healthResults.overlaps.length === 0 ? (
									<p className="text-xs text-muted-foreground">
										No trainer, room, or participant is double-booked.
									</p>
								) : (
									<ul className="space-y-2">
										{healthResults.overlaps.map((c, i) => {
											const { kind, name } = conflictLabel(c as ConflictItem)
											const timetableIds = Array.from(
												new Set(c.lessons.map((l) => l.timetable_id)),
											)
											return (
												<li
													key={`overlap-${i}`}
													className="rounded-md border border-border bg-background/60 p-3"
												>
													<div className="flex flex-wrap items-center justify-between gap-2">
														<div className="min-w-0">
															<span className="font-medium text-foreground">{kind}:</span>{" "}
															<span className="wrap-break-word">{name}</span>
															<span className="text-muted-foreground">
																{formatOccurrencesSuffix(c)}
															</span>
														</div>
														<div className="flex shrink-0 flex-wrap gap-2">
															{timetableIds.map((tid) => (
																<Link
																	key={tid}
																	href={`/app/club/timetables/${tid}`}
																	onClick={() => setHealthOpen(false)}
																	className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
																>
																	{timetableNameById.get(tid) ?? "Open"} →
																</Link>
															))}
														</div>
													</div>
													<div className="mt-1 text-xs text-muted-foreground">
														First: {formatFirstOccurrence(c.first_occurrence)} · {c.lessons.length}{" "}
														overlapping lesson{c.lessons.length === 1 ? "" : "s"} per occurrence
													</div>
												</li>
											)
										})}
									</ul>
								)}
							</section>

							{/* Availability violations */}
							<section>
								<h3 className="mb-2 text-sm font-semibold">
									Availability violations ({healthResults.availability_violations.length})
								</h3>
								{healthResults.availability_violations.length === 0 ? (
									<p className="text-xs text-muted-foreground">
										Every lesson is inside its trainer&apos;s and participant&apos;s declared availability.
									</p>
								) : (
									<ul className="space-y-2">
										{healthResults.availability_violations.map((v, i) => (
											<li
												key={`avail-${i}`}
												className="rounded-md border border-border bg-background/60 p-3"
											>
												<div className="flex flex-wrap items-center justify-between gap-2">
													<div className="min-w-0">
														<span className="font-medium text-foreground">
															{subjectKindLabel(v.subject)}:
														</span>{" "}
														<span className="wrap-break-word">{v.subject_name}</span>
														<span className="text-muted-foreground">
															{formatOccurrencesSuffix(v)}
														</span>
													</div>
													<Link
														href={`/app/club/timetables/${v.timetable_id}`}
														onClick={() => setHealthOpen(false)}
														className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
													>
														{v.timetable_name} →
													</Link>
												</div>
												<div className="mt-1 text-xs text-muted-foreground">
													Scheduled outside their availability · first at{" "}
													{formatFirstOccurrence(v.first_occurrence)}
												</div>
											</li>
										))}
									</ul>
								)}
							</section>

							{/* Window violations */}
							<section>
								<h3 className="mb-2 text-sm font-semibold">
									Day-window violations ({healthResults.window_violations.length})
								</h3>
								{healthResults.window_violations.length === 0 ? (
									<p className="text-xs text-muted-foreground">
										Every lesson is inside its timetable&apos;s configured day window.
									</p>
								) : (
									<ul className="space-y-2">
										{healthResults.window_violations.map((w, i) => (
											<li
												key={`win-${i}`}
												className="rounded-md border border-border bg-background/60 p-3"
											>
												<div className="flex flex-wrap items-center justify-between gap-2">
													<div className="min-w-0">
														<span className="font-medium text-foreground">
															{w.timetable_name}
														</span>
														<span className="text-muted-foreground">
															{formatOccurrencesSuffix(w)}
														</span>
													</div>
													<Link
														href={`/app/club/timetables/${w.timetable_id}`}
														onClick={() => setHealthOpen(false)}
														className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-80"
													>
														Open →
													</Link>
												</div>
												<div className="mt-1 text-xs text-muted-foreground">
													Lesson falls outside day window {w.day_start}–{w.day_end} · first at{" "}
													{formatFirstOccurrence(w.first_occurrence)}
												</div>
											</li>
										))}
									</ul>
								)}
							</section>
						</div>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => setHealthOpen(false)}>
							Close
						</Button>
						<Button onClick={runHealthCheck} disabled={healthChecking}>
							{healthChecking ? (
								<Loader2 className="mr-2 size-4 animate-spin" />
							) : (
								<ShieldCheck className="mr-2 size-4" />
							)}
							Re-run check
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

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
