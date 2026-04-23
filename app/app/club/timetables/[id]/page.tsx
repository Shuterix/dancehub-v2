"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Calendar, Loader2, GraduationCap, Clock, Sparkles, Settings, User, BookOpen, Power, PowerOff, AlertTriangle, CheckCircle2 } from "lucide-react"
import {
	DndContext,
	MouseSensor,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { useSetBreadcrumbLastSegment } from "@/app/app/_components/sidebar"
import { LessonsLoadingSkeleton, TimetableDetailSkeleton } from "@/app/app/_components/page-skeleton"
import { cn } from "@/lib/utils"
import { getPreferredShortfallsWeekStart, setPreferredShortfallsWeekStart } from "@/lib/timetable-shortfalls-week"

type LessonItem = {
	id: string
	lesson_type: string
	start_at: string
	end_at: string
	room_id?: string | null
	room_name: string | null
	trainer_id: string | null
	trainer_name: string | null
	student_id?: string | null
	couple_id?: string | null
	group_id?: string | null
	group_lesson_type_id?: string | null
	label: string
	is_static: boolean
	cancelled_at?: string | null
}

/** Theme-friendly trainer colors (border + subtle bg) for lesson cards */
const TRAINER_COLORS = [
	"border-l-4 border-l-blue-500 bg-blue-500/10 dark:bg-blue-500/15",
	"border-l-4 border-l-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15",
	"border-l-4 border-l-violet-500 bg-violet-500/10 dark:bg-violet-500/15",
	"border-l-4 border-l-amber-500 bg-amber-500/10 dark:bg-amber-500/15",
	"border-l-4 border-l-rose-500 bg-rose-500/10 dark:bg-rose-500/15",
	"border-l-4 border-l-cyan-500 bg-cyan-500/10 dark:bg-cyan-500/15",
]
const TRAINER_SWATCH = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"]

function getTrainerColorIndex(trainerId: string | null, trainerOrder: string[]): number {
	if (!trainerId) return 0
	const i = trainerOrder.indexOf(trainerId)
	return i >= 0 ? i % TRAINER_COLORS.length : 0
}

function formatTimeRange(startAt: string, endAt: string): string {
	const start = startAt.slice(11, 16)
	const end = endAt.slice(11, 16)
	return `${start}–${end}`
}

/** Next Monday from today (YYYY-MM-DD). */
function nextMonday(): string {
	const d = new Date()
	const day = d.getDay()
	const add = day === 0 ? 1 : day === 1 ? 0 : 8 - day
	d.setDate(d.getDate() + add)
	return d.toISOString().slice(0, 10)
}

const RECURRENCE_LABELS: Record<string, string> = {
	weekly: "Weekly",
	bi_weekly: "Bi-weekly",
	monthly: "Monthly",
	weekends_only: "Weekends only",
	fixed_period: "Fixed period",
}

// Note: priority colors are defined in settings UI, not used here directly.

type TimetableDetail = {
	timetable: {
		id: string
		name: string
		recurrence: string
		valid_from: string
		valid_until: string | null
		is_active: boolean
		day_start: string
		day_end: string
	}
	preferences: {
		individual_lesson_duration_minutes: number
		max_consecutive_minutes_per_trainer: number
		min_break_minutes_after_consecutive: number
		distribution: string
		buffer_between_lessons_minutes: number
	} | null
	targets: Array<{
		id: string
		student_id: string | null
		couple_id: string | null
		label: string
		desired_lessons_count: number
		priority: string
		preferred_trainer_id: string | null
		preferred_trainer_name: string | null
	}>
	trainer_limits: Array<{
		id: string
		user_id: string
		full_name: string
		max_lessons_per_day: number
	}>
	group_targets?: Array<{
		id: string
		group_id: string
		group_lesson_type_id: string
		label: string
		desired_lessons_count: number
		priority: string
		preferred_trainer_id: string | null
		preferred_trainer_name: string | null
	}>
	groups?: Array<{ id: string; name: string }>
	group_lesson_types?: Array<{ id: string; group_id: string; name: string; duration_minutes: number }>
}

export default function TimetableDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const router = useRouter()
	const setBreadcrumbLastSegment = useSetBreadcrumbLastSegment()
	const [id, setId] = useState<string | null>(null)
	const [data, setData] = useState<TimetableDetail | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [weekStart, setWeekStart] = useState<string>(() => nextMonday())
	const [lessons, setLessons] = useState<LessonItem[]>([])
	const [loadingLessons, setLoadingLessons] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [selectedLesson, setSelectedLesson] = useState<LessonItem | null>(null)
	const [settingsOpen, setSettingsOpen] = useState(false)
	// UI-only filters (do not edit timetable)
	const [filterLabels, setFilterLabels] = useState<Set<string>>(new Set())
	const [filterTrainerIds, setFilterTrainerIds] = useState<Set<string>>(new Set())
	const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set())
	type ShortfallItem = {
		target_id?: string
		group_id?: string
		group_lesson_type_id?: string
		desired_lessons_count: number
		actual_count: number
		reason?: string
		blockers?: Array<{
			kind: "participant_unavailable" | "trainer_unavailable" | "trainer_busy" | "room_busy" | "participant_busy"
			count: number
		}>
	}
	const [shortfalls, setShortfalls] = useState<ShortfallItem[]>([])
	const [shortfallsLoading, setShortfallsLoading] = useState(false)
	const [adjacentLessonWeek, setAdjacentLessonWeek] = useState<{
		prev: string | null
		next: string | null
	}>({ prev: null, next: null })
	const [adjacentLoading, setAdjacentLoading] = useState(false)
	const [togglingActive, setTogglingActive] = useState(false)
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
	const [conflicts, setConflicts] = useState<ConflictItem[]>([])
	const [conflictsLoading, setConflictsLoading] = useState(false)
	const [conflictsOpen, setConflictsOpen] = useState(false)
	const [autoRescheduleOpen, setAutoRescheduleOpen] = useState(false)
	const [autoRescheduling, setAutoRescheduling] = useState(false)
	const [autoApplyAllFuture, setAutoApplyAllFuture] = useState(true)
	type AutoSkippedItem = {
		lesson_id: string
		lesson: {
			timetable_id: string
			lesson_type: "individual" | "couple" | "group"
			start_at: string
			end_at: string
			trainer_name: string | null
			participant_name: string | null
		}
		reason: string
		other_reasons: string[]
	}
	type AutoResults = {
		movedCount: number
		recurringCount: number
		skipped: AutoSkippedItem[]
	}
	const [autoResults, setAutoResults] = useState<AutoResults | null>(null)
	const [autoResultsOpen, setAutoResultsOpen] = useState(false)

	// Only conflicts that involve at least one lesson in THIS timetable. The
	// global /conflicts endpoint returns conflicts across all active timetables
	// in the club, but on the detail page the banner + red highlights must
	// reflect only what the user can actually see and resolve here.
	const timetableConflicts = useMemo(() => {
		if (!id) return []
		// A conflict is "of this timetable" if any of its lessons belongs to
		// it OR if it's a kind that lives on a timetable (availability /
		// window) and its timetable_id matches.
		return conflicts.filter((c) => {
			if (c.lessons.some((l) => l.timetable_id === id)) return true
			if (c.kind === "availability" || c.kind === "window") return c.timetable_id === id
			return false
		})
	}, [conflicts, id])

	// Lesson IDs from THIS timetable that appear in at least one conflict.
	// Used to visually highlight those lessons in the grid/list and offer a
	// "Reschedule" CTA.
	// Use the full `all_lesson_ids` set (every deduped occurrence of the
	// pattern), not just the canonical cluster's lessons, so every matching
	// lesson in the currently-viewed week lights up — not only the ones that
	// happen to be in the "first occurrence" week.
	const conflictedLessonIds = useMemo(() => {
		const set = new Set<string>()
		if (!id) return set
		for (const c of timetableConflicts) {
			for (const lid of c.all_lesson_ids) set.add(lid)
		}
		return set
	}, [timetableConflicts, id])

	// Conflicts whose pattern actually has an occurrence in the currently-viewed
	// week. Used for a more honest banner count: a conflict may exist for this
	// timetable but only in a future week, in which case the grid will have no
	// red rings and we want the banner to say so explicitly.
	const conflictsInCurrentWeek = useMemo(() => {
		if (conflictedLessonIds.size === 0) return []
		const weekLessonIds = new Set(lessons.map((l) => l.id))
		return timetableConflicts.filter((c) =>
			c.all_lesson_ids.some((lid) => weekLessonIds.has(lid)),
		)
	}, [timetableConflicts, conflictedLessonIds, lessons])

	useEffect(() => {
		params.then((p) => setId(p.id))
	}, [params])

	/** Align with timetables list `shortfalls-summary?week_start=…` (see `lib/timetable-shortfalls-week.ts`). */
	useEffect(() => {
		const s = getPreferredShortfallsWeekStart()
		if (s) setWeekStart(s)
	}, [])

	useEffect(() => {
		setPreferredShortfallsWeekStart(weekStart)
	}, [weekStart])

	const load = useCallback(() => {
		if (!id) return Promise.resolve()
		return fetch(`/api/club/timetables/${id}`, { cache: "no-store" })
			.then((res) => {
				if (res.status === 401) {
					toast.error("Session expired. Please sign in again.")
					router.push("/auth/login")
					return null
				}
				if (res.status === 404) {
					setError("Timetable not found.")
					return null
				}
				if (!res.ok) throw new Error("Failed to load timetable")
				return res.json()
			})
			.then((json) => {
				if (json) setData(json)
			})
	}, [id, router])

	useEffect(() => {
		let cancelled = false
		if (!id) return
		setLoading(true)
		load().catch((e) => setError(e instanceof Error ? e.message : "Something went wrong")).finally(() => {
			if (!cancelled) setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [id, load])

	const loadLessons = useCallback(() => {
		if (!id) return Promise.resolve()
		setLoadingLessons(true)
		return fetch(`/api/club/timetables/${id}/lessons?week_start=${encodeURIComponent(weekStart)}`)
			.then((res) => {
				if (!res.ok) throw new Error("Failed to load lessons")
				return res.json()
			})
			.then((json) => setLessons(json.lessons ?? []))
			.catch(() => setLessons([]))
			.finally(() => setLoadingLessons(false))
	}, [id, weekStart])

	const loadShortfalls = useCallback(() => {
		if (!id) return Promise.resolve()
		setShortfallsLoading(true)
		return fetch(`/api/club/timetables/${id}/shortfalls?week_start=${encodeURIComponent(weekStart)}`, {
			cache: "no-store",
		})
			.then((res) => (res.ok ? res.json() : { shortfalls: [] }))
			.then((json) => setShortfalls(Array.isArray(json?.shortfalls) ? json.shortfalls : []))
			.catch(() => setShortfalls([]))
			.finally(() => setShortfallsLoading(false))
	}, [id, weekStart])

	useEffect(() => {
		if (!id) return
		loadLessons()
	}, [id, weekStart, loadLessons])

	useEffect(() => {
		if (!id) return
		loadShortfalls()
	}, [id, weekStart, loadShortfalls])

	const loadAdjacentLessonWeeks = useCallback(() => {
		if (!id) return Promise.resolve()
		setAdjacentLoading(true)
		const base = `/api/club/timetables/${id}/adjacent-lesson-week?week_start=${encodeURIComponent(weekStart)}&direction=`
		return Promise.all([
			fetch(base + "prev", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { week_start: null })),
			fetch(base + "next", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { week_start: null })),
		])
			.then(([jPrev, jNext]) => {
				setAdjacentLessonWeek({
					prev: typeof jPrev?.week_start === "string" ? jPrev.week_start : null,
					next: typeof jNext?.week_start === "string" ? jNext.week_start : null,
				})
			})
			.catch(() => {
				setAdjacentLessonWeek({ prev: null, next: null })
			})
			.finally(() => {
				setAdjacentLoading(false)
			})
	}, [id, weekStart])

	useEffect(() => {
		if (!id) return
		loadAdjacentLessonWeeks()
	}, [id, weekStart, loadAdjacentLessonWeeks])

	const loadConflicts = useCallback(() => {
		setConflictsLoading(true)
		return fetch(`/api/club/timetables/conflicts`, { cache: "no-store" })
			.then((res) => (res.ok ? res.json() : { conflicts: [] }))
			.then((json) => setConflicts(Array.isArray(json?.conflicts) ? json.conflicts : []))
			.catch(() => setConflicts([]))
			.finally(() => setConflictsLoading(false))
	}, [])

	const runAutoReschedule = useCallback(async () => {
		if (!id) return
		setAutoRescheduling(true)
		try {
			// Send the canonical lesson IDs from every conflict that involves
			// this timetable — across all weeks, not just the viewed one.
			// `apply_to_all_future` then cascades each move to every future
			// occurrence of the pattern.
			const lessonIds = Array.from(
				new Set(
					timetableConflicts.flatMap((c) =>
						c.lessons
							.filter((l) => l.timetable_id === id)
							.map((l) => l.lesson_id),
					),
				),
			)
			const res = await fetch(`/api/club/timetables/${id}/auto-reschedule`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					lesson_ids: lessonIds,
					apply_to_all_future: autoApplyAllFuture,
				}),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json?.error ?? "Auto-reschedule failed")
				return
			}
			const movedCount = json?.summary?.moved_count ?? 0
			const skippedCount = json?.summary?.skipped_count ?? 0
			const recurringCount = json?.summary?.total_recurring_moved ?? 0
			const skipped: AutoSkippedItem[] = Array.isArray(json?.skipped) ? json.skipped : []

			setAutoResults({ movedCount, recurringCount, skipped })

			if (movedCount === 0 && skippedCount === 0) {
				toast.info("No conflicts needed rescheduling.")
			} else if (skippedCount === 0) {
				toast.success(
					`Moved ${movedCount} lesson${movedCount === 1 ? "" : "s"}` +
					(autoApplyAllFuture && recurringCount > 0 ? ` (+${recurringCount} recurring occurrence${recurringCount === 1 ? "" : "s"})` : ""),
				)
			} else {
				toast.warning(
					`Moved ${movedCount}, could not find a slot for ${skippedCount}`,
					{
						description: "Open the details dialog to see which lessons were skipped and why.",
						action: {
							label: "See details",
							onClick: () => setAutoResultsOpen(true),
						},
					},
				)
				// Auto-open the details dialog so the user immediately sees why.
				setAutoResultsOpen(true)
			}
			setAutoRescheduleOpen(false)
			await loadLessons()
			await loadConflicts()
		} catch {
			toast.error("Auto-reschedule failed")
		} finally {
			setAutoRescheduling(false)
		}
	}, [id, timetableConflicts, autoApplyAllFuture, loadLessons, loadConflicts])

	useEffect(() => {
		if (!id) return
		loadConflicts()
	}, [id, lessons.length, loadConflicts])

	// Show timetable name in breadcrumb instead of ID
	useEffect(() => {
		if (data?.timetable?.name) setBreadcrumbLastSegment(data.timetable.name)
		return () => setBreadcrumbLastSegment(null)
	}, [data?.timetable?.name, setBreadcrumbLastSegment])

	const filteredLessons = useMemo(() => {
		return lessons.filter((l) => {
			if (filterLabels.size > 0 && !filterLabels.has(l.label)) return false
			if (filterTrainerIds.size > 0) {
				if (!l.trainer_id || !filterTrainerIds.has(l.trainer_id)) return false
			}
			if (filterTypes.size > 0 && !filterTypes.has(l.lesson_type)) return false
			return true
		})
	}, [lessons, filterLabels, filterTrainerIds, filterTypes])

	const filterOptions = useMemo(() => {
		const labels = new Set<string>()
		const trainers: { id: string; name: string }[] = []
		const trainerIds = new Set<string>()
		const types = new Set<string>()
		for (const l of lessons) {
			if (l.label) labels.add(l.label)
			if (l.trainer_id && l.trainer_name && !trainerIds.has(l.trainer_id)) {
				trainerIds.add(l.trainer_id)
				trainers.push({ id: l.trainer_id, name: l.trainer_name })
			}
			if (l.lesson_type) types.add(l.lesson_type)
		}
		trainers.sort((a, b) => a.name.localeCompare(b.name))
		return {
			labels: [...labels].sort(),
			trainers,
			types: [...types].sort(),
		}
	}, [lessons])

	async function handleGenerate(options?: {
		distribution?: string
		group_targets?: Array<{
			group_id: string
			group_lesson_type_id: string
			desired_lessons_count: number
			priority?: string
			preferred_trainer_id?: string | null
		}>
	}) {
		if (!id) return
		setGenerating(true)
		try {
			const body: { week_start: string; distribution?: string; group_targets?: Array<{ group_id: string; group_lesson_type_id: string; desired_lessons_count: number; priority?: string; preferred_trainer_id?: string | null }> } = {
				week_start: weekStart,
			}
			if (options?.distribution) body.distribution = options.distribution
			if (options?.group_targets?.length) body.group_targets = options.group_targets
			const res = await fetch(`/api/club/timetables/${id}/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Generate failed")
				return
			}
			if (json.week_start) setWeekStart(json.week_start)
			setShortfalls(json.shortfalls ?? [])
			const created = json.created ?? 0
			if (created > 0) {
				toast.success(`Created ${created} lessons for the week.`)
			} else {
				toast.warning(
					"No lessons were created. Check that targets and trainers have availability overlapping the schedule window (e.g. " +
					(data?.timetable?.day_start ?? "08:00") +
					"–" +
					(data?.timetable?.day_end ?? "22:00") +
					")."
				)
			}
			loadLessons()
			loadShortfalls()
		} finally {
			setGenerating(false)
		}
	}

	function formatDate(s: string) {
		try {
			return new Date(s + "Z").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
		} catch {
			return s
		}
	}

	if (!id || loading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" asChild>
						<Link href="/app/club/timetables" aria-label="Back">
							<ChevronLeft className="size-4" />
						</Link>
					</Button>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">Timetable</h1>
						<p className="text-muted-foreground text-sm">{loading ? "Loading…" : "Invalid timetable."}</p>
					</div>
				</div>
				{loading && <TimetableDetailSkeleton />}
			</div>
		)
	}

	if (error || !data) {
		return (
			<div className="space-y-6">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club/timetables" aria-label="Back">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Timetable</h1>
					<p className="text-muted-foreground text-sm">{error ?? "Unable to load."}</p>
				</div>
			</div>
		)
	}

	const { timetable, targets } = data

	/** Wording for shortfall banners: counts use a month/fortnight/week, not only the 7 visible columns. */
	const shortfallScopeDescription = (() => {
		const r = timetable.recurrence
		if (r === "monthly") {
			const d = new Date(weekStart + "T12:00:00")
			return `${d.toLocaleDateString(undefined, { month: "long", year: "numeric" })} (entire calendar month)`
		}
		if (r === "bi_weekly") {
			return `the 14 days starting ${formatDate(weekStart)}`
		}
		if (r === "weekends_only") {
			return `the weekend in the week of ${formatDate(weekStart)}`
		}
		return `the week of ${formatDate(weekStart)}`
	})()

	const hasActiveFilters = filterLabels.size > 0 || filterTrainerIds.size > 0 || filterTypes.size > 0
	function clearFilters() {
		setFilterLabels(new Set())
		setFilterTrainerIds(new Set())
		setFilterTypes(new Set())
	}

	function toggleLabel(label: string) {
		setFilterLabels((prev) => {
			const next = new Set(prev)
			if (next.has(label)) next.delete(label)
			else next.add(label)
			return next
		})
	}
	function toggleTrainer(id: string) {
		setFilterTrainerIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}
	function toggleType(type: string) {
		setFilterTypes((prev) => {
			const next = new Set(prev)
			if (next.has(type)) next.delete(type)
			else next.add(type)
			return next
		})
	}

	async function handleToggleActive() {
		if (!id || togglingActive) return
		const nextActive = !timetable.is_active
		setTogglingActive(true)
		try {
			const res = await fetch(`/api/club/timetables/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ is_active: nextActive }),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Failed to update timetable")
				return
			}
			toast.success(nextActive ? "Timetable enabled" : "Timetable disabled. Lessons removed; you can generate again with the same settings.")
			await load()
			await loadLessons()
		} finally {
			setTogglingActive(false)
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<Button variant="ghost" size="icon" asChild className="shrink-0">
						<Link href="/app/club/timetables" aria-label="Back">
							<ChevronLeft className="size-4" />
						</Link>
					</Button>
					<div className="min-w-0">
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground wrap-break-word min-w-0">
							<Calendar className="size-5 shrink-0" />
							{timetable.name}
						</h1>
						<p className="text-muted-foreground text-xs sm:text-sm wrap-break-word min-w-0">
							{RECURRENCE_LABELS[timetable.recurrence] ?? timetable.recurrence} · {formatDate(timetable.valid_from)}
						</p>
					</div>
				</div>
				<div className="flex shrink-0 gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onClick={handleToggleActive}
						disabled={togglingActive}
						className={timetable.is_active ? "text-amber-600 hover:text-amber-700" : ""}
						title={timetable.is_active ? "Disable timetable (removes lessons; you can generate again later)" : "Enable timetable"}
					>
						{togglingActive ? <Loader2 className="size-4 animate-spin sm:mr-1" /> : timetable.is_active ? <PowerOff className="size-4 sm:mr-1" /> : <Power className="size-4 sm:mr-1" />}
						<span className="hidden sm:inline">{timetable.is_active ? "Disable" : "Enable"}</span>
					</Button>
					<Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="shrink-0">
						<Settings className="size-4 sm:mr-1" />
						<span className="hidden sm:inline">Settings</span>
					</Button>
				</div>
			</div>

			{!loading && (
				<>
					{conflictsLoading ? (
						<div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
							<div className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
								<span className="flex items-center gap-2 min-w-0">
									<Skeleton className="h-4 w-4 shrink-0 rounded" />
									<Skeleton className="h-4 w-88 max-w-full" />
								</span>
								<Skeleton className="h-4 w-10 shrink-0" />
							</div>
							<Skeleton className="h-9 w-full sm:w-40 rounded-md" />
						</div>
					) : timetableConflicts.length > 0 ? (
						<div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
							<button
								type="button"
								onClick={() => setConflictsOpen(true)}
								className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
							>
								<span className="flex items-center gap-2">
									<Clock className="size-4 shrink-0" />
									<span>
										<strong>{timetableConflicts.length}</strong> conflict
										{timetableConflicts.length === 1 ? "" : "s"} affect this timetable
										{conflictsInCurrentWeek.length === 0
											? " — none in the viewed week."
											: ` (${conflictsInCurrentWeek.length} in this week).`}
									</span>
								</span>
								<span className="text-xs underline underline-offset-2">View</span>
							</button>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={() => setAutoRescheduleOpen(true)}
								disabled={autoRescheduling}
								className="shrink-0"
							>
								{autoRescheduling ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
								Auto-reschedule
							</Button>
						</div>
					) : (
						<div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
							<span className="flex items-center gap-2">
								<CheckCircle2 className="size-4 shrink-0" />
								<span>
									<strong>No conflicts found.</strong> This timetable is clean.
								</span>
							</span>
						</div>
					)}
					{!conflictsLoading && shortfallsLoading && (
						<div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
							<div className="flex items-center gap-2 min-w-0">
								<Skeleton className="h-4 w-4 shrink-0 rounded" />
								<Skeleton className="h-4 w-full max-w-md" />
							</div>
						</div>
					)}
					{!conflictsLoading && !shortfallsLoading && shortfalls.length > 0 && (
						<div
							className="flex items-start gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-900 dark:text-orange-200"
							role="status"
						>
							<Clock className="size-4 shrink-0 mt-0.5" />
							<div className="min-w-0">
								<p>
									<strong>Targets not fully met</strong> in {shortfallScopeDescription} — same check as the
									&quot;Fewer lessons than requested&quot; card below.
								</p>
								<a
									href="#timetable-target-shortfalls"
									className="text-xs text-orange-800/95 underline underline-offset-2 dark:text-orange-300/95 mt-1 inline-block"
								>
									Jump to details
								</a>
							</div>
						</div>
					)}
				</>
			)}

			<Dialog open={conflictsOpen} onOpenChange={setConflictsOpen}>
				<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Conflicts in this timetable</DialogTitle>
						<DialogDescription>
							Overlapping lessons involving this timetable. Some may also touch other active timetables in your club.
						</DialogDescription>
					</DialogHeader>
					{timetableConflicts.length === 0 ? (
						<p className="text-sm text-muted-foreground">No conflicts.</p>
					) : (
						<ul className="space-y-3 text-sm">
							{timetableConflicts.map((c, i) => {
								const name =
									c.kind === "trainer"
										? c.trainer_name
										: c.kind === "room"
											? c.room_name
											: c.kind === "student"
												? c.student_name
												: c.kind === "couple"
													? c.couple_label
													: c.kind === "group"
														? c.group_name
														: c.kind === "member"
															? c.user_name
															: c.kind === "availability"
																? c.subject_name
																: c.timetable_name
								const kindLabel =
									c.kind === "trainer"
										? "Trainer"
										: c.kind === "room"
											? "Room"
											: c.kind === "student"
												? "Student"
												: c.kind === "couple"
													? "Couple"
													: c.kind === "group"
														? "Group"
														: c.kind === "member"
															? "Member"
															: c.kind === "availability"
																? `${c.subject.charAt(0).toUpperCase() + c.subject.slice(1)} availability`
																: "Outside day window"
								const recurrenceLabel =
									c.recurrence === "weekly"
										? "Repeats weekly"
										: c.recurrence === "bi_weekly"
											? "Repeats every 2 weeks"
											: c.recurrence === "monthly"
												? "Repeats monthly"
												: c.recurrence === "irregular"
													? "Recurring"
													: null
								const firstDate = c.first_occurrence.slice(0, 10)
								const firstWeekMonday = weekMonday(firstDate)
								const alreadyInWeek = firstWeekMonday === weekStart
								return (
									<li key={i} className="rounded-md border border-border bg-background/60 p-3">
										<div className="mb-1 flex flex-wrap items-center gap-2">
											<Badge variant="outline" className="text-xs">
												{kindLabel}
											</Badge>
											<span className="font-medium">{name}</span>
											{recurrenceLabel && c.occurrences > 1 && (
												<Badge variant="secondary" className="text-[10px]">
													{recurrenceLabel} ({c.occurrences}×)
												</Badge>
											)}
											{!alreadyInWeek && (
												<Button
													variant="outline"
													size="sm"
													className="h-6 px-2 py-0 text-xs"
													onClick={() => {
														setWeekStart(firstWeekMonday)
														setConflictsOpen(false)
													}}
												>
													Go to week of {firstDate}
												</Button>
											)}
										</div>
										<ul className="space-y-0.5 text-xs text-muted-foreground">
											{c.lessons.map((l) => (
												<li key={l.lesson_id}>
													{l.start_at.slice(0, 10)} {l.start_at.slice(11, 16)}–{l.end_at.slice(11, 16)} &middot; {l.lesson_type}
												</li>
											))}
										</ul>
									</li>
								)
							})}
						</ul>
					)}
				</DialogContent>
			</Dialog>

			<Dialog open={autoRescheduleOpen} onOpenChange={(o) => { if (!autoRescheduling) setAutoRescheduleOpen(o) }}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Auto-reschedule conflicts</DialogTitle>
						<DialogDescription>
							This will try to move every conflicted lesson in this timetable — regardless of which week — to the closest free slot, respecting trainer, participant, room, buffer and distribution rules.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 text-sm">
						<div className="rounded-md border border-border bg-muted/30 px-3 py-2">
							<div>
								<span className="text-muted-foreground">Conflicts to resolve: </span>
								<strong>{timetableConflicts.length}</strong>
							</div>
							<div className="text-xs text-muted-foreground mt-0.5">
								{conflictsInCurrentWeek.length > 0
									? `${conflictsInCurrentWeek.length} occur in the viewed week; the rest are in other weeks.`
									: "None are in the viewed week — all occur in other weeks."}
							</div>
						</div>
						<label className="flex items-start gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={autoApplyAllFuture}
								onChange={(e) => setAutoApplyAllFuture(e.target.checked)}
								className="mt-0.5 size-4 rounded border-input"
								disabled={autoRescheduling}
							/>
							<span>
								<span className="font-medium">Move the entire recurring pattern</span>
								<span className="block text-xs text-muted-foreground">
									For recurring patterns, apply the same time change to every occurrence (past and future) so the weekly pattern stays aligned.
								</span>
							</span>
						</label>
						<p className="text-xs text-muted-foreground">
							If no free slot can be found for a given lesson, it will be left as-is and reported in the summary.
						</p>
					</div>
					<div className="mt-4 flex justify-end gap-2">
						<Button variant="outline" size="sm" onClick={() => setAutoRescheduleOpen(false)} disabled={autoRescheduling}>
							Cancel
						</Button>
						<Button size="sm" onClick={runAutoReschedule} disabled={autoRescheduling || timetableConflicts.length === 0}>
							{autoRescheduling && <Loader2 className="mr-1 size-4 animate-spin" />}
							Run auto-reschedule
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={autoResultsOpen} onOpenChange={setAutoResultsOpen}>
				<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Auto-reschedule results</DialogTitle>
						<DialogDescription>
							{autoResults
								? `${autoResults.movedCount} moved` +
								(autoResults.recurringCount > 0 ? ` (+${autoResults.recurringCount} recurring occurrence${autoResults.recurringCount === 1 ? "" : "s"})` : "") +
								`, ${autoResults.skipped.length} could not be moved.`
								: ""}
						</DialogDescription>
					</DialogHeader>
					{!autoResults ? null : autoResults.skipped.length === 0 ? (
						<p className="text-sm text-muted-foreground">Everything was rescheduled successfully.</p>
					) : (
						<ul className="space-y-3 text-sm">
							{autoResults.skipped.map((s) => {
								const dateStr = s.lesson.start_at.slice(0, 10)
								const startTime = s.lesson.start_at.slice(11, 16)
								const endTime = s.lesson.end_at.slice(11, 16)
								const who = s.lesson.participant_name ?? "Participant"
								const with_ = s.lesson.trainer_name ? ` with ${s.lesson.trainer_name}` : ""
								return (
									<li key={s.lesson_id} className="rounded-md border border-border bg-background/60 p-3">
										<div className="mb-1 flex flex-wrap items-center gap-2">
											<Badge variant="outline" className="text-xs">
												{s.lesson.lesson_type === "individual" ? "Individual" : s.lesson.lesson_type === "couple" ? "Couple" : "Group"}
											</Badge>
											<span className="font-medium">{who}</span>
											<span className="text-xs text-muted-foreground">
												{dateStr} {startTime}–{endTime}
												{with_}
											</span>
										</div>
										<p className="text-destructive text-sm">{s.reason}</p>
										{s.other_reasons.length > 0 && (
											<ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
												{s.other_reasons.slice(0, 3).map((r, i) => (
													<li key={i}>{r}</li>
												))}
											</ul>
										)}
									</li>
								)
							})}
						</ul>
					)}
					<div className="mt-4 flex justify-end">
						<Button variant="outline" size="sm" onClick={() => setAutoResultsOpen(false)}>
							Close
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<div className="flex flex-col gap-2">
				<div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
					<div className="min-w-0">
						<label htmlFor="week-start" className="text-sm font-medium text-muted-foreground block">
							{data?.timetable?.recurrence === "weekends_only" ? "Weekend (pick any day)" : "Week"}
						</label>
						<p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
							← / → move to the nearest week in this timetable that has at least one lesson.
						</p>
					</div>
					<div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="shrink-0"
							disabled={adjacentLoading || !adjacentLessonWeek.prev}
							onClick={() => {
								if (adjacentLessonWeek.prev) {
									setWeekStart(adjacentLessonWeek.prev)
									setShortfalls([])
								}
							}}
							title="Latest week (before the one you are viewing) that has a lesson"
							aria-label="Go to previous week with lessons"
						>
							{adjacentLoading ? <Loader2 className="size-4 animate-spin" /> : <ChevronLeft className="size-4" />}
						</Button>
						<input
							id="week-start"
							type="date"
							value={weekStart}
							onChange={(e) => {
								setWeekStart(e.target.value)
								setShortfalls([])
							}}
							className="rounded-md border border-input bg-background px-3 py-2 text-sm min-w-0 w-38 sm:w-auto"
						/>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="shrink-0"
							disabled={adjacentLoading || !adjacentLessonWeek.next}
							onClick={() => {
								if (adjacentLessonWeek.next) {
									setWeekStart(adjacentLessonWeek.next)
									setShortfalls([])
								}
							}}
							title="Earliest week (after the one you are viewing) that has a lesson"
							aria-label="Go to next week with lessons"
						>
							{adjacentLoading ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
						</Button>
					</div>
				</div>
				{loadingLessons ? (
					<LessonsLoadingSkeleton />
				) : lessons.length === 0 ? (
					<div className="text-muted-foreground text-sm py-8 text-center space-y-2">
						<p>
							No lessons this week. Open{" "}
							<button type="button" onClick={() => setSettingsOpen(true)} className="underline font-medium">
								Settings
							</button>{" "}
							to configure and generate.
						</p>
						{!adjacentLoading && (adjacentLessonWeek.prev || adjacentLessonWeek.next) ? (
							<div className="flex flex-wrap items-center justify-center gap-2">
								{adjacentLessonWeek.prev && (
									<Button
										variant="secondary"
										size="sm"
										type="button"
										onClick={() => {
											setWeekStart(adjacentLessonWeek.prev!)
											setShortfalls([])
										}}
									>
										<ChevronLeft className="size-3.5 mr-1" />
										Earlier week with lessons
									</Button>
								)}
								{adjacentLessonWeek.next && (
									<Button
										variant="secondary"
										size="sm"
										type="button"
										onClick={() => {
											setWeekStart(adjacentLessonWeek.next!)
											setShortfalls([])
										}}
									>
										Later week with lessons
										<ChevronRight className="size-3.5 ml-1" />
									</Button>
								)}
							</div>
						) : null}
					</div>
				) : (
					<>
						{/* Filters: UI only, does not edit timetable */}
						<div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="text-sm font-medium text-foreground">Filters</span>
								{hasActiveFilters && (
									<Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearFilters}>
										Clear all
									</Button>
								)}
							</div>
							<div className="flex flex-wrap gap-3 text-sm">
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-muted-foreground shrink-0">Participant:</span>
									{filterOptions.labels.map((label) => (
										<Badge
											key={label}
											variant={filterLabels.has(label) ? "default" : "outline"}
											className="cursor-pointer font-normal"
											role="button"
											tabIndex={0}
											onClick={() => toggleLabel(label)}
											onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLabel(label) } }}
										>
											{label}
										</Badge>
									))}
								</div>
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-muted-foreground shrink-0">Trainer:</span>
									{filterOptions.trainers.map((t) => (
										<Badge
											key={t.id}
											variant={filterTrainerIds.has(t.id) ? "default" : "outline"}
											className="cursor-pointer font-normal"
											role="button"
											tabIndex={0}
											onClick={() => toggleTrainer(t.id)}
											onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTrainer(t.id) } }}
										>
											{t.name}
										</Badge>
									))}
								</div>
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-muted-foreground shrink-0">Type:</span>
									{filterOptions.types.map((type) => (
										<Badge
											key={type}
											variant={filterTypes.has(type) ? "default" : "outline"}
											className="cursor-pointer font-normal capitalize"
											role="button"
											tabIndex={0}
											onClick={() => toggleType(type)}
											onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleType(type) } }}
										>
											{type}
										</Badge>
									))}
								</div>
							</div>
							{hasActiveFilters && (
								<p className="text-xs text-muted-foreground">
									Showing {filteredLessons.length} of {lessons.length} lessons
								</p>
							)}
						</div>
						{filteredLessons.length === 0 ? (
							<p className="text-muted-foreground text-sm py-6 text-center">
								No lessons match the current filters. Clear filters or change selection.
							</p>
						) : (
							<LessonGrid
								lessons={filteredLessons}
								weekStart={weekStart}
								conflictedLessonIds={conflictedLessonIds}
								onLessonClick={setSelectedLesson}
								onLessonMove={async (lessonId, date, time) => {
									// Find original lesson to avoid unnecessary calls
									const original = lessons.find((l) => l.id === lessonId)
									if (!original) return
									const originalDate = original.start_at.slice(0, 10)
									const originalTime = original.start_at.slice(11, 16)
									if (originalDate === date && originalTime === time) return
									try {
										const res = await fetch(`/api/club/timetables/${id}/lessons/${lessonId}`, {
											method: "PATCH",
											headers: { "Content-Type": "application/json" },
											body: JSON.stringify({ date, start_time: time }),
										})
										const json = await res.json().catch(() => ({}))
										if (!res.ok) {
											const details = Array.isArray(json.issues) ? json.issues.join("\n") : undefined
											toast.error(json.error ?? "Unable to move lesson", {
												description: details,
											})
											return
										}
										toast.success("Lesson rescheduled")
										await loadLessons()
										await loadConflicts()
									} catch {
										toast.error("Unable to move lesson")
									}
								}}
							/>
						)}
					</>
				)}
			</div>

			{shortfalls.length > 0 && (() => {
				const blockerLabel: Record<
					NonNullable<ShortfallItem["blockers"]>[number]["kind"],
					string
				> = {
					participant_unavailable: "Participant out of availability",
					participant_busy: "Participant occupied (other lessons)",
					trainer_unavailable: "No trainer availability",
					trainer_busy: "Trainers occupied (other lessons)",
					room_busy: "Rooms occupied",
				}
				const totalMissing = shortfalls.reduce(
					(acc, s) => acc + Math.max(0, s.desired_lessons_count - s.actual_count),
					0
				)
				return (
					<Card
						id="timetable-target-shortfalls"
						className="mt-6 scroll-mt-24 border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/5"
					>
						<CardHeader className="pb-2">
							<CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
								<Clock className="size-4" />
								Fewer lessons than requested
							</CardTitle>
							<CardDescription>
								{totalMissing} lesson{totalMissing === 1 ? "" : "s"} across {shortfalls.length} participant
								{shortfalls.length === 1 ? "" : "s"} could not be scheduled. See why below.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="space-y-2 text-sm">
								{shortfalls.map((s, i) => {
									const label = s.target_id
										? data?.targets?.find((t) => t.id === s.target_id)?.label
										: data?.group_targets?.find(
											(gt) => gt.group_id === s.group_id && gt.group_lesson_type_id === s.group_lesson_type_id
										)?.label
									const name = label ?? (s.group_id ? "Group" : "Participant")
									const missing = Math.max(0, s.desired_lessons_count - s.actual_count)
									return (
										<li
											key={i}
											className="flex flex-col gap-1 rounded-md bg-background/60 px-3 py-2"
										>
											<div className="flex flex-wrap items-center gap-2">
												<span className="font-medium">{name}</span>
												<Badge variant="outline" className="text-xs">
													{s.actual_count} / {s.desired_lessons_count} scheduled
												</Badge>
												<span className="text-xs text-muted-foreground">
													({missing} missing)
												</span>
											</div>
											{s.reason && (
												<p className="text-xs text-muted-foreground">
													{s.reason}
												</p>
											)}
											{s.blockers && s.blockers.length > 0 && (
												<div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
													{s.blockers.slice(0, 4).map((b) => (
														<span
															key={b.kind}
															className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5"
														>
															{blockerLabel[b.kind]} · {b.count}
														</span>
													))}
												</div>
											)}
										</li>
									)
								})}
							</ul>
						</CardContent>
					</Card>
				)
			})()}

			{lessons.length > 0 && (
				<>
					{hasActiveFilters && (
						<p className="text-sm text-muted-foreground -mt-2">
							Statistics below reflect filtered lessons ({filteredLessons.length} of {lessons.length}).
						</p>
					)}
					<TimetableStats lessons={filteredLessons} />
				</>
			)}

			<LessonDetailDialog
				lesson={selectedLesson}
				open={!!selectedLesson}
				onOpenChange={(open) => !open && setSelectedLesson(null)}
				timetableId={id}
				targets={targets}
				isConflicted={selectedLesson ? conflictedLessonIds.has(selectedLesson.id) : false}
				weekStart={weekStart}
				onUpdated={async () => {
					await loadLessons()
					await loadConflicts()
				}}
			/>
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				timetableId={id}
				data={data}
				weekStart={weekStart}
				setWeekStart={setWeekStart}
				onSaved={async () => { await load(); setSettingsOpen(false) }}
				onGenerated={() => { loadLessons(); setSettingsOpen(false) }}
				onGenerate={(opts) => handleGenerate(opts)}
				generating={generating}
			/>
		</div>
	)
}

function SettingsDialog({
	open,
	onOpenChange,
	timetableId,
	data,
	weekStart,
	setWeekStart,
	onSaved,
	onGenerated,
	onGenerate,
	generating,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	timetableId: string
	data: TimetableDetail
	weekStart: string
	setWeekStart: (s: string) => void
	onSaved: () => void | Promise<void>
	onGenerated: () => void
	onGenerate: (opts?: { distribution?: string; group_targets?: Array<{ group_id: string; group_lesson_type_id: string; desired_lessons_count: number; priority?: string; preferred_trainer_id?: string | null }> }) => Promise<void>
	generating: boolean
}) {
	const { timetable, preferences, targets, trainer_limits, group_targets = [], groups = [], group_lesson_types = [] } = data
	const [name, setName] = useState(timetable.name)
	const [dayStart, setDayStart] = useState(timetable.day_start)
	const [dayEnd, setDayEnd] = useState(timetable.day_end)
	const [duration, setDuration] = useState(preferences?.individual_lesson_duration_minutes ?? 45)
	const [maxConsecutive, setMaxConsecutive] = useState(preferences?.max_consecutive_minutes_per_trainer ?? 120)
	const [breakMin, setBreakMin] = useState(preferences?.min_break_minutes_after_consecutive ?? 15)
	const [prefDistribution, setPrefDistribution] = useState(preferences?.distribution ?? "same")
	const [buffer, setBuffer] = useState(preferences?.buffer_between_lessons_minutes ?? 0)
	const [limits, setLimits] = useState<Record<string, number>>(
		() => Object.fromEntries(trainer_limits.map((l) => [l.user_id, l.max_lessons_per_day]))
	)
	const [targetEdits, setTargetEdits] = useState<Record<string, { desired_lessons_count: number; priority: string; preferred_trainer_id: string | null }>>(
		() => Object.fromEntries(targets.map((t) => [t.id, { desired_lessons_count: t.desired_lessons_count, priority: t.priority, preferred_trainer_id: t.preferred_trainer_id }]))
	)
	const [groupTargetEdits, setGroupTargetEdits] = useState<
		Record<string, { desired_lessons_count: number; priority: string; preferred_trainer_id: string | null }>
	>(() => Object.fromEntries(group_targets.map((t) => [t.id, { desired_lessons_count: t.desired_lessons_count, priority: t.priority, preferred_trainer_id: t.preferred_trainer_id }])))
	type NewGroupTarget = { group_id: string; group_lesson_type_id: string; desired_lessons_count: number; priority: string; preferred_trainer_id: string | null }
	const [newGroupTargets, setNewGroupTargets] = useState<NewGroupTarget[]>([])
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (!open) return
		setName(timetable.name)
		setDayStart(timetable.day_start)
		setDayEnd(timetable.day_end)
		setDuration(preferences?.individual_lesson_duration_minutes ?? 45)
		setMaxConsecutive(preferences?.max_consecutive_minutes_per_trainer ?? 120)
		setBreakMin(preferences?.min_break_minutes_after_consecutive ?? 15)
		setPrefDistribution(preferences?.distribution ?? "same")
		setBuffer(preferences?.buffer_between_lessons_minutes ?? 0)
		setLimits(Object.fromEntries(trainer_limits.map((l) => [l.user_id, l.max_lessons_per_day])))
		setTargetEdits(Object.fromEntries(targets.map((t) => [t.id, { desired_lessons_count: t.desired_lessons_count, priority: t.priority, preferred_trainer_id: t.preferred_trainer_id }])))
		setGroupTargetEdits(Object.fromEntries(group_targets.map((t) => [t.id, { desired_lessons_count: t.desired_lessons_count, priority: t.priority, preferred_trainer_id: t.preferred_trainer_id }])))
		setNewGroupTargets([])
	}, [open, timetable.name, timetable.day_start, timetable.day_end, preferences, trainer_limits, targets, group_targets])

	async function handleSave(): Promise<boolean> {
		setSaving(true)
		try {
			const res = await fetch(`/api/club/timetables/${timetableId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: name.trim(),
					day_start: dayStart,
					day_end: dayEnd,
					preferences: {
						individual_lesson_duration_minutes: duration,
						max_consecutive_minutes_per_trainer: maxConsecutive,
						min_break_minutes_after_consecutive: breakMin,
						distribution: prefDistribution,
						buffer_between_lessons_minutes: buffer,
					},
					targets: targets.map((t) => {
						const e = targetEdits[t.id]
						return {
							student_id: t.student_id ?? undefined,
							couple_id: t.couple_id ?? undefined,
							desired_lessons_count: e?.desired_lessons_count ?? t.desired_lessons_count,
							priority: e?.priority ?? t.priority,
							preferred_trainer_id: e?.preferred_trainer_id ?? t.preferred_trainer_id,
						}
					}),
					group_targets: [
						...group_targets.map((gt) => {
							const e = groupTargetEdits[gt.id]
							return {
								group_id: gt.group_id,
								group_lesson_type_id: gt.group_lesson_type_id,
								desired_lessons_count: e?.desired_lessons_count ?? gt.desired_lessons_count,
								priority: e?.priority ?? gt.priority,
								preferred_trainer_id: e?.preferred_trainer_id ?? gt.preferred_trainer_id,
							}
						}),
						...newGroupTargets.filter((n) => n.group_id && n.group_lesson_type_id),
					],
					trainer_limits: trainer_limits.map((l) => ({ user_id: l.user_id, max_lessons_per_day: limits[l.user_id] ?? l.max_lessons_per_day })),
				}),
			})
			if (!res.ok) {
				const j = await res.json().catch(() => ({}))
				toast.error(j.error ?? "Failed to save")
				return false
			}
			toast.success("Settings saved")
			await Promise.resolve(onSaved())
			return true
		} finally {
			setSaving(false)
		}
	}

	async function handleGenerateClick() {
		const hasUnsavedGroupTargets = newGroupTargets.some((n) => n.group_id && n.group_lesson_type_id)
		if (hasUnsavedGroupTargets) {
			const saved = await handleSave()
			if (!saved) return
		}
		setWeekStart(weekStart)
		// Use the current (possibly unsaved) distribution preference from the Preferences section
		// and pass current group targets so generate uses them even if not yet persisted.
		const combinedGroupTargets = [
			...group_targets.map((gt) => {
				const e = groupTargetEdits[gt.id]
				return {
					group_id: gt.group_id,
					group_lesson_type_id: gt.group_lesson_type_id,
					desired_lessons_count: e?.desired_lessons_count ?? gt.desired_lessons_count,
					priority: e?.priority ?? gt.priority,
					preferred_trainer_id: e?.preferred_trainer_id ?? gt.preferred_trainer_id,
				}
			}),
			...newGroupTargets.filter((n) => n.group_id && n.group_lesson_type_id).map((n) => ({
				group_id: n.group_id,
				group_lesson_type_id: n.group_lesson_type_id,
				desired_lessons_count: n.desired_lessons_count,
				priority: n.priority,
				preferred_trainer_id: n.preferred_trainer_id,
			})),
		]
		await onGenerate({
			distribution: prefDistribution,
			...(combinedGroupTargets.length ? { group_targets: combinedGroupTargets } : {}),
		})
		onGenerated()
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-2xl">
				<DialogHeader>
					<DialogTitle>Timetable settings</DialogTitle>
					<DialogDescription>Configure schedule, preferences, targets, and trainers. Save to apply changes.</DialogDescription>
				</DialogHeader>
				<div className="grid gap-6 py-2">
					<div className="space-y-2">
						<label className="text-sm font-medium">Name</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						/>
					</div>
					<div className="space-y-2">
						<h4 className="text-sm font-medium">Schedule window</h4>
						<div className="flex gap-2 items-center">
							<input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
							<span className="text-muted-foreground">–</span>
							<input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
						</div>
					</div>
					<div className="space-y-2">
						<h4 className="text-sm font-medium">Preferences</h4>
						<div className="grid gap-2 text-sm">
							<div className="flex items-center gap-2">
								<label className="w-40 shrink-0">Lesson duration (min)</label>
								<input type="number" min={15} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 45)} className="rounded-md border border-input bg-background px-2 py-1.5 w-20" />
							</div>
							<div className="flex items-center gap-2">
								<label className="w-40 shrink-0">Max consecutive (min)</label>
								<input type="number" min={30} value={maxConsecutive} onChange={(e) => setMaxConsecutive(Number(e.target.value) || 120)} className="rounded-md border border-input bg-background px-2 py-1.5 w-20" />
							</div>
							<div className="flex items-center gap-2">
								<label className="w-40 shrink-0">Break after (min)</label>
								<input type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value) || 0)} className="rounded-md border border-input bg-background px-2 py-1.5 w-20" />
							</div>
							<div className="flex items-center gap-2">
								<label className="w-40 shrink-0">Buffer (min)</label>
								<input type="number" min={0} value={buffer} onChange={(e) => setBuffer(Number(e.target.value) || 0)} className="rounded-md border border-input bg-background px-2 py-1.5 w-20" />
							</div>
							<div className="flex items-center gap-2">
								<label className="w-40 shrink-0">Distribution</label>
								<Select value={prefDistribution} onValueChange={setPrefDistribution}>
									<SelectTrigger className="h-8 w-[140px] rounded-md border border-input bg-background text-sm text-foreground">
										<SelectValue />
									</SelectTrigger>
									<SelectContent className="bg-popover text-popover-foreground">
										<SelectItem value="same">Spread</SelectItem>
										<SelectItem value="first_half">Mon–Wed</SelectItem>
										<SelectItem value="second_half">Thu–Sun</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
					<div className="space-y-2">
						<h4 className="text-sm font-medium">Targets ({targets.length})</h4>
						{targets.length === 0 ? (
							<p className="text-muted-foreground text-sm">No targets. Add them when creating the timetable.</p>
						) : (
							<ul className="space-y-2 max-h-40 overflow-y-auto">
								{targets.map((t) => {
									const e = targetEdits[t.id]
									return (
										<li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
											<span className="font-medium shrink-0">{t.label}</span>
											<input type="number" min={0} value={e?.desired_lessons_count ?? t.desired_lessons_count} onChange={(ev) => setTargetEdits((prev) => ({ ...prev, [t.id]: { desired_lessons_count: Number(ev.target.value) || 0, priority: (prev[t.id] ?? t).priority, preferred_trainer_id: (prev[t.id] ?? t).preferred_trainer_id } }))} className="w-14 rounded border px-1.5 py-0.5 text-center" />
											<span className="text-muted-foreground text-xs">lessons</span>
											<Select value={e?.priority ?? t.priority} onValueChange={(v) => setTargetEdits((prev) => ({ ...prev, [t.id]: { desired_lessons_count: (prev[t.id] ?? t).desired_lessons_count, priority: v, preferred_trainer_id: (prev[t.id] ?? t).preferred_trainer_id } }))}>
												<SelectTrigger className="h-7 w-[90px] rounded border border-input bg-background text-xs text-foreground">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="high">High</SelectItem>
													<SelectItem value="medium">Medium</SelectItem>
													<SelectItem value="low">Low</SelectItem>
												</SelectContent>
											</Select>
											<Select value={e?.preferred_trainer_id ?? t.preferred_trainer_id ?? "__any__"} onValueChange={(v) => setTargetEdits((prev) => ({ ...prev, [t.id]: { desired_lessons_count: (prev[t.id] ?? t).desired_lessons_count, priority: (prev[t.id] ?? t).priority, preferred_trainer_id: v === "__any__" ? null : v } }))}>
												<SelectTrigger className="h-7 min-w-[100px] max-w-[140px] rounded border border-input bg-background text-xs text-foreground">
													<SelectValue placeholder="Any" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__any__">Any</SelectItem>
													{trainer_limits.map((tr) => (
														<SelectItem key={tr.user_id} value={tr.user_id}>{tr.full_name}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</li>
									)
								})}
							</ul>
						)}
					</div>
					<div className="space-y-2">
						<h4 className="text-sm font-medium">Group lesson targets ({group_targets.length + newGroupTargets.length})</h4>
						{(group_targets.length === 0 && newGroupTargets.length === 0) ? (
							<p className="text-muted-foreground text-sm">No group targets. Add a group + lesson type below to schedule group lessons.</p>
						) : (
							<ul className="space-y-2 max-h-40 overflow-y-auto">
								{group_targets.map((gt) => {
									const e = groupTargetEdits[gt.id]
									return (
										<li key={gt.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
											<span className="font-medium shrink-0">{gt.label}</span>
											<input type="number" min={0} value={e?.desired_lessons_count ?? gt.desired_lessons_count} onChange={(ev) => setGroupTargetEdits((prev) => ({ ...prev, [gt.id]: { desired_lessons_count: Number(ev.target.value) || 0, priority: (prev[gt.id] ?? gt).priority, preferred_trainer_id: (prev[gt.id] ?? gt).preferred_trainer_id } }))} className="w-14 rounded border px-1.5 py-0.5 text-center" />
											<span className="text-muted-foreground text-xs">/ week</span>
											<Select value={e?.priority ?? gt.priority} onValueChange={(v) => setGroupTargetEdits((prev) => ({ ...prev, [gt.id]: { desired_lessons_count: (prev[gt.id] ?? gt).desired_lessons_count, priority: v, preferred_trainer_id: (prev[gt.id] ?? gt).preferred_trainer_id } }))}>
												<SelectTrigger className="h-7 w-[90px] rounded border border-input bg-background text-xs text-foreground">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="high">High</SelectItem>
													<SelectItem value="medium">Medium</SelectItem>
													<SelectItem value="low">Low</SelectItem>
												</SelectContent>
											</Select>
											<Select value={e?.preferred_trainer_id ?? gt.preferred_trainer_id ?? "__any__"} onValueChange={(v) => setGroupTargetEdits((prev) => ({ ...prev, [gt.id]: { desired_lessons_count: (prev[gt.id] ?? gt).desired_lessons_count, priority: (prev[gt.id] ?? gt).priority, preferred_trainer_id: v === "__any__" ? null : v } }))}>
												<SelectTrigger className="h-7 min-w-[100px] max-w-[140px] rounded border border-input bg-background text-xs text-foreground">
													<SelectValue placeholder="Any" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__any__">Any</SelectItem>
													{trainer_limits.map((tr) => (
														<SelectItem key={tr.user_id} value={tr.user_id}>{tr.full_name}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</li>
									)
								})}
								{newGroupTargets.map((n, idx) => (
									<li key={`new-${idx}`} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-sm">
										<Select value={n.group_id || "__none__"} onValueChange={(v) => setNewGroupTargets((prev) => prev.map((x, i) => (i === idx ? { ...x, group_id: v === "__none__" ? "" : v, group_lesson_type_id: "" } : x)))}>
											<SelectTrigger className="h-7 min-w-[100px] rounded border border-input bg-background text-xs text-foreground">
												<SelectValue placeholder="Group…" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="__none__">Group…</SelectItem>
												{groups.map((g) => (
													<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Select value={n.group_lesson_type_id || "__none__"} onValueChange={(v) => setNewGroupTargets((prev) => prev.map((x, i) => (i === idx ? { ...x, group_lesson_type_id: v === "__none__" ? "" : v } : x)))}>
											<SelectTrigger className="h-7 min-w-[100px] rounded border border-input bg-background text-xs text-foreground">
												<SelectValue placeholder="Type…" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="__none__">Type…</SelectItem>
												{group_lesson_types.filter((t) => t.group_id === n.group_id).map((t) => (
													<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
												))}
											</SelectContent>
										</Select>
										<input type="number" min={0} value={n.desired_lessons_count} onChange={(ev) => setNewGroupTargets((prev) => prev.map((x, i) => (i === idx ? { ...x, desired_lessons_count: Number(ev.target.value) || 0 } : x)))} className="w-14 rounded border border-input bg-background px-1.5 py-0.5 text-center text-xs text-foreground" />
										<Select value={n.priority} onValueChange={(v) => setNewGroupTargets((prev) => prev.map((x, i) => (i === idx ? { ...x, priority: v } : x)))}>
											<SelectTrigger className="h-7 w-[90px] rounded border border-input bg-background text-xs text-foreground">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="high">High</SelectItem>
												<SelectItem value="medium">Medium</SelectItem>
												<SelectItem value="low">Low</SelectItem>
											</SelectContent>
										</Select>
										<Select value={n.preferred_trainer_id ?? "__any__"} onValueChange={(v) => setNewGroupTargets((prev) => prev.map((x, i) => (i === idx ? { ...x, preferred_trainer_id: v === "__any__" ? null : v } : x)))}>
											<SelectTrigger className="h-7 min-w-[100px] max-w-[140px] rounded border border-input bg-background text-xs text-foreground">
												<SelectValue placeholder="Any" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="__any__">Any</SelectItem>
												{trainer_limits.map((tr) => (
													<SelectItem key={tr.user_id} value={tr.user_id}>{tr.full_name}</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button type="button" variant="ghost" size="sm" className="shrink-0 h-7 px-1.5" onClick={() => setNewGroupTargets((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
									</li>
								))}
							</ul>
						)}
						{groups.length > 0 && group_lesson_types.length > 0 && (
							<Button type="button" variant="outline" size="sm" onClick={() => setNewGroupTargets((prev) => [...prev, { group_id: groups[0].id, group_lesson_type_id: group_lesson_types.find((t) => t.group_id === groups[0].id)?.id ?? "", desired_lessons_count: 1, priority: "medium", preferred_trainer_id: null }])}>
								Add group target
							</Button>
						)}
					</div>
					<div className="space-y-2">
						<h4 className="text-sm font-medium">Trainers ({trainer_limits.length})</h4>
						{trainer_limits.length === 0 ? (
							<p className="text-muted-foreground text-sm">No trainers set.</p>
						) : (
							<ul className="space-y-2">
								{trainer_limits.map((l) => (
									<li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
										<span className="font-medium">{l.full_name}</span>
										<div className="flex items-center gap-1">
											<input type="number" min={1} value={limits[l.user_id] ?? l.max_lessons_per_day} onChange={(e) => setLimits((prev) => ({ ...prev, [l.user_id]: Number(e.target.value) || 1 }))} className="w-14 rounded border px-2 py-1 text-center text-sm" />
											<span className="text-muted-foreground text-xs">/ day</span>
										</div>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="space-y-2 border-t pt-4">
						<h4 className="text-sm font-medium">Generate week</h4>
						<p className="text-xs text-muted-foreground">
							Uses the distribution set in Preferences above.
						</p>
						<div className="flex flex-wrap items-end gap-3">
							<div>
								<label className="text-xs text-muted-foreground block mb-0.5">Week (Monday)</label>
								<input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
							</div>
							<Button onClick={handleGenerateClick} disabled={generating || (!targets.length && !group_targets.length && !newGroupTargets.some((n) => n.group_id && n.group_lesson_type_id)) || !trainer_limits.length}>
								{generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
								{generating ? "Generating…" : "Generate"}
							</Button>
						</div>
					</div>
				</div>
				<div className="flex justify-end gap-2 pt-2 border-t">
					<Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? <Loader2 className="size-4 animate-spin" /> : null}
						{saving ? "Saving…" : "Save settings"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

/** Monday of the week containing dateStr (YYYY-MM-DD). */
function weekMonday(dateStr: string): string {
	const d = new Date(dateStr + "T12:00:00")
	const day = d.getDay()
	const diff = day === 0 ? -6 : 1 - day
	d.setDate(d.getDate() + diff)
	return d.toISOString().slice(0, 10)
}

function TimetableStats({ lessons }: { lessons: LessonItem[] }) {
	const byParticipant = useMemo(() => {
		const map = new Map<string, { total: number; byTrainer: Map<string, number> }>()
		for (const l of lessons) {
			const label = l.label || "—"
			if (!map.has(label)) map.set(label, { total: 0, byTrainer: new Map() })
			const entry = map.get(label)!
			entry.total++
			const t = l.trainer_name || "—"
			entry.byTrainer.set(t, (entry.byTrainer.get(t) ?? 0) + 1)
		}
		return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
	}, [lessons])

	const byTrainer = useMemo(() => {
		const map = new Map<string, number>()
		for (const l of lessons) {
			const t = l.trainer_name || "—"
			map.set(t, (map.get(t) ?? 0) + 1)
		}
		return [...map.entries()].sort((a, b) => b[1] - a[1])
	}, [lessons])

	const totalLessons = lessons.length

	return (
		<Card className="mt-6 overflow-hidden">
			<CardHeader className="pb-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<CardTitle className="text-lg flex items-center gap-2">
							<BookOpen className="size-5 text-muted-foreground" />
							Week statistics
						</CardTitle>
						<CardDescription className="mt-1">
							Who has how many lessons and with which trainer.
						</CardDescription>
					</div>
					<Badge variant="secondary" className="text-sm px-3 py-1 font-semibold">
						{totalLessons} lesson{totalLessons !== 1 ? "s" : ""} this week
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* By participant */}
				<section className="space-y-2">
					<h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
						<User className="size-4 text-muted-foreground" />
						By participant
					</h4>
					<ul className="space-y-2">
						{byParticipant.map(([label, { total, byTrainer: bt }]) => {
							const trainerEntries = [...bt.entries()].filter(([name]) => name !== "—")
							return (
								<li
									key={label}
									className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5"
								>
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
										{total}
									</div>
									<span className="font-medium min-w-0 truncate">{label}</span>
									<div className="flex flex-wrap gap-1.5 ml-auto">
										{trainerEntries.length === 0 ? (
											<span className="text-xs text-muted-foreground">No trainer</span>
										) : (
											trainerEntries.map(([name, n]) => (
												<Badge key={name} variant="outline" className="text-xs font-normal">
													{n} with {name}
												</Badge>
											))
										)}
									</div>
								</li>
							)
						})}
					</ul>
				</section>

				{/* By trainer */}
				<section className="space-y-2">
					<h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
						<GraduationCap className="size-4 text-muted-foreground" />
						By trainer
					</h4>
					<div className="flex flex-wrap gap-2">
						{byTrainer.map(([name, count]) => (
							<div
								key={name}
								className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2 min-w-0"
							>
								<span className="text-sm font-medium truncate max-w-[140px]">
									{name === "—" ? "Unassigned" : name}
								</span>
								<Badge variant="secondary" className="shrink-0 font-semibold">
									{count}
								</Badge>
							</div>
						))}
					</div>
				</section>
			</CardContent>
		</Card>
	)
}

function LessonDetailDialog(props: {
	lesson: LessonItem | null
	open: boolean
	onOpenChange: (open: boolean) => void
	timetableId: string
	targets: TimetableDetail["targets"]
	isConflicted?: boolean
	weekStart?: string
	onUpdated: () => void
}) {
	const { lesson, ...rest } = props
	if (!lesson) return null
	return <LessonDetailDialogInner lesson={lesson} {...rest} />
}

function LessonDetailDialogInner({
	lesson,
	open,
	onOpenChange,
	timetableId,
	targets,
	isConflicted = false,
	weekStart,
	onUpdated,
}: {
	lesson: LessonItem
	open: boolean
	onOpenChange: (open: boolean) => void
	timetableId: string
	targets: TimetableDetail["targets"]
	isConflicted?: boolean
	weekStart?: string
	onUpdated: () => void
}) {
	const [rescheduleOpen, setRescheduleOpen] = useState(false)
	const [selectedTargetId, setSelectedTargetId] = useState<string | null>(() => {
		const match = targets.find(
			(t) => t.student_id === (lesson.student_id ?? null) && t.couple_id === (lesson.couple_id ?? null)
		)
		return match?.id ?? null
	})
	const [saving, setSaving] = useState(false)
	const dayLabel = (() => {
		try {
			return new Date(lesson.start_at.slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })
		} catch {
			return lesson.start_at.slice(0, 10)
		}
	})()
	const dateFormatted = (() => {
		try {
			return new Date(lesson.start_at.slice(0, 10) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
		} catch {
			return lesson.start_at.slice(0, 10)
		}
	})()
	const isCancelled = !!lesson.cancelled_at

	const handleSave = async () => {
		if (!lesson) return
		const currentTarget = targets.find(
			(t) => t.student_id === (lesson.student_id ?? null) && t.couple_id === (lesson.couple_id ?? null)
		)
		if (!selectedTargetId || currentTarget?.id === selectedTargetId) {
			onOpenChange(false)
			return
		}
		setSaving(true)
		try {
			const res = await fetch(`/api/club/timetables/${timetableId}/lessons/${lesson.id}/participant`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ target_id: selectedTargetId }),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Failed to update lesson")
				return
			}
			toast.success("Lesson updated")
			onUpdated()
			onOpenChange(false)
		} catch {
			toast.error("Failed to update lesson")
		} finally {
			setSaving(false)
		}
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-lg">
				<DialogHeader>
					<div className="flex items-center gap-2 flex-wrap">
						<DialogTitle className="text-xl">{lesson.label}</DialogTitle>
						{isCancelled && (
							<Badge variant="secondary" className="font-normal">Canceled</Badge>
						)}
					</div>
					<DialogDescription>Edit lesson participant and view details.</DialogDescription>
				</DialogHeader>
				<dl className="grid gap-4 text-sm">
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Time</dt>
						<dd className="font-medium text-base">{formatTimeRange(lesson.start_at, lesson.end_at)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Day</dt>
						<dd className="font-medium text-base">{dayLabel}, {dateFormatted}</dd>
					</div>
					{lesson.trainer_name && (
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Trainer</dt>
							<dd className="font-medium text-base">{lesson.trainer_name}</dd>
						</div>
					)}
					{lesson.room_name && (
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Room</dt>
							<dd className="font-medium text-base">{lesson.room_name}</dd>
						</div>
					)}
					<div>
						<dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Type</dt>
						<dd className="font-medium text-base capitalize">{lesson.lesson_type}</dd>
					</div>
				</dl>
				<div className="mt-4 space-y-2">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">Participant</p>
					{lesson.group_id ? (
						// Group lessons are tied to a specific group + lesson type at creation time;
						// they can't be swapped via the individual/couple target dropdown, so we just
						// display the group read-only here.
						<div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium">
							{lesson.label}
						</div>
					) : (
						<Select
							value={selectedTargetId ?? "__none__"}
							onValueChange={(v) => setSelectedTargetId(v === "__none__" ? null : v)}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Choose participant" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__none__">No participant</SelectItem>
								{targets.map((t) => (
									<SelectItem key={t.id} value={t.id}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
				{isConflicted && (
					<div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
						<div className="mb-2 flex items-center gap-2">
							<AlertTriangle className="size-4 text-destructive" />
							<span className="font-medium text-destructive">This lesson has a conflict</span>
						</div>
						<p className="mb-2 text-xs text-muted-foreground">
							The trainer, room, or participant is double-booked at this time. Pick a conflict-free slot below.
						</p>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => setRescheduleOpen(true)}
							className="w-full sm:w-auto"
						>
							Reschedule to a free slot
						</Button>
					</div>
				)}
				<div className="mt-4 flex justify-end gap-2">
					<Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
						{lesson.group_id ? "Close" : "Cancel"}
					</Button>
					{!lesson.group_id && (
						<Button size="sm" onClick={handleSave} disabled={saving}>
							{saving && <Loader2 className="size-4 animate-spin mr-1" />}
							Save
						</Button>
					)}
				</div>
			</DialogContent>
			<RescheduleDialog
				open={rescheduleOpen}
				onOpenChange={setRescheduleOpen}
				lesson={lesson}
				timetableId={timetableId}
				weekStart={weekStart}
				onMoved={() => {
					setRescheduleOpen(false)
					onOpenChange(false)
					onUpdated()
				}}
			/>
		</Dialog>
	)
}

/**
 * Dialog that lets the user pick a conflict-free alternative slot for a lesson.
 *
 * - Fetches candidate slots from /available-slots for the lesson's current
 *   visible week. All returned slots are guaranteed free of trainer / room /
 *   participant overlaps across active timetables and respect buffer,
 *   max-consecutive / min-break and distribution rules.
 * - Offers a scope toggle: move just this lesson, or this + all future
 *   occurrences of the same recurring pattern (same weekday + time + trainer
 *   + participant + lesson_type).
 */
function RescheduleDialog({
	open,
	onOpenChange,
	lesson,
	timetableId,
	weekStart,
	onMoved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	lesson: LessonItem
	timetableId: string
	weekStart?: string
	onMoved: () => void
}) {
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [slots, setSlots] = useState<Array<{ date: string; start_time: string; end_time: string }>>([])
	const [error, setError] = useState<string | null>(null)
	const [scope, setScope] = useState<"single" | "all_future">("single")
	const [selected, setSelected] = useState<{ date: string; start_time: string } | null>(null)

	const effectiveWeekStart = useMemo(() => {
		if (weekStart) return weekStart
		return lesson.start_at.slice(0, 10)
	}, [weekStart, lesson.start_at])

	useEffect(() => {
		if (!open) return
		setSelected(null)
		setError(null)
		setLoading(true)
		fetch(
			`/api/club/timetables/${timetableId}/lessons/${lesson.id}/available-slots?week_start=${encodeURIComponent(effectiveWeekStart)}`,
			{ cache: "no-store" },
		)
			.then(async (res) => {
				const json = await res.json().catch(() => ({}))
				if (!res.ok) {
					setError(json?.error ?? "Failed to load slots")
					setSlots([])
					return
				}
				setSlots(Array.isArray(json?.slots) ? json.slots : [])
			})
			.catch(() => {
				setError("Failed to load slots")
				setSlots([])
			})
			.finally(() => setLoading(false))
	}, [open, timetableId, lesson.id, effectiveWeekStart])

	const byDay = useMemo(() => {
		const map = new Map<string, { date: string; dayLabel: string; slots: Array<{ date: string; start_time: string; end_time: string }> }>()
		for (const s of slots) {
			const existing = map.get(s.date)
			if (existing) {
				existing.slots.push(s)
			} else {
				const day = (() => {
					try {
						return new Date(s.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
					} catch {
						return s.date
					}
				})()
				map.set(s.date, { date: s.date, dayLabel: day, slots: [s] })
			}
		}
		for (const entry of map.values()) {
			entry.slots.sort((a, b) => a.start_time.localeCompare(b.start_time))
		}
		return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
	}, [slots])

	const currentDate = lesson.start_at.slice(0, 10)
	const currentTime = lesson.start_at.slice(11, 16)

	const handleConfirm = async () => {
		if (!selected) return
		setSaving(true)
		try {
			const res = await fetch(`/api/club/timetables/${timetableId}/lessons/${lesson.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ date: selected.date, start_time: selected.start_time, scope }),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				const details = Array.isArray(json.issues) ? json.issues.join("\n") : undefined
				toast.error(json.error ?? "Failed to reschedule lesson", { description: details })
				return
			}
			if (scope === "all_future" && typeof json.future_moved === "number") {
				toast.success(
					`Moved this lesson + ${json.future_moved} future occurrence${json.future_moved === 1 ? "" : "s"}`,
				)
			} else {
				toast.success("Lesson rescheduled")
			}
			onMoved()
		} catch {
			toast.error("Failed to reschedule lesson")
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Reschedule &ldquo;{lesson.label}&rdquo;</DialogTitle>
					<DialogDescription>
						Currently {currentDate} at {currentTime}. Pick any conflict-free slot in this week.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-2 space-y-2">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Apply to</p>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							variant={scope === "single" ? "default" : "outline"}
							onClick={() => setScope("single")}
						>
							This lesson only
						</Button>
						<Button
							type="button"
							size="sm"
							variant={scope === "all_future" ? "default" : "outline"}
							onClick={() => setScope("all_future")}
						>
							This + all future occurrences
						</Button>
					</div>
					{scope === "all_future" && (
						<p className="text-xs text-muted-foreground">
							Every future lesson on the same weekday and time with the same trainer and participant will shift by the same amount.
						</p>
					)}
				</div>

				<div className="mt-4">
					{loading ? (
						<div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
							<Loader2 className="mr-2 size-4 animate-spin" /> Finding free slots…
						</div>
					) : error ? (
						<p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
					) : byDay.length === 0 ? (
						<p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
							No conflict-free slots in this week. Try a different week or widen trainer/participant availability.
						</p>
					) : (
						<ul className="space-y-3">
							{byDay.map(({ date, dayLabel, slots: daySlots }) => (
								<li key={date} className="rounded-md border border-border bg-background/60 p-3">
									<p className="mb-2 text-sm font-medium">{dayLabel}</p>
									<div className="flex flex-wrap gap-1.5">
										{daySlots.map((s) => {
											const isCurrent = s.date === currentDate && s.start_time === currentTime
											const isSelected = selected?.date === s.date && selected?.start_time === s.start_time
											return (
												<button
													key={`${s.date}_${s.start_time}`}
													type="button"
													onClick={() => setSelected({ date: s.date, start_time: s.start_time })}
													disabled={isCurrent}
													className={cn(
														"rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
														"hover:border-primary/60 hover:bg-primary/5",
														"disabled:cursor-not-allowed disabled:opacity-40",
														isSelected
															? "border-primary bg-primary/10 text-primary"
															: "border-border bg-background",
													)}
													title={isCurrent ? "Current time" : `${s.start_time}–${s.end_time}`}
												>
													{s.start_time}
													{isCurrent && " (now)"}
												</button>
											)
										})}
									</div>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className="mt-4 flex justify-end gap-2">
					<Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
						Cancel
					</Button>
					<Button size="sm" onClick={handleConfirm} disabled={!selected || saving}>
						{saving && <Loader2 className="mr-1 size-4 animate-spin" />}
						{selected
							? `Move to ${selected.date.slice(5)} ${selected.start_time}`
							: "Pick a slot"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function LessonGrid({
	lessons,
	weekStart,
	conflictedLessonIds,
	onLessonClick,
	onLessonMove,
}: {
	lessons: LessonItem[]
	weekStart: string
	conflictedLessonIds?: Set<string>
	onLessonClick: (lesson: LessonItem) => void
	onLessonMove: (lessonId: string, date: string, time: string) => void
}) {
	const mondayStr = weekMonday(weekStart)
	const days: { date: string; label: string }[] = []
	const monday = new Date(mondayStr + "T12:00:00")
	for (let i = 0; i < 7; i++) {
		const d = new Date(monday)
		d.setDate(monday.getDate() + i)
		days.push({
			date: d.toISOString().slice(0, 10),
			label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()],
		})
	}
	const bySlot = new Map<string, LessonItem[]>()
	for (const l of lessons) {
		const date = l.start_at.slice(0, 10)
		const time = l.start_at.slice(11, 16)
		const key = `${date}_${time}`
		if (!bySlot.has(key)) bySlot.set(key, [])
		bySlot.get(key)!.push(l)
	}
	const timeSlots = [...new Set(lessons.map((l) => l.start_at.slice(11, 16)))].sort()
	const trainerOrder = useMemo(() => [...new Set(lessons.map((l) => l.trainer_id).filter(Boolean) as string[])], [lessons])
	const trainerNames = useMemo(() => {
		const names = new Map<string, string>()
		for (const l of lessons) {
			if (l.trainer_id && l.trainer_name) names.set(l.trainer_id, l.trainer_name)
		}
		return trainerOrder.map((id) => names.get(id) ?? "Trainer")
	}, [lessons, trainerOrder])

	const byDay = (() => {
		const map = new Map<string, LessonItem[]>()
		for (const l of lessons) {
			const d = l.start_at.slice(0, 10)
			if (!map.has(d)) map.set(d, [])
			map.get(d)!.push(l)
		}
		for (const arr of map.values()) arr.sort((a, b) => a.start_at.localeCompare(b.start_at))
		return days.filter((d) => map.has(d.date)).map((d) => ({ ...d, lessons: map.get(d.date)! }))
	})()

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: { delay: 150, tolerance: 5 },
		}),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 8 },
		})
	)

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over) return
		const lessonId = String(active.id)
		const slotKey = String(over.id)
		const [date, time] = slotKey.split("_")
		if (!date || !time) return
		onLessonMove(lessonId, date, time)
	}

	return (
		<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
			<div className="space-y-3">
				{trainerOrder.length > 0 && (
					<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
						<span className="font-medium">Trainers:</span>
						{trainerOrder.map((id, i) => (
							<span key={id} className="flex items-center gap-1.5">
								<span className={cn("inline-block h-3 w-3 rounded-sm", TRAINER_SWATCH[i % TRAINER_SWATCH.length])} />
								<span>{trainerNames[i]}</span>
							</span>
						))}
					</div>
				)}
				{/* Mobile: list by day — tap row for details */}
				<div className="md:hidden space-y-4">
					{byDay.map(({ date, label, lessons: dayLessons }) => (
						<section key={date}>
							<h3 className="text-sm font-medium text-muted-foreground sticky top-0 bg-background/95 py-1 -mx-1 px-1">
								{label} {date.slice(8)}
							</h3>
							<ul className="space-y-1 mt-1">
								{dayLessons.map((l) => (
									<DraggableLesson
										key={l.id}
										lesson={l}
										trainerOrder={trainerOrder}
										isConflicted={conflictedLessonIds?.has(l.id) ?? false}
										onLessonClick={onLessonClick}
										variant="list"
									/>
								))}
							</ul>
						</section>
					))}
				</div>
				{/* Desktop: table with minimal cards (label only), tap for details */}
				<div className="hidden md:block overflow-x-auto">
					<table className="w-full min-w-[600px] border-collapse text-sm">
						<thead>
							<tr>
								<th className="border-b border-border bg-muted/30 px-2 py-2 text-left font-medium">Time</th>
								{days.map((d) => (
									<th key={d.date} className="border-b border-border bg-muted/30 px-2 py-2 text-left font-medium">
										{d.label} {d.date.slice(8)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{timeSlots.map((time) => (
								<tr key={time}>
									<td className="border-b border-border/70 px-2 py-1.5 font-medium text-muted-foreground">{time}</td>
									{days.map((d) => {
										const key = `${d.date}_${time}`
										const cellLessons = bySlot.get(key) ?? []
										return (
											<SlotCell key={d.date} id={key} className="border-b border-border/70 px-2 py-1.5 align-top">
												{cellLessons.length === 0 ? (
													<span className="text-muted-foreground">—</span>
												) : (
													<ul className="space-y-1">
														{cellLessons.map((l) => (
															<DraggableLesson
																key={l.id}
																lesson={l}
																trainerOrder={trainerOrder}
																isConflicted={conflictedLessonIds?.has(l.id) ?? false}
																onLessonClick={onLessonClick}
																variant="grid"
															/>
														))}
													</ul>
												)}
											</SlotCell>
										)
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</DndContext>
	)
}

function SlotCell({
	id,
	className,
	children,
}: {
	id: string
	className?: string
	children: React.ReactNode
}) {
	const { setNodeRef, isOver } = useDroppable({ id })
	return (
		<td
			ref={setNodeRef}
			className={cn(className, isOver && "bg-muted/40")}
		>
			{children}
		</td>
	)
}

function DraggableLesson({
	lesson,
	trainerOrder,
	isConflicted = false,
	onLessonClick,
	variant,
}: {
	lesson: LessonItem
	trainerOrder: string[]
	isConflicted?: boolean
	onLessonClick: (lesson: LessonItem) => void
	variant: "list" | "grid"
}) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
		id: lesson.id,
		data: { lessonId: lesson.id },
	})
	const style = transform ? { transform: CSS.Transform.toString(transform) } : undefined
	const isCancelled = !!lesson.cancelled_at

	if (variant === "list") {
		return (
			<li
				ref={setNodeRef}
				style={style}
				{...listeners}
				{...attributes}
				role="button"
				tabIndex={0}
				onClick={() => onLessonClick(lesson)}
				onKeyDown={(e) => e.key === "Enter" && onLessonClick(lesson)}
				className={cn(
					"flex items-center gap-2 rounded-lg py-3 px-3 min-h-[44px] cursor-pointer active:opacity-90 border-l-4",
					TRAINER_COLORS[getTrainerColorIndex(lesson.trainer_id, trainerOrder)],
					isCancelled && "opacity-70",
					isDragging && "z-10 opacity-80",
					isConflicted && "ring-2 ring-destructive/60 ring-offset-1 ring-offset-background"
				)}
				title={isConflicted ? "Conflict \u2014 tap to reschedule" : undefined}
			>
				<span className="text-muted-foreground text-sm shrink-0 w-14">
					{formatTimeRange(lesson.start_at, lesson.end_at)}
				</span>
				<span className="font-medium min-w-0 wrap-break-word">{lesson.label}</span>
				{isConflicted && (
					<Badge variant="destructive" className="shrink-0 text-[10px] ml-auto">
						Conflict
					</Badge>
				)}
				{isCancelled && (
					<span className="shrink-0 text-xs text-muted-foreground font-normal">Canceled</span>
				)}
			</li>
		)
	}

	return (
		<li
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
			role="button"
			tabIndex={0}
			onClick={() => onLessonClick(lesson)}
			onKeyDown={(e) => e.key === "Enter" && onLessonClick(lesson)}
			className={cn(
				"relative cursor-pointer rounded px-2 py-1 text-xs font-medium wrap-break-word max-w-[120px] transition-opacity hover:opacity-90 border-l-2",
				TRAINER_COLORS[getTrainerColorIndex(lesson.trainer_id, trainerOrder)],
				isCancelled && "opacity-70",
				isDragging && "z-10 opacity-80",
				isConflicted && "ring-2 ring-destructive/60"
			)}
			title={isConflicted ? "Conflict \u2014 tap to reschedule" : isCancelled ? "Canceled" : "Tap for details"}
		>
			{isConflicted && (
				<span
					aria-hidden
					className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"
				/>
			)}
			{lesson.label}
			{isCancelled && " (Canceled)"}
		</li>
	)
}
