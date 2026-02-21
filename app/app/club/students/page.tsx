"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Users, Loader2, ChevronLeft, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const STUDENTS_GRID = "grid grid-cols-[1fr_7rem_7rem_7rem_1fr] gap-3 items-center"

const RANKS = ["E", "D", "C", "B", "A", "S"] as const
type Rank = (typeof RANKS)[number]

const RANK_OPTIONS: { value: string; label: string }[] = [
	{ value: "__none__", label: "–" },
	...RANKS.map((r) => ({ value: r, label: r })),
]

const RANK_STYLES: Record<Rank, string> = {
	E: "bg-red-500/30 text-red-700 dark:text-red-300 border-red-500/50",
	D: "bg-orange-500/30 text-orange-700 dark:text-orange-300 border-orange-500/50",
	C: "bg-amber-500/30 text-amber-800 dark:text-amber-300 border-amber-500/50",
	B: "bg-lime-500/30 text-lime-800 dark:text-lime-300 border-lime-500/50",
	A: "bg-emerald-500/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/50",
	S: "bg-violet-500/30 text-violet-800 dark:text-violet-300 border-violet-500/50",
}

function RankBadge({ rank }: { rank: Rank }) {
	return (
		<span
			className={cn(
				"inline-flex size-9 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums",
				RANK_STYLES[rank]
			)}
		>
			{rank}
		</span>
	)
}

function RankSelect({
	value,
	onChange,
	disabled,
	className,
	"aria-label": ariaLabel,
}: {
	value: string | null
	onChange: (value: string | null) => void
	disabled?: boolean
	className?: string
	"aria-label"?: string
}) {
	const displayValue = value ?? "__none__"
	return (
		<Select
			value={displayValue}
			onValueChange={(v) => onChange(v === "__none__" ? null : v)}
			disabled={disabled}
		>
			<SelectTrigger
				aria-label={ariaLabel}
				className={cn(
					"h-9 w-full min-w-[4.5rem] border-border bg-muted/50 font-semibold",
					value && RANK_STYLES[value as Rank],
					className
				)}
			>
				<SelectValue placeholder="–" />
			</SelectTrigger>
			<SelectContent>
				{RANK_OPTIONS.map((opt) => (
					<SelectItem key={opt.value} value={opt.value}>
						{opt.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

type Student = {
	user_id: string
	full_name: string
	rank_standard: string | null
	rank_latin: string | null
	age: number | null
	partner_name: string | null
}

type ClubData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
	allStudents: Student[]
}

export default function ClubStudentsPage() {
	const router = useRouter()
	const [data, setData] = useState<ClubData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [detailStudent, setDetailStudent] = useState<Student | null>(null)
	const [savingUserId, setSavingUserId] = useState<string | null>(null)

	const loadData = useCallback(() => {
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
				if (json) {
					setData(json)
					if (detailStudent && json.allStudents) {
						const updated = json.allStudents.find((s: Student) => s.user_id === detailStudent.user_id)
						if (updated) setDetailStudent(updated)
					}
				}
			})
			.catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
	}, [router, detailStudent?.user_id])

	useEffect(() => {
		let cancelled = false
		setLoading(true)
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
				if (!cancelled && json) setData(json)
			})
			.catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong") })
			.finally(() => { if (!cancelled) setLoading(false) })
		return () => { cancelled = true }
	}, [router])

	async function updateRank(
		userId: string,
		updates: { rank_standard?: string | null; rank_latin?: string | null }
	) {
		setSavingUserId(userId)
		try {
			const res = await fetch("/api/club/member-rank", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ user_id: userId, ...updates }),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Failed to update rank")
				return
			}
			toast.success("Rank updated")
			loadData()
		} finally {
			setSavingUserId(null)
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
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">Students</h1>
						<p className="text-muted-foreground text-sm">Loading…</p>
					</div>
				</div>
			</div>
		)
	}

	if (error || !data) {
		return (
			<div className="space-y-6">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Students</h1>
					<p className="text-muted-foreground text-sm">{error ?? "Unable to load."}</p>
				</div>
			</div>
		)
	}

	const { allStudents, isTrainer } = data

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
						Students
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{allStudents.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						All students in the club. {isTrainer && "Use the dropdowns to set Standard (STT) and Latin (LAT) rank per student."} Shows whether each has a dance partner.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Users className="size-5" />
						All students
					</CardTitle>
					<CardDescription>
						{allStudents.length} student{allStudents.length === 1 ? "" : "s"}.
						Manage couples in the <Link href="/app/club/couples" className="text-primary underline underline-offset-2">Couples</Link> section.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{allStudents.length === 0 ? (
						<p className="text-muted-foreground text-sm">No students in this club yet.</p>
					) : (
						<>
							{/* Mobile/tablet: compact list + detail sheet */}
							<div className="space-y-2 lg:hidden">
								{allStudents.map((s) => (
									<div
										key={s.user_id}
										className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3"
									>
										<button
											type="button"
											onClick={() => setDetailStudent(s)}
											className="min-w-0 flex-1 cursor-pointer text-left font-medium"
										>
											{s.full_name}
										</button>
										<Button
											variant="ghost"
											size="icon"
											className="shrink-0"
											onClick={() => setDetailStudent(s)}
											aria-label="View details"
										>
											<MoreVertical className="size-5" />
										</Button>
									</div>
								))}
							</div>

							{/* Desktop: full grid */}
							<div className="hidden lg:block space-y-3">
								<div className={cn(STUDENTS_GRID, "px-3 pb-1 text-muted-foreground text-xs font-medium uppercase tracking-wide")}>
									<span>Name</span>
									<span>Age</span>
									<span>STT</span>
									<span>LAT</span>
									<span>Partner</span>
								</div>
								{allStudents.map((s) => (
									<div
										key={s.user_id}
										className={cn(STUDENTS_GRID, "rounded-lg border border-border bg-muted/30 px-3 py-3")}
									>
										<div className="min-w-0">
											<span className="font-medium">{s.full_name}</span>
										</div>
										<div className="text-muted-foreground text-sm tabular-nums">
											{s.age != null ? `${s.age} ${s.age === 1 ? "year" : "years"} old` : "–"}
										</div>
										<div className="flex items-center gap-1.5">
											<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide shrink-0">STT</span>
											{isTrainer ? (
												<RankSelect
													value={s.rank_standard}
													onChange={(v) => updateRank(s.user_id, { rank_standard: v })}
													disabled={savingUserId === s.user_id}
													aria-label={`Standard rank for ${s.full_name}`}
												/>
											) : s.rank_standard != null ? (
												<RankBadge rank={s.rank_standard as Rank} />
											) : (
												<span className="text-muted-foreground text-sm">–</span>
											)}
										</div>
										<div className="flex items-center gap-1.5">
											<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide shrink-0">LAT</span>
											{isTrainer ? (
												<RankSelect
													value={s.rank_latin}
													onChange={(v) => updateRank(s.user_id, { rank_latin: v })}
													disabled={savingUserId === s.user_id}
													aria-label={`Latin rank for ${s.full_name}`}
												/>
											) : s.rank_latin != null ? (
												<RankBadge rank={s.rank_latin as Rank} />
											) : (
												<span className="text-muted-foreground text-sm">–</span>
											)}
										</div>
										<div className="text-muted-foreground text-sm">
											{s.partner_name ? (
												<>Partner: <span className="text-foreground font-medium">{s.partner_name}</span></>
											) : (
												<span className="text-muted-foreground">No partner</span>
											)}
										</div>
									</div>
								))}
							</div>

							<Sheet open={!!detailStudent} onOpenChange={(open) => !open && setDetailStudent(null)}>
								<SheetContent side="right" className="flex flex-col">
									<SheetHeader>
										<SheetTitle>{detailStudent?.full_name ?? "Student"}</SheetTitle>
									</SheetHeader>
									{detailStudent && (
										<div className="mt-6 space-y-4">
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Age</p>
												<p className="text-foreground mt-0.5">
													{detailStudent.age != null ? `${detailStudent.age} ${detailStudent.age === 1 ? "year" : "years"} old` : "–"}
												</p>
											</div>
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Standard (STT)</p>
												<div className="mt-1.5">
													{isTrainer ? (
														<RankSelect
															value={detailStudent.rank_standard}
															onChange={(v) => {
																updateRank(detailStudent.user_id, { rank_standard: v })
																setDetailStudent((prev) => prev ? { ...prev, rank_standard: v } : null)
															}}
															disabled={savingUserId === detailStudent.user_id}
															className="max-w-[6rem]"
															aria-label="Standard rank"
														/>
													) : detailStudent.rank_standard != null ? (
														<RankBadge rank={detailStudent.rank_standard as Rank} />
													) : (
														<span className="text-muted-foreground text-sm">–</span>
													)}
												</div>
											</div>
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Latin (LAT)</p>
												<div className="mt-1.5">
													{isTrainer ? (
														<RankSelect
															value={detailStudent.rank_latin}
															onChange={(v) => {
																updateRank(detailStudent.user_id, { rank_latin: v })
																setDetailStudent((prev) => prev ? { ...prev, rank_latin: v } : null)
															}}
															disabled={savingUserId === detailStudent.user_id}
															className="max-w-[6rem]"
															aria-label="Latin rank"
														/>
													) : detailStudent.rank_latin != null ? (
														<RankBadge rank={detailStudent.rank_latin as Rank} />
													) : (
														<span className="text-muted-foreground text-sm">–</span>
													)}
												</div>
											</div>
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Partner</p>
												<p className="text-foreground mt-0.5">
													{detailStudent.partner_name ?? "No partner"}
												</p>
											</div>
										</div>
									)}
								</SheetContent>
							</Sheet>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
