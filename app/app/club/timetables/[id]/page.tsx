"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronLeft, Calendar, Loader2, UsersRound, GraduationCap, Clock, Sparkles, CalendarDays, Settings, User, BookOpen, Power, PowerOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

type LessonItem = {
	id: string
	lesson_type: string
	start_at: string
	end_at: string
	room_name: string | null
	trainer_id: string | null
	trainer_name: string | null
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

const PRIORITY_COLOR: Record<string, string> = {
	high: "bg-green-500/20 text-green-700 dark:text-green-300",
	medium: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
	low: "bg-muted text-muted-foreground",
}

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
	const [distribution, setDistribution] = useState<string>("same")
	const [selectedLesson, setSelectedLesson] = useState<LessonItem | null>(null)
	const [settingsOpen, setSettingsOpen] = useState(false)
	// UI-only filters (do not edit timetable)
	const [filterLabels, setFilterLabels] = useState<Set<string>>(new Set())
	const [filterTrainerIds, setFilterTrainerIds] = useState<Set<string>>(new Set())
	const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set())
	type ShortfallItem = { target_id?: string; group_id?: string; group_lesson_type_id?: string; desired_lessons_count: number; actual_count: number }
	const [shortfalls, setShortfalls] = useState<ShortfallItem[]>([])
	const [togglingActive, setTogglingActive] = useState(false)

	useEffect(() => {
		params.then((p) => setId(p.id))
	}, [params])

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

	useEffect(() => {
		if (!id) return
		loadLessons()
	}, [id, weekStart, loadLessons])

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
			const body: { week_start: string; distribution: string; group_targets?: Array<{ group_id: string; group_lesson_type_id: string; desired_lessons_count: number; priority?: string; preferred_trainer_id?: string | null }> } = {
				week_start: weekStart,
				distribution,
			}
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

	const { timetable, preferences, targets, trainer_limits } = data

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
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground break-words min-w-0">
							<Calendar className="size-5 shrink-0" />
							{timetable.name}
						</h1>
						<p className="text-muted-foreground text-xs sm:text-sm break-words min-w-0">
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

				<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<label htmlFor="week-start" className="text-sm font-medium text-muted-foreground">
						{data?.timetable?.recurrence === "weekends_only" ? "Weekend (pick any day)" : "Week"}
					</label>
					<input
						id="week-start"
						type="date"
						value={weekStart}
						onChange={(e) => {
							setWeekStart(e.target.value)
							setShortfalls([])
						}}
						className="rounded-md border border-input bg-background px-3 py-2 text-sm"
					/>
				</div>
				{loadingLessons ? (
					<LessonsLoadingSkeleton />
				) : lessons.length === 0 ? (
					<p className="text-muted-foreground text-sm py-8 text-center">
						No lessons this week. Open <button type="button" onClick={() => setSettingsOpen(true)} className="underline font-medium">Settings</button> to configure and generate.
					</p>
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
							onLessonClick={setSelectedLesson}
						/>
						)}
					</>
				)}
			</div>

			{lessons.length > 0 && (
				<>
					{hasActiveFilters && (
						<p className="text-sm text-muted-foreground -mt-2">
							Statistics below reflect filtered lessons ({filteredLessons.length} of {lessons.length}).
						</p>
					)}
					{shortfalls.length > 0 && (
						<Card className="mt-6 border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/5">
							<CardHeader className="pb-2">
								<CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
									<Clock className="size-4" />
									Fewer lessons than requested
								</CardTitle>
								<CardDescription>
									The following could not receive all requested lessons (no more available time in their schedule or the trainer’s):
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="space-y-1.5 text-sm">
									{shortfalls.map((s, i) => {
										const label = s.target_id
											? data?.targets?.find((t) => t.id === s.target_id)?.label
											: data?.group_targets?.find(
												(gt) => gt.group_id === s.group_id && gt.group_lesson_type_id === s.group_lesson_type_id
											)?.label
										const name = label ?? (s.group_id ? "Group" : "Participant")
										return (
											<li key={i} className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-2 py-1.5">
												<span className="font-medium">{name}</span>
												<span className="text-muted-foreground">
													{s.actual_count} of {s.desired_lessons_count} lessons scheduled
												</span>
											</li>
										)
									})}
								</ul>
							</CardContent>
						</Card>
					)}
					<TimetableStats lessons={filteredLessons} />
				</>
			)}

			<LessonDetailDialog lesson={selectedLesson} open={!!selectedLesson} onOpenChange={(open) => !open && setSelectedLesson(null)} />
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				timetableId={id}
				data={data}
				weekStart={weekStart}
				distribution={distribution}
				setWeekStart={setWeekStart}
				setDistribution={setDistribution}
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
	distribution,
	setWeekStart,
	setDistribution,
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
	distribution: string
	setWeekStart: (s: string) => void
	setDistribution: (s: string) => void
		onSaved: () => void | Promise<void>
	onGenerated: () => void
	onGenerate: (opts?: { group_targets?: Array<{ group_id: string; group_lesson_type_id: string; desired_lessons_count: number; priority?: string; preferred_trainer_id?: string | null }> }) => Promise<void>
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
		setDistribution(distribution)
		// Pass current group targets (saved + new) so generate uses them even if not yet persisted
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
		await onGenerate(combinedGroupTargets.length ? { group_targets: combinedGroupTargets } : undefined)
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
						<div className="flex flex-wrap items-end gap-3">
							<div>
								<label className="text-xs text-muted-foreground block mb-0.5">Week (Monday)</label>
								<input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
							</div>
							<div>
								<label className="text-xs text-muted-foreground block mb-0.5">Distribution</label>
								<Select value={distribution} onValueChange={setDistribution}>
									<SelectTrigger className="h-9 w-[140px] rounded-md border border-input bg-background text-sm text-foreground">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="same">Spread</SelectItem>
										<SelectItem value="first_half">Mon–Wed</SelectItem>
										<SelectItem value="second_half">Thu–Sun</SelectItem>
									</SelectContent>
								</Select>
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

function LessonDetailDialog({
	lesson,
	open,
	onOpenChange,
}: {
	lesson: LessonItem | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	if (!lesson) return null
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
					<DialogDescription>Lesson details</DialogDescription>
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
				<p className="text-muted-foreground text-xs mt-2">Tap outside to close</p>
			</DialogContent>
		</Dialog>
	)
}

function LessonGrid({
	lessons,
	weekStart,
	onLessonClick,
}: {
	lessons: LessonItem[]
	weekStart: string
	onLessonClick: (lesson: LessonItem) => void
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
	const byDay = useMemo(() => {
		const map = new Map<string, LessonItem[]>()
		for (const l of lessons) {
			const d = l.start_at.slice(0, 10)
			if (!map.has(d)) map.set(d, [])
			map.get(d)!.push(l)
		}
		for (const arr of map.values()) arr.sort((a, b) => a.start_at.localeCompare(b.start_at))
		return days.filter((d) => map.has(d.date)).map((d) => ({ ...d, lessons: map.get(d.date)! }))
	}, [lessons, weekStart])

	return (
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
							{dayLessons.map((l) => {
								const isCancelled = !!l.cancelled_at
								return (
									<li
										key={l.id}
										role="button"
										tabIndex={0}
										onClick={() => onLessonClick(l)}
										onKeyDown={(e) => e.key === "Enter" && onLessonClick(l)}
										className={cn(
											"flex items-center gap-2 rounded-lg py-3 px-3 min-h-[44px] cursor-pointer active:opacity-90 border-l-4",
											TRAINER_COLORS[getTrainerColorIndex(l.trainer_id, trainerOrder)],
											isCancelled && "opacity-70"
										)}
									>
										<span className="text-muted-foreground text-sm shrink-0 w-14">{formatTimeRange(l.start_at, l.end_at)}</span>
										<span className="font-medium min-w-0 break-words">{l.label}</span>
										{isCancelled && (
											<span className="shrink-0 text-xs text-muted-foreground font-normal">Canceled</span>
										)}
									</li>
								)
							})}
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
										<td key={d.date} className="border-b border-border/70 px-2 py-1.5 align-top">
											{cellLessons.length === 0 ? (
												<span className="text-muted-foreground">—</span>
											) : (
												<ul className="space-y-1">
													{cellLessons.map((l) => {
														const isCancelled = !!l.cancelled_at
														return (
															<li
																key={l.id}
																role="button"
																tabIndex={0}
																onClick={() => onLessonClick(l)}
																onKeyDown={(e) => e.key === "Enter" && onLessonClick(l)}
																className={cn(
																	"cursor-pointer rounded px-2 py-1 text-xs font-medium break-words max-w-[120px] transition-opacity hover:opacity-90 border-l-2",
																	TRAINER_COLORS[getTrainerColorIndex(l.trainer_id, trainerOrder)],
																	isCancelled && "opacity-70"
																)}
																title={isCancelled ? "Canceled" : "Tap for details"}
															>
																{l.label}
																{isCancelled && " (Canceled)"}
															</li>
														)
													})}
												</ul>
											)}
										</td>
									)
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}
