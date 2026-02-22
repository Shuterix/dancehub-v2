"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronLeft, Calendar, Loader2, UsersRound, GraduationCap, Clock, Sparkles, CalendarDays, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
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
			<div className="space-y-6">
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
						<h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground truncate">
							<Calendar className="size-5 shrink-0" />
							{timetable.name}
						</h1>
						<p className="text-muted-foreground text-xs sm:text-sm truncate">
							{RECURRENCE_LABELS[timetable.recurrence] ?? timetable.recurrence} · {formatDate(timetable.valid_from)}
						</p>
					</div>
				</div>
				<Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="shrink-0">
					<Settings className="size-4 sm:mr-1" />
					<span className="hidden sm:inline">Settings</span>
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<label htmlFor="week-start" className="text-sm font-medium text-muted-foreground">Week</label>
					<input
						id="week-start"
						type="date"
						value={weekStart}
						onChange={(e) => setWeekStart(e.target.value)}
						className="rounded-md border border-input bg-background px-3 py-2 text-sm"
					/>
				</div>
				{loadingLessons ? (
					<p className="flex items-center gap-2 text-sm text-muted-foreground py-8">
						<Loader2 className="size-4 animate-spin" /> Loading…
					</p>
				) : lessons.length === 0 ? (
					<p className="text-muted-foreground text-sm py-8 text-center">
						No lessons this week. Open <button type="button" onClick={() => setSettingsOpen(true)} className="underline font-medium">Settings</button> to configure and generate.
					</p>
				) : (
					<LessonGrid
						lessons={lessons}
						weekStart={weekStart}
						onLessonClick={setSelectedLesson}
					/>
				)}
			</div>

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
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-2rem)] max-w-lg">
				<DialogHeader>
					<DialogTitle className="text-xl">{lesson.label}</DialogTitle>
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
							{dayLessons.map((l) => (
								<li
									key={l.id}
									role="button"
									tabIndex={0}
									onClick={() => onLessonClick(l)}
									onKeyDown={(e) => e.key === "Enter" && onLessonClick(l)}
									className={cn(
										"flex items-center gap-2 rounded-lg py-3 px-3 min-h-[44px] cursor-pointer active:opacity-90 border-l-4",
										TRAINER_COLORS[getTrainerColorIndex(l.trainer_id, trainerOrder)]
									)}
								>
									<span className="text-muted-foreground text-sm shrink-0 w-14">{formatTimeRange(l.start_at, l.end_at)}</span>
									<span className="font-medium truncate">{l.label}</span>
								</li>
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
										<td key={d.date} className="border-b border-border/70 px-2 py-1.5 align-top">
											{cellLessons.length === 0 ? (
												<span className="text-muted-foreground">—</span>
											) : (
												<ul className="space-y-1">
													{cellLessons.map((l) => (
														<li
															key={l.id}
															role="button"
															tabIndex={0}
															onClick={() => onLessonClick(l)}
															onKeyDown={(e) => e.key === "Enter" && onLessonClick(l)}
															className={cn(
																"cursor-pointer rounded px-2 py-1 text-xs font-medium truncate max-w-[120px] transition-opacity hover:opacity-90 border-l-2",
																TRAINER_COLORS[getTrainerColorIndex(l.trainer_id, trainerOrder)]
															)}
															title="Tap for details"
														>
															{l.label}
														</li>
													))}
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
