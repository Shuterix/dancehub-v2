"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Loader2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

const RECURRENCE_OPTIONS = [
	{ value: "weekly", label: "Weekly" },
	{ value: "bi_weekly", label: "Bi-weekly" },
	{ value: "monthly", label: "Monthly (same weekday each month)" },
	{ value: "weekends_only", label: "Weekends only" },
	{ value: "fixed_period", label: "Fixed period" },
]

const PRIORITY_OPTIONS = [
	{ value: "high", label: "High" },
	{ value: "medium", label: "Medium" },
	{ value: "low", label: "Low" },
]

type Student = { user_id: string; full_name: string }
type Couple = { id: string; name: string | null; partner1_name: string | null; partner2_name: string | null }
type Trainer = { user_id: string; full_name: string }

type ClubData = {
	club: { id: string; name: string }
	isTrainer: boolean
	allStudents: Student[]
	couples: Couple[]
	allTrainers: Trainer[]
}

export default function NewTimetablePage() {
	const router = useRouter()
	const [step, setStep] = useState(1)
	const [clubData, setClubData] = useState<ClubData | null>(null)
	const [timetableId, setTimetableId] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Step 1
	const [name, setName] = useState("")
	const [recurrence, setRecurrence] = useState("weekly")
	const [validFrom, setValidFrom] = useState("")
	const [validUntil, setValidUntil] = useState("")
	const [dayStart, setDayStart] = useState("08:00")
	const [dayEnd, setDayEnd] = useState("22:00")

	// Step 2: targets (student_id or couple_id, desired_lessons_count, priority, preferred_trainer_id)
	const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
	const [selectedCouples, setSelectedCouples] = useState<Set<string>>(new Set())
	const [targetLessons, setTargetLessons] = useState<Record<string, number>>({})
	const [targetPriority, setTargetPriority] = useState<Record<string, string>>({})
	const [targetPreferredTrainer, setTargetPreferredTrainer] = useState<Record<string, string>>({})

	// Step 3: trainer limits
	const [selectedTrainers, setSelectedTrainers] = useState<Set<string>>(new Set())
	const [trainerMaxLessons, setTrainerMaxLessons] = useState<Record<string, number>>({})

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

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		loadClub().finally(() => {
			if (!cancelled) setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [loadClub])

	async function handleStep1Next() {
		const n = name.trim()
		if (!n) {
			toast.error("Timetable name is required")
			return
		}
		if (!validFrom) {
			toast.error("Valid from date is required")
			return
		}
		setSaving(true)
		try {
			const res = await fetch("/api/club/timetables", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: n,
					recurrence,
					valid_from: validFrom,
					valid_until: validUntil.trim() || null,
					day_start: dayStart,
					day_end: dayEnd,
				}),
			})
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				throw new Error(json.error ?? "Failed to create timetable")
			}
			const json = await res.json()
			setTimetableId(json.id)
			setStep(2)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setSaving(false)
		}
	}

	function buildTargetsPayload() {
		const targets: Array<{ student_id?: string; couple_id?: string; desired_lessons_count: number; priority: string; preferred_trainer_id?: string | null }> = []
		for (const uid of selectedStudents) {
			const tid = targetPreferredTrainer[uid]
			targets.push({
				student_id: uid,
				desired_lessons_count: targetLessons[uid] ?? 0,
				priority: targetPriority[uid] ?? "medium",
				preferred_trainer_id: tid && tid.trim() && tid !== "__any__" ? tid : null,
			})
		}
		for (const cid of selectedCouples) {
			const tid = targetPreferredTrainer[cid]
			targets.push({
				couple_id: cid,
				desired_lessons_count: targetLessons[cid] ?? 0,
				priority: targetPriority[cid] ?? "medium",
				preferred_trainer_id: tid && tid.trim() && tid !== "__any__" ? tid : null,
			})
		}
		return targets
	}

	async function handleStep2Next() {
		if (!timetableId) return
		setSaving(true)
		try {
			const res = await fetch(`/api/club/timetables/${timetableId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targets: buildTargetsPayload() }),
			})
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				throw new Error(json.error ?? "Failed to save")
			}
			setStep(3)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setSaving(false)
		}
	}

	async function handleStep2Finish() {
		if (!timetableId) return
		setSaving(true)
		try {
			const res = await fetch(`/api/club/timetables/${timetableId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ targets: buildTargetsPayload() }),
			})
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				throw new Error(json.error ?? "Failed to save")
			}
			toast.success("Timetable created")
			router.push(`/app/club/timetables/${timetableId}`)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setSaving(false)
		}
	}

	async function handleFinish() {
		if (!timetableId) return
		setSaving(true)
		try {
			const trainer_limits = Array.from(selectedTrainers).map((uid) => ({
				user_id: uid,
				max_lessons_per_day: trainerMaxLessons[uid] ?? 8,
			}))
			const res = await fetch(`/api/club/timetables/${timetableId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ trainer_limits }),
			})
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				throw new Error(json.error ?? "Failed to save")
			}
			toast.success("Timetable created")
			router.push(`/app/club/timetables/${timetableId}`)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setSaving(false)
		}
	}

	function coupleLabel(c: Couple) {
		const name = c.name?.trim()
		const partners = [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")
		return name || partners || "Unnamed couple"
	}

	if (error) {
		return (
			<div className="space-y-6">
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" asChild>
						<Link href="/app/club/timetables" aria-label="Back">
							<ChevronLeft className="size-4" />
						</Link>
					</Button>
					<div>
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">Create timetable</h1>
						<p className="text-destructive text-sm">{error}</p>
					</div>
				</div>
			</div>
		)
	}

	const allStudents = clubData?.allStudents ?? []
	const couples = clubData?.couples ?? []
	const allTrainers = clubData?.allTrainers ?? []

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club/timetables" aria-label="Back">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
						<Calendar className="size-6" />
						Create timetable
					</h1>
					<p className="text-muted-foreground text-sm">
						Step {step} of 3: {step === 1 ? "Basics" : step === 2 ? "Students & couples" : "Trainers"}
					</p>
				</div>
			</div>

			{/* Step indicator */}
			<div className="flex gap-2">
				{[1, 2, 3].map((s) => (
					<button
						key={s}
						type="button"
						onClick={() => s < step && setStep(s)}
						className={cn(
							"h-2 flex-1 rounded-full transition-colors",
							s <= step ? "bg-primary" : "bg-muted",
							s < step && "cursor-pointer hover:bg-primary/80"
						)}
						aria-label={`Step ${s}`}
					/>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>
						{step === 1 && "Basics"}
						{step === 2 && "Students & couples"}
						{step === 3 && "Trainers"}
					</CardTitle>
					<CardDescription>
						{step === 1 && "Name, recurrence, and date range. Day start/end define the time window for lessons."}
						{step === 2 && "Select students and couples, set desired lessons and priority. Optionally choose which trainer they train with."}
						{step === 3 && "Select trainers and set max lessons per day for each. This is the last step."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{step === 1 && (
						<>
							<div className="space-y-2">
								<Label htmlFor="name">Timetable name</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="e.g. Spring 2025"
									className="cursor-pointer"
								/>
							</div>
							<div className="space-y-2">
								<Label>Recurrence</Label>
								<Select value={recurrence} onValueChange={setRecurrence}>
									<SelectTrigger className="cursor-pointer">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{RECURRENCE_OPTIONS.map((o) => (
											<SelectItem key={o.value} value={o.value} className="cursor-pointer">
												{o.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="valid_from">Valid from</Label>
									<Input
										id="valid_from"
										type="date"
										value={validFrom}
										onChange={(e) => setValidFrom(e.target.value)}
										className="cursor-pointer pr-8"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="valid_until">Valid until (optional)</Label>
									<Input
										id="valid_until"
										type="date"
										value={validUntil}
										onChange={(e) => setValidUntil(e.target.value)}
										className="cursor-pointer pr-8"
									/>
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor="day_start">Day start</Label>
									<Input
										id="day_start"
										type="time"
										value={dayStart}
										onChange={(e) => setDayStart(e.target.value)}
										className="cursor-pointer pr-8"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="day_end">Day end</Label>
									<Input
										id="day_end"
										type="time"
										value={dayEnd}
										onChange={(e) => setDayEnd(e.target.value)}
										className="cursor-pointer pr-8"
									/>
								</div>
							</div>
							<div className="flex justify-end">
								<Button onClick={handleStep1Next} disabled={saving}>
									{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
									Next
									<ChevronRight className="ml-2 size-4" />
								</Button>
							</div>
						</>
					)}

					{step === 2 && (
						<>
							{loading && !clubData ? (
								<div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
									<Loader2 className="mr-2 size-4 animate-spin" />
									Loading students and trainers…
								</div>
							) : (
								<>
									<div className="space-y-2">
										<Label>Students</Label>
								<div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
									{allStudents.length === 0 ? (
										<p className="text-muted-foreground text-sm">No students in club.</p>
									) : (
										allStudents.map((s) => (
											<label
												key={s.user_id}
												className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
											>
												<Checkbox
													checked={selectedStudents.has(s.user_id)}
													onCheckedChange={(checked) => {
														setSelectedStudents((prev) => {
															const next = new Set(prev)
															if (checked) next.add(s.user_id)
															else next.delete(s.user_id)
															return next
														})
													}}
												/>
												<span className="flex-1 text-sm">{s.full_name}</span>
												{selectedStudents.has(s.user_id) && (
													<>
														<Input
															type="number"
															min={0}
															className="w-20 cursor-pointer"
															value={targetLessons[s.user_id] ?? 0}
															onChange={(e) =>
																setTargetLessons((prev) => ({
																	...prev,
																	[s.user_id]: Math.max(0, parseInt(e.target.value, 10) || 0),
																}))
															}
														/>
														<Select
															value={targetPriority[s.user_id] ?? "medium"}
															onValueChange={(v) =>
																setTargetPriority((prev) => ({ ...prev, [s.user_id]: v }))
															}
														>
															<SelectTrigger className="w-28 cursor-pointer">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{PRIORITY_OPTIONS.map((o) => (
																	<SelectItem key={o.value} value={o.value} className="cursor-pointer">
																		{o.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<Select
															value={targetPreferredTrainer[s.user_id] ?? "__any__"}
															onValueChange={(v) =>
																setTargetPreferredTrainer((prev) => ({ ...prev, [s.user_id]: v }))
															}
														>
															<SelectTrigger className="min-w-[120px] cursor-pointer">
																<SelectValue placeholder="Train with" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="__any__" className="cursor-pointer">
																	Any trainer
																</SelectItem>
																{allTrainers.map((t) => (
																	<SelectItem key={t.user_id} value={t.user_id} className="cursor-pointer">
																		{t.full_name}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</>
												)}
											</label>
										))
									)}
								</div>
							</div>
							<div className="space-y-2">
								<Label>Couples</Label>
								<div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
									{couples.length === 0 ? (
										<p className="text-muted-foreground text-sm">No couples in club.</p>
									) : (
										couples.map((c) => (
											<label
												key={c.id}
												className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
											>
												<Checkbox
													checked={selectedCouples.has(c.id)}
													onCheckedChange={(checked) => {
														setSelectedCouples((prev) => {
															const next = new Set(prev)
															if (checked) next.add(c.id)
															else next.delete(c.id)
															return next
														})
													}}
												/>
												<span className="flex-1 text-sm">{coupleLabel(c)}</span>
												{selectedCouples.has(c.id) && (
													<>
														<Input
															type="number"
															min={0}
															className="w-20 cursor-pointer"
															value={targetLessons[c.id] ?? 0}
															onChange={(e) =>
																setTargetLessons((prev) => ({
																	...prev,
																	[c.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
																}))
															}
														/>
														<Select
															value={targetPriority[c.id] ?? "medium"}
															onValueChange={(v) =>
																setTargetPriority((prev) => ({ ...prev, [c.id]: v }))
															}
														>
															<SelectTrigger className="w-28 cursor-pointer">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{PRIORITY_OPTIONS.map((o) => (
																	<SelectItem key={o.value} value={o.value} className="cursor-pointer">
																		{o.label}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
														<Select
															value={targetPreferredTrainer[c.id] ?? "__any__"}
															onValueChange={(v) =>
																setTargetPreferredTrainer((prev) => ({ ...prev, [c.id]: v }))
															}
														>
															<SelectTrigger className="min-w-[120px] cursor-pointer">
																<SelectValue placeholder="Train with" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="__any__" className="cursor-pointer">
																	Any trainer
																</SelectItem>
																{allTrainers.map((t) => (
																	<SelectItem key={t.user_id} value={t.user_id} className="cursor-pointer">
																		{t.full_name}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</>
												)}
											</label>
										))
									)}
								</div>
							</div>
							<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
								<Button variant="outline" onClick={() => setStep(1)} className="w-full sm:w-auto">
									<ChevronLeft className="mr-2 size-4" />
									Back
								</Button>
								<div className="flex flex-col gap-2 sm:flex-row sm:gap-2 w-full sm:w-auto">
									<Button variant="secondary" onClick={handleStep2Finish} disabled={saving} className="w-full sm:w-auto">
										{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
										Finish (skip trainer limits)
									</Button>
									<Button onClick={handleStep2Next} disabled={saving} className="w-full sm:w-auto">
										{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
										Next: Set trainer limits
										<ChevronRight className="ml-2 size-4" />
									</Button>
								</div>
							</div>
						</>
							)}
						</>
					)}

					{step === 3 && (
						<>
							<div className="space-y-2">
								<Label>Trainers (max lessons per day)</Label>
								<div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
									{allTrainers.length === 0 ? (
										<p className="text-muted-foreground text-sm">No trainers in club.</p>
									) : (
										allTrainers.map((t) => (
											<label
												key={t.user_id}
												className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
											>
												<Checkbox
													checked={selectedTrainers.has(t.user_id)}
													onCheckedChange={(checked) => {
														setSelectedTrainers((prev) => {
															const next = new Set(prev)
															if (checked) next.add(t.user_id)
															else next.delete(t.user_id)
															return next
														})
													}}
												/>
												<span className="flex-1 text-sm">{t.full_name}</span>
												{selectedTrainers.has(t.user_id) && (
													<Input
														type="number"
														min={1}
														className="w-24 cursor-pointer"
														value={trainerMaxLessons[t.user_id] ?? 8}
														onChange={(e) =>
															setTrainerMaxLessons((prev) => ({
																...prev,
																[t.user_id]: Math.max(1, parseInt(e.target.value, 10) || 1),
															}))
														}
													/>
												)}
											</label>
										))
									)}
								</div>
							</div>
							<div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
								<Button variant="outline" onClick={() => setStep(2)} className="w-full sm:w-auto">
									<ChevronLeft className="mr-2 size-4" />
									Back
								</Button>
								<Button onClick={handleFinish} disabled={saving} className="w-full sm:w-auto">
									{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
									Finish
								</Button>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
