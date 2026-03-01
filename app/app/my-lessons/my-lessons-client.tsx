"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Calendar, XCircle, CalendarDays, ChevronDown } from "lucide-react"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { getPageCache, setPageCache } from "@/lib/app-page-cache"
import { Badge } from "@/components/ui/badge"
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { LessonItem } from "@/lib/my-lessons-data.types"

type RangeKey = "week" | "two_weeks" | "month" | "year" | "custom"

const TIMETABLE_CARD_STYLES = [
	"border-l-4 border-l-blue-500 bg-blue-500/5 dark:bg-blue-500/10",
	"border-l-4 border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
	"border-l-4 border-l-violet-500 bg-violet-500/5 dark:bg-violet-500/10",
	"border-l-4 border-l-amber-500 bg-amber-500/5 dark:bg-amber-500/10",
	"border-l-4 border-l-rose-500 bg-rose-500/5 dark:bg-rose-500/10",
	"border-l-4 border-l-cyan-500 bg-cyan-500/5 dark:bg-cyan-500/10",
] as const
const TIMETABLE_BADGE_STYLES = [
	"bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/40",
	"bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
	"bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/40",
	"bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
	"bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/40",
	"bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/40",
] as const
function getTimetableStyleIndex(timetableId: string | null | undefined): number {
	if (!timetableId) return 0
	let h = 0
	for (let i = 0; i < timetableId.length; i++) h = (h << 5) - h + timetableId.charCodeAt(i)
	return Math.abs(h) % TIMETABLE_CARD_STYLES.length
}

function formatDate(d: string): string {
	try {
		const date = d.includes("T") ? new Date(d) : new Date(d + "T12:00:00")
		return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })
	} catch {
		return d.slice(0, 10)
	}
}

function formatTimeRange(start: string, end: string): string {
	const s = start.slice(11, 16)
	const e = end.slice(11, 16)
	return `${s} – ${e}`
}

type InitialData = {
	lessons: LessonItem[]
	availableTimetables: Array<{ id: string; name: string | null }>
}

export function MyLessonsClient() {
	const router = useRouter()
	const [lessons, setLessons] = useState<LessonItem[]>(() => {
		const cached = getPageCache<InitialData>("app/my-lessons")
		return cached?.lessons ?? []
	})
	const [availableTimetables, setAvailableTimetables] = useState(() => {
		const cached = getPageCache<InitialData>("app/my-lessons")
		return cached?.availableTimetables ?? []
	})
	const [loading, setLoading] = useState(() => !getPageCache<InitialData>("app/my-lessons"))
	const [refreshing, setRefreshing] = useState(false)
	const [cancelLesson, setCancelLesson] = useState<LessonItem | null>(null)
	const [cancelNote, setCancelNote] = useState("")
	const [cancelling, setCancelling] = useState(false)

	const [range, setRange] = useState<RangeKey>("week")
	const [selectedTimetableIds, setSelectedTimetableIds] = useState<string[]>([])
	const [customFrom, setCustomFrom] = useState<string>(() => {
		const d = new Date()
		return d.toISOString().slice(0, 10)
	})
	const [customTo, setCustomTo] = useState<string>(() => {
		const d = new Date()
		d.setDate(d.getDate() + 6)
		return d.toISOString().slice(0, 10)
	})

	const load = useCallback(() => {
		const params = new URLSearchParams()
		if (range === "custom") {
			params.set("range", "custom")
			params.set("from", customFrom)
			params.set("to", customTo)
		} else {
			params.set("range", range)
		}
		if (selectedTimetableIds.length > 0) {
			params.set("timetables", selectedTimetableIds.join(","))
		}
		return fetch(`/api/app/my-lessons?${params.toString()}`)
			.then((res) => {
				if (res.status === 401) {
					toast.error("Session expired. Please sign in again.")
					router.push("/auth/login")
					return null
				}
				if (!res.ok) throw new Error("Failed to load lessons")
				return res.json()
			})
			.then(
				(json: {
					lessons?: LessonItem[]
					availableTimetables?: Array<{ id: string; name: string | null }>
				}) => {
					if (json) {
						const nextLessons = json.lessons ?? []
						const nextAvailable = Array.isArray(json.availableTimetables)
							? json.availableTimetables
							: availableTimetables
						setLessons(nextLessons)
						setAvailableTimetables(nextAvailable)
						setPageCache("app/my-lessons", {
							lessons: nextLessons,
							availableTimetables: nextAvailable,
						})
					}
				}
			)
			.catch(() => setLessons([]))
	}, [router, range, customFrom, customTo, selectedTimetableIds, availableTimetables])

	const isFirstLoad = useRef(true)

	// Initial load when there is no cache yet.
	useEffect(() => {
		const cached = getPageCache<InitialData>("app/my-lessons")
		if (cached) return

		let cancelled = false
		setLoading(true)
		load().finally(() => {
			if (!cancelled) setLoading(false)
		})

		return () => {
			cancelled = true
		}
	}, [load])

	useEffect(() => {
		let cancelled = false

		// On first render with default filters, rely on either cached data or the
		// initial client-side load above instead of triggering an extra fetch.
		if (isFirstLoad.current && range === "week" && selectedTimetableIds.length === 0) {
			isFirstLoad.current = false
			return
		}

		isFirstLoad.current = false
		setLoading(true)
		load().finally(() => {
			if (!cancelled) setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [range, selectedTimetableIds, customFrom, customTo])

	async function handleRefresh() {
		setRefreshing(true)
		await load()
		setRefreshing(false)
	}

	async function handleCancelConfirm() {
		if (!cancelLesson) return
		setCancelling(true)
		try {
			const res = await fetch(`/api/app/lessons/${cancelLesson.id}/cancel`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ note: cancelNote.trim() || undefined }),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Failed to cancel lesson")
				return
			}
			toast.success("Lesson cancelled")
			setCancelLesson(null)
			setCancelNote("")
			load()
		} finally {
			setCancelling(false)
		}
	}

	const showSkeleton = loading || refreshing

	if (showSkeleton) {
		return (
			<div className="flex flex-col gap-6 p-4 md:p-6">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">My lessons</h1>
					<p className="text-muted-foreground text-sm mt-1">Your upcoming lessons.</p>
				</div>
				<PageRefreshButton refreshing={refreshing} onRefresh={handleRefresh} aria-label="Refresh my lessons" />
				<PageSkeleton backHref="/app" contentOnly cardGridCount={6} />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6 p-4 md:p-6 min-w-0 overflow-x-hidden">
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">My lessons</h1>
						<p className="text-muted-foreground text-sm mt-1">
							Your upcoming lessons. Choose a time range below. You can cancel any lesson with a short reason.
						</p>
					</div>
					<PageRefreshButton refreshing={refreshing} onRefresh={handleRefresh} aria-label="Refresh my lessons" />
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-muted-foreground text-sm font-medium shrink-0">Show:</span>
					<div className="flex flex-wrap gap-1.5">
						{(
							[
								{ key: "week" as const, label: "Week" },
								{ key: "two_weeks" as const, label: "Two weeks" },
								{ key: "month" as const, label: "Month" },
								{ key: "year" as const, label: "Whole year" },
								{ key: "custom" as const, label: "Custom dates" },
							] as const
						).map(({ key: r, label: labelText }) => (
							<Button
								key={r}
								variant={range === r ? "default" : "outline"}
								size="sm"
								className="gap-1.5"
								onClick={() => setRange(r)}
							>
								<CalendarDays className="size-3.5" />
								{labelText}
							</Button>
						))}
					</div>
				</div>
				{availableTimetables.length > 0 && (
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-muted-foreground text-sm font-medium shrink-0">Timetables:</span>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="gap-1.5 min-w-40 justify-between">
									{selectedTimetableIds.length === 0
										? "All timetables"
										: `${selectedTimetableIds.length} of ${availableTimetables.length} selected`}
									<ChevronDown className="size-4 opacity-50" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="max-h-[min(20rem,70vh)] overflow-y-auto">
								{availableTimetables.map((t) => {
									const idx = getTimetableStyleIndex(t.id)
									const isChecked =
										selectedTimetableIds.length === 0 || selectedTimetableIds.includes(t.id)
									const colorDot = [
										"bg-blue-500",
										"bg-emerald-500",
										"bg-violet-500",
										"bg-amber-500",
										"bg-rose-500",
										"bg-cyan-500",
									][idx]
									return (
										<DropdownMenuCheckboxItem
											key={t.id}
											checked={isChecked}
											onSelect={(e) => e.preventDefault()}
											onCheckedChange={(checked) => {
												setSelectedTimetableIds((prev) => {
													if (selectedTimetableIds.length === 0) {
														return checked ? [t.id] : availableTimetables.map((x) => x.id).filter((id) => id !== t.id)
													}
													if (checked) return [...prev, t.id]
													const next = prev.filter((id) => id !== t.id)
													return next.length > 0 ? next : []
												})
											}}
										>
											<span className={cn("size-2.5 shrink-0 rounded-full mr-2", colorDot)} aria-hidden />
											{t.name ?? "Unnamed"}
										</DropdownMenuCheckboxItem>
									)
								})}
								{selectedTimetableIds.length > 0 && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onSelect={(e) => {
												e.preventDefault()
												setSelectedTimetableIds([])
											}}
										>
											Show all timetables
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
				{range === "custom" && (
					<div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
						<div className="flex items-center gap-2">
							<Label htmlFor="custom-from" className="text-sm whitespace-nowrap">From</Label>
							<input
								id="custom-from"
								type="date"
								value={customFrom}
								onChange={(e) => setCustomFrom(e.target.value)}
								className="rounded-md border border-input bg-background px-3 py-2 text-sm"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Label htmlFor="custom-to" className="text-sm whitespace-nowrap">To</Label>
							<input
								id="custom-to"
								type="date"
								value={customTo}
								onChange={(e) => setCustomTo(e.target.value)}
								className="rounded-md border border-input bg-background px-3 py-2 text-sm"
							/>
						</div>
						{customFrom > customTo && (
							<span className="text-destructive text-sm">From must be before or equal to To</span>
						)}
					</div>
				)}
			</div>

			{lessons.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Calendar className="size-5" />
							No upcoming lessons
						</CardTitle>
						<CardDescription>
							When you have lessons scheduled (as a student or trainer), they will appear here. You can cancel any of them with a note.
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0 overflow-x-hidden">
					{lessons.map((lesson) => {
						const isCancelled = !!lesson.cancelled_at
						const styleIdx = getTimetableStyleIndex(lesson.timetable_id)
						const cardStyle = TIMETABLE_CARD_STYLES[styleIdx]
						const badgeStyle = TIMETABLE_BADGE_STYLES[styleIdx]
						return (
							<Card
								key={lesson.id}
								className={cn(
									cardStyle,
									isCancelled && "opacity-75 pointer-events-none",
									"min-w-0 overflow-hidden"
								)}
								aria-disabled={isCancelled}
							>
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between gap-2 min-w-0">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 flex-wrap min-w-0">
												<CardTitle className="text-base break-words min-w-0">{lesson.label}</CardTitle>
												{lesson.timetable_name && (
													<Badge variant="outline" className={cn("font-normal text-xs min-w-0 max-w-full break-words whitespace-normal px-3 py-1.5", badgeStyle)}>
														{lesson.timetable_name}
													</Badge>
												)}
												{isCancelled && (
													<Badge variant="secondary" className="shrink-0 font-normal">
														Canceled
													</Badge>
												)}
											</div>
											<CardDescription className="mt-1">
												{formatDate(lesson.start_at)} · {formatTimeRange(lesson.start_at, lesson.end_at)}
											</CardDescription>
										</div>
										{!isCancelled && (
											<Button
												variant="ghost"
												size="icon"
												className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
												aria-label="Cancel lesson"
												onClick={() => {
													setCancelLesson(lesson)
													setCancelNote("")
												}}
											>
												<XCircle className="size-4" />
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent className="pt-0 text-sm text-muted-foreground">
									{lesson.trainer_name && (
										<p>
											{lesson.is_trainer ? "You (trainer)" : `Trainer: ${lesson.trainer_name}`}
										</p>
									)}
									{lesson.room_name && <p>Room: {lesson.room_name}</p>}
									<p className="capitalize">{lesson.lesson_type}</p>
									{isCancelled && lesson.cancellation_note && (
										<p className="mt-1 text-muted-foreground/90 italic">Reason: {lesson.cancellation_note}</p>
									)}
								</CardContent>
							</Card>
						)
					})}
				</ul>
			)}

			<Dialog open={!!cancelLesson} onOpenChange={(open) => !open && setCancelLesson(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Cancel lesson</DialogTitle>
						<DialogDescription>
							{cancelLesson && (
								<>
									{cancelLesson.label} on {formatDate(cancelLesson.start_at)} at{" "}
									{formatTimeRange(cancelLesson.start_at, cancelLesson.end_at)}. Add a reason (optional but recommended).
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2 py-2">
						<Label htmlFor="cancel-note">Reason for cancelling</Label>
						<Textarea
							id="cancel-note"
							placeholder="e.g. Illness, schedule conflict, …"
							value={cancelNote}
							onChange={(e) => setCancelNote(e.target.value)}
							rows={3}
							className="resize-none"
						/>
					</div>
					<DialogFooter className="gap-2">
						<Button variant="outline" onClick={() => setCancelLesson(null)} disabled={cancelling}>
							Keep lesson
						</Button>
						<Button variant="destructive" onClick={handleCancelConfirm} disabled={cancelling}>
							{cancelling ? <Loader2 className="size-4 animate-spin" /> : null}
							{cancelling ? "Cancelling…" : "Cancel lesson"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
