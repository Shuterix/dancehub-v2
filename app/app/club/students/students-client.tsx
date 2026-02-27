"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Users, Loader2, ChevronLeft, MoreVertical, UsersRound, Clock, Search, Phone, ChevronRight, Mail, Copy, Trash2 } from "lucide-react"
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatSlot, type AvailabilitySlot } from "@/lib/availability"
import { cn } from "@/lib/utils"
import { ContactDialog, type ContactInfo } from "@/app/app/club/_components/contact-dialog"
import type { ClubData } from "@/lib/club-data.types"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { getPageCache, setPageCache } from "@/lib/app-page-cache"

type GroupSummary = { id: string; name: string; student_ids: string[]; couple_ids: string[] }

const STUDENTS_GRID = "grid grid-cols-[1fr_8rem_6rem_6rem_6rem_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-3 items-center"

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

type Student = ClubData["allStudents"][number]

export function ClubStudentsClient({ initialData }: { initialData: ClubData }) {
	const [data, setData] = useState<ClubData>(() => {
		return getPageCache<ClubData>("app/club/students") ?? initialData
	})
	const [refreshing, setRefreshing] = useState(false)
	const [detailStudent, setDetailStudent] = useState<Student | null>(null)
	const [savingUserId, setSavingUserId] = useState<string | null>(null)
	const [removingFromGroup, setRemovingFromGroup] = useState<string | null>(null)
	const [removeStudentId, setRemoveStudentId] = useState<string | null>(null)
	const [removingStudent, setRemovingStudent] = useState(false)
	const [searchQuery, setSearchQuery] = useState("")
	const [ageMin, setAgeMin] = useState<string>("")
	const [ageMax, setAgeMax] = useState<string>("")
	const [filterRankStandard, setFilterRankStandard] = useState<string>("")
	const [filterRankLatin, setFilterRankLatin] = useState<string>("")
	const [contactDialogOpen, setContactDialogOpen] = useState(false)
	const [contactDialogTitle, setContactDialogTitle] = useState("")
	const [contactDialogContact, setContactDialogContact] = useState<ContactInfo>({ phone: null, email: null })

	const filteredStudents = useMemo(() => {
		const list = data?.allStudents ?? []
		const q = searchQuery.trim().toLowerCase()
		const min = ageMin.trim() === "" ? null : parseInt(ageMin, 10)
		const max = ageMax.trim() === "" ? null : parseInt(ageMax, 10)
		const rankStt = filterRankStandard.trim() || null
		const rankLat = filterRankLatin.trim() || null
		return list.filter((s) => {
			if (q && !s.full_name.toLowerCase().includes(q)) return false
			if (min != null && !Number.isNaN(min) && (s.age == null || s.age < min)) return false
			if (max != null && !Number.isNaN(max) && (s.age == null || s.age > max)) return false
			if (rankStt != null && s.rank_standard !== rankStt) return false
			if (rankLat != null && s.rank_latin !== rankLat) return false
			return true
		})
	}, [data?.allStudents, searchQuery, ageMin, ageMax, filterRankStandard, filterRankLatin])

	useEffect(() => {
		const cached = getPageCache<ClubData>("app/club/students")
		if (!cached) {
			setPageCache("app/club/students", initialData)
		}
	}, [initialData])

	async function loadStudents(mode: "refresh" | "silent" = "refresh") {
		if (mode === "refresh") {
			setRefreshing(true)
		}
		try {
			const res = await fetch("/api/club")
			if (!res.ok) {
				return
			}
			const json = (await res.json()) as ClubData
			setData(json)
			setPageCache("app/club/students", json)
			if (detailStudent && json.allStudents) {
				const updated = json.allStudents.find((s) => s.user_id === detailStudent.user_id)
				if (updated) setDetailStudent(updated)
			}
		} finally {
			if (mode === "refresh") {
				setRefreshing(false)
			}
		}
	}

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
			await loadStudents("silent")
		} finally {
			setSavingUserId(null)
		}
	}

	function getStudentGroups(studentId: string): GroupSummary[] {
		if (!data?.groups) return []
		return data.groups.filter((g) => g.student_ids?.includes(studentId) ?? false)
	}

	async function removeStudentFromGroup(groupId: string, userId: string) {
		const group = data?.groups?.find((g) => g.id === groupId)
		if (!group) return
		setRemovingFromGroup(`${groupId}-${userId}`)
		try {
			const res = await fetch(`/api/club/groups/${groupId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					student_ids: (group.student_ids ?? []).filter((id) => id !== userId),
					couple_ids: group.couple_ids ?? [],
				}),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Failed to remove from group")
				return
			}
			toast.success("Removed from group")
			await loadStudents("silent")
			if (detailStudent?.user_id === userId) setDetailStudent(null)
		} finally {
			setRemovingFromGroup(null)
		}
	}

	async function handleRemoveStudent(userId: string) {
		setRemovingStudent(true)
		try {
			const res = await fetch(`/api/club/members/${userId}`, { method: "DELETE" })
			const json = (await res.json()) as { error?: string }
			if (!res.ok) throw new Error(json.error ?? "Failed to remove")
			setRemoveStudentId(null)
			if (detailStudent?.user_id === userId) setDetailStudent(null)
			toast.success("Student removed from club")
			await loadStudents("silent")
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to remove student from club")
		} finally {
			setRemovingStudent(false)
		}
	}

	const { allStudents, isTrainer } = data

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div className="min-w-0 flex-1">
					<h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
						Students
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{allStudents.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						All students in the club. {isTrainer && "Use the dropdowns to set Standard (STT) and Latin (LAT) rank per student."} Shows whether each has a dance partner.
					</p>
				</div>
				<PageRefreshButton
					refreshing={refreshing}
					onRefresh={() => loadStudents("refresh")}
					aria-label="Refresh students list"
				/>
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
				<CardContent className="space-y-4">
					{allStudents.length > 0 && (
						<div className="flex flex-wrap items-end gap-3">
							<div className="relative flex-1 min-w-[12rem] max-w-xs">
								<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
								<Input
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder="Search by name…"
									className="h-9 pl-9 rounded-lg"
									aria-label="Search students"
								/>
							</div>
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={0}
									placeholder="Min age"
									value={ageMin}
									onChange={(e) => setAgeMin(e.target.value)}
									className="h-9 w-24 rounded-lg"
									aria-label="Minimum age"
								/>
								<span className="text-muted-foreground text-sm">–</span>
								<Input
									type="number"
									min={0}
									placeholder="Max age"
									value={ageMax}
									onChange={(e) => setAgeMax(e.target.value)}
									className="h-9 w-24 rounded-lg"
									aria-label="Maximum age"
								/>
							</div>
							<div className="flex items-center gap-2">
								<Select value={filterRankStandard || "__all__"} onValueChange={(v) => setFilterRankStandard(v === "__all__" ? "" : v)}>
									<SelectTrigger className="h-9 w-28" aria-label="Filter by Standard rank">
										<SelectValue placeholder="STT: All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__all__">STT: All</SelectItem>
										{RANKS.map((r) => (
											<SelectItem key={r} value={r}>STT: {r}</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Select value={filterRankLatin || "__all__"} onValueChange={(v) => setFilterRankLatin(v === "__all__" ? "" : v)}>
									<SelectTrigger className="h-9 w-28" aria-label="Filter by Latin rank">
										<SelectValue placeholder="LAT: All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__all__">LAT: All</SelectItem>
										{RANKS.map((r) => (
											<SelectItem key={r} value={r}>LAT: {r}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							{(searchQuery.trim() || ageMin.trim() || ageMax.trim() || filterRankStandard || filterRankLatin) && (
								<p className="text-muted-foreground text-xs">
									Showing {filteredStudents.length} of {allStudents.length}
								</p>
							)}
						</div>
					)}
					{allStudents.length === 0 ? (
						<p className="text-muted-foreground text-sm">No students in this club yet.</p>
					) : filteredStudents.length === 0 ? (
						<p className="text-muted-foreground text-sm">No students match your filters.</p>
					) : (
						<>
							{/* Mobile/tablet: compact list + detail sheet */}
							<div className="space-y-2 lg:hidden">
								{filteredStudents.map((s) => {
									const studentGroups = getStudentGroups(s.user_id)
									return (
										<div
											key={s.user_id}
											className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3"
										>
											<button
												type="button"
												onClick={() => setDetailStudent(s)}
												className="min-w-0 flex-1 cursor-pointer text-left"
											>
												<span className="font-medium">{s.full_name}</span>
												{(s.phone || studentGroups.length > 0) && (
													<span className="text-muted-foreground text-xs font-normal block mt-0.5">
														{s.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" />{s.phone}</span>}
														{s.phone && studentGroups.length > 0 && " · "}
														{studentGroups.length > 0 && `${studentGroups.length} group${studentGroups.length !== 1 ? "s" : ""}`}
													</span>
												)}
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
									)
								})}
							</div>

							{/* Desktop: full grid */}
							<div className="hidden lg:block space-y-3">
								<div className={cn(STUDENTS_GRID, "px-3 pb-1 text-muted-foreground text-xs font-medium uppercase tracking-wide")}>
									<span>Name</span>
									<span className="flex items-center gap-1">
										<Phone className="size-3.5" />
										Contact
									</span>
									<span>Age</span>
									<span>STT</span>
									<span>LAT</span>
									<span>Partner</span>
									<span className="flex items-center gap-1">
										<Clock className="size-3.5" />
										Availability
									</span>
									<span className="flex items-center gap-1">
										<UsersRound className="size-3.5" />
										Groups
									</span>
								</div>
								{filteredStudents.map((s) => {
									const studentGroups = getStudentGroups(s.user_id)
									return (
										<div
											key={s.user_id}
											className={cn(STUDENTS_GRID, "rounded-lg border border-border bg-muted/30 px-3 py-3")}
										>
											<div className="min-w-0">
												<span className="font-medium">{s.full_name}</span>
											</div>
											<div className="min-w-0">
												<Button
													variant="outline"
													size="sm"
													className="h-8 gap-1.5 text-xs"
													onClick={() => {
														setContactDialogTitle(s.full_name)
														setContactDialogContact({ phone: s.phone ?? null, email: s.email ?? null })
														setContactDialogOpen(true)
													}}
												>
													<Phone className="size-3.5" />
													Contact
												</Button>
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
											<div className="text-muted-foreground text-sm min-w-0">
												{s.partner_name ? (
													<>Partner: <span className="text-foreground font-medium truncate">{s.partner_name}</span></>
												) : (
													<span className="text-muted-foreground">No partner</span>
												)}
											</div>
											<div className="min-w-0 flex flex-wrap items-center gap-1.5">
												{(s.availability?.length ?? 0) === 0 ? (
													<span className="text-muted-foreground text-sm">—</span>
												) : (
													<>
														{(s.availability ?? []).slice(0, 2).map((slot, i) => (
															<span key={i} className="rounded-md bg-muted/50 border border-border px-1.5 py-0.5 text-xs">
																{formatSlot(slot)}
															</span>
														))}
														{(s.availability ?? []).length > 2 ? (
															<Button
																variant="ghost"
																size="sm"
																className="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
																onClick={() => setDetailStudent(s)}
																aria-label="View full availability"
															>
																<ChevronRight className="size-3.5" />
																Expand
															</Button>
														) : null}
													</>
												)}
											</div>
											<div className="min-w-0">
												{studentGroups.length === 0 ? (
													<span className="text-muted-foreground text-sm">—</span>
												) : (
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<button
																type="button"
																className="flex items-center gap-1 text-left text-sm text-foreground hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
																aria-label={`${studentGroups.length} group(s). Open to view or remove`}
															>
																{studentGroups.length <= 2 ? (
																	<span className="truncate">
																		{studentGroups.map((g) => g.name).join(", ")}
																	</span>
																) : (
																	<>
																		<span className="truncate">{studentGroups[0].name}</span>
																		<span className="text-muted-foreground shrink-0">+{studentGroups.length - 1}</span>
																	</>
																)}
															</button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="max-w-[16rem]">
															{studentGroups.map((g) => (
																<DropdownMenuItem
																	key={g.id}
																	onSelect={(e) => {
																		e.preventDefault()
																		if (isTrainer) removeStudentFromGroup(g.id, s.user_id)
																	}}
																	disabled={!isTrainer || removingFromGroup === `${g.id}-${s.user_id}`}
																	className={cn(isTrainer && "flex items-center justify-between gap-2")}
																>
																	<span className="truncate">{g.name}</span>
																	{isTrainer && (
																		<span className="text-destructive text-xs shrink-0">
																			{removingFromGroup === `${g.id}-${s.user_id}` ? (
																				<Loader2 className="size-3.5 animate-spin" />
																			) : (
																				"Remove"
																			)}
																		</span>
																	)}
																</DropdownMenuItem>
															))}
														</DropdownMenuContent>
													</DropdownMenu>
												)}
											</div>
										</div>
									)
								})}
							</div>

							<Sheet open={!!detailStudent} onOpenChange={(open) => !open && setDetailStudent(null)}>
								<SheetContent side="right" className="flex flex-col min-h-0 overflow-hidden p-0">
									<SheetHeader className="shrink-0 border-b border-border px-6 pt-6 pb-4">
										<SheetTitle>{detailStudent?.full_name ?? "Student"}</SheetTitle>
									</SheetHeader>
									{detailStudent && (
										<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
										<div className="mt-4 space-y-4">
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Contact</p>
												<div className="mt-1.5 space-y-2">
													{detailStudent.phone ? (
														<div className="flex flex-wrap items-center gap-2">
															<span className="text-foreground text-sm">{detailStudent.phone}</span>
															<Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
																<a href={`tel:${detailStudent.phone.replace(/\s/g, "")}`} aria-label="Call">
																	<Phone className="size-3.5" />
																</a>
															</Button>
															<Button
																variant="outline"
																size="icon"
																className="h-8 w-8 shrink-0"
																aria-label="Copy phone"
																onClick={() => {
																	void navigator.clipboard.writeText(detailStudent.phone ?? "").then(() => toast.success("Contact copied"))
																}}
															>
																<Copy className="size-3.5" />
															</Button>
														</div>
													) : (
														<span className="text-muted-foreground text-sm">—</span>
													)}
													{detailStudent.email ? (
														<div className="flex flex-wrap items-center gap-2">
															<span className="text-foreground text-sm break-all">{detailStudent.email}</span>
															<Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
																<a href={`mailto:${detailStudent.email}`} aria-label="Email">
																	<Mail className="size-3.5" />
																</a>
															</Button>
															<Button
																variant="outline"
																size="icon"
																className="h-8 w-8 shrink-0"
																aria-label="Copy email"
																onClick={() => {
																	void navigator.clipboard.writeText(detailStudent.email ?? "").then(() => toast.success("Contact copied"))
																}}
															>
																<Copy className="size-3.5" />
															</Button>
														</div>
													) : (
														<span className="text-muted-foreground text-sm">—</span>
													)}
												</div>
											</div>
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
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
													<Clock className="size-3.5" />
													Availability
												</p>
												{(detailStudent.availability?.length ?? 0) === 0 ? (
													<p className="text-muted-foreground text-sm mt-0.5">No availability set.</p>
												) : (
													<ul className="flex flex-wrap gap-2 mt-1.5">
														{(detailStudent.availability ?? []).map((slot, i) => (
															<li
																key={i}
																className="rounded-md bg-muted/50 border border-border px-2 py-1 text-sm"
															>
																{formatSlot(slot)}
															</li>
														))}
													</ul>
												)}
											</div>
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
													<UsersRound className="size-3.5" />
													Groups
												</p>
												{(() => {
													const groups = getStudentGroups(detailStudent.user_id)
													if (groups.length === 0) {
														return <p className="text-muted-foreground text-sm mt-0.5">Not in any group</p>
													}
													return (
														<ul className="mt-1.5 space-y-1.5">
															{groups.map((g) => (
																<li key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
																	<Link href="/app/club/groups" className="text-sm font-medium text-primary hover:underline truncate">
																		{g.name}
																	</Link>
																	{isTrainer && (
																		<Button
																			variant="ghost"
																			size="sm"
																			className="text-destructive hover:text-destructive shrink-0 h-8"
																			onClick={() => removeStudentFromGroup(g.id, detailStudent.user_id)}
																			disabled={removingFromGroup === `${g.id}-${detailStudent.user_id}`}
																		>
																			{removingFromGroup === `${g.id}-${detailStudent.user_id}` ? (
																				<Loader2 className="size-4 animate-spin" />
																			) : (
																				"Remove"
																			)}
																		</Button>
																	)}
																</li>
															))}
														</ul>
													)
												})()}
											</div>
											{data?.isTrainer && (
												<div className="mt-auto border-t border-border pt-4">
													<Button
														variant="outline"
														className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
														onClick={() => detailStudent && setRemoveStudentId(detailStudent.user_id)}
													>
														<Trash2 className="size-4" />
														Remove from club
													</Button>
												</div>
											)}
										</div>
										</div>
									)}
								</SheetContent>
							</Sheet>
							<ContactDialog
								open={contactDialogOpen}
								onOpenChange={setContactDialogOpen}
								title={contactDialogTitle}
								contact={contactDialogContact}
							/>
							<Dialog open={removeStudentId !== null} onOpenChange={(open) => !open && setRemoveStudentId(null)}>
								<DialogContent className="sm:max-w-md">
									<DialogHeader>
										<DialogTitle>Remove from club</DialogTitle>
										<DialogDescription>
											This student will lose access to the club. They can re-join later if invited. Continue?
										</DialogDescription>
									</DialogHeader>
									<DialogFooter className="gap-2 sm:gap-0">
										<Button variant="outline" onClick={() => setRemoveStudentId(null)}>
											Cancel
										</Button>
										<Button
											variant="destructive"
											onClick={() => removeStudentId && handleRemoveStudent(removeStudentId)}
											disabled={removingStudent}
										>
											{removingStudent ? <Loader2 className="size-4 animate-spin" /> : "Remove from club"}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
