"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { GraduationCap, Loader2, ChevronLeft, MoreVertical, UserPlus, Copy, Check, Trash2, Search, Phone, Clock, ChevronRight, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ContactDialog, type ContactInfo } from "@/app/app/club/_components/contact-dialog"
import { formatSlot, type AvailabilitySlot } from "@/lib/availability"
import type { ClubData } from "@/lib/club-data.types"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { getPageCache, setPageCache } from "@/lib/app-page-cache"

const TRAINERS_GRID = "grid grid-cols-[1fr_8rem_7rem_7rem_7rem_minmax(0,1.5fr)] gap-3 items-center"

const RANKS = ["E", "D", "C", "B", "A", "S"] as const
type Rank = (typeof RANKS)[number]

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

type Trainer = {
	user_id: string
	full_name: string
	phone: string | null
	email: string | null
	rank_standard: string | null
	rank_latin: string | null
	age: number | null
	is_external?: boolean
	login_code?: string
	availability?: AvailabilitySlot[]
}

type ClubDataTrainers = Pick<ClubData, "club" | "isTrainer" | "allTrainers">

export function ClubTrainersClient({ initialData }: { initialData: ClubDataTrainers }) {
	const [data, setData] = useState<ClubDataTrainers | null>(() => {
		return getPageCache<ClubDataTrainers>("app/club/trainers") ?? initialData
	})
	const [refreshing, setRefreshing] = useState(false)
	const [detailTrainer, setDetailTrainer] = useState<Trainer | null>(null)
	const [addExternalOpen, setAddExternalOpen] = useState(false)
	const [externalName, setExternalName] = useState("")
	const [externalCreating, setExternalCreating] = useState(false)
	const [externalResult, setExternalResult] = useState<{ code: string; display_name: string } | null>(null)
	const [externalCodeCopied, setExternalCodeCopied] = useState(false)
	const [removeTrainerId, setRemoveTrainerId] = useState<string | null>(null)
	const [removing, setRemoving] = useState(false)
	const [currentUserId, setCurrentUserId] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState("")
	const [ageMin, setAgeMin] = useState("")
	const [ageMax, setAgeMax] = useState("")
	const [externalOnly, setExternalOnly] = useState(false)
	const [filterRankStandard, setFilterRankStandard] = useState("")
	const [filterRankLatin, setFilterRankLatin] = useState("")
	const [contactDialogOpen, setContactDialogOpen] = useState(false)
	const [contactDialogTitle, setContactDialogTitle] = useState("")
	const [contactDialogContact, setContactDialogContact] = useState<ContactInfo>({ phone: null, email: null })

	const filteredTrainers = useMemo(() => {
		const list = data?.allTrainers ?? []
		const q = searchQuery.trim().toLowerCase()
		const min = ageMin.trim() === "" ? null : parseInt(ageMin, 10)
		const max = ageMax.trim() === "" ? null : parseInt(ageMax, 10)
		const rankStt = filterRankStandard.trim() || null
		const rankLat = filterRankLatin.trim() || null
		return list.filter((t) => {
			if (externalOnly && !t.is_external) return false
			if (q && !t.full_name.toLowerCase().includes(q)) return false
			if (min != null && !Number.isNaN(min) && (t.age == null || t.age < min)) return false
			if (max != null && !Number.isNaN(max) && (t.age == null || t.age > max)) return false
			if (rankStt != null && t.rank_standard !== rankStt) return false
			if (rankLat != null && t.rank_latin !== rankLat) return false
			return true
		})
	}, [data?.allTrainers, searchQuery, ageMin, ageMax, externalOnly, filterRankStandard, filterRankLatin])

	useEffect(() => {
		if (!initialData) return
		const cached = getPageCache<ClubDataTrainers>("app/club/trainers")
		if (!cached) {
			setPageCache("app/club/trainers", initialData)
		}
	}, [initialData])

	async function loadTrainers(mode: "refresh" | "silent" = "refresh") {
		if (mode === "refresh") {
			setRefreshing(true)
		}
		try {
			const res = await fetch("/api/club")
			if (!res.ok) {
				return
			}
			const json = (await res.json()) as ClubDataTrainers
			setData(json)
			setPageCache("app/club/trainers", json)
		} finally {
			if (mode === "refresh") {
				setRefreshing(false)
			}
		}
	}

	useEffect(() => {
		fetch("/api/auth/me")
			.then((r) => r.ok ? r.json() : null)
			.then((d: { user?: { id: string } } | null) => setCurrentUserId(d?.user?.id ?? null))
			.catch(() => {})
	}, [])

	if (!data) return null

	const allTrainers = data.allTrainers ?? []

	async function handleAddExternalTeacher() {
		setExternalCreating(true)
		setExternalResult(null)
		try {
			const res = await fetch("/api/club/external-teachers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: externalName.trim() || undefined }),
			})
			const json = (await res.json()) as { code?: string; display_name?: string; error?: string }
			if (!res.ok) throw new Error(json.error ?? "Failed to create")
			setExternalResult({ code: json.code ?? "", display_name: json.display_name ?? "External Teacher" })
			setExternalName("")
			await loadTrainers("silent")
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to add external teacher")
		} finally {
			setExternalCreating(false)
		}
	}

	async function handleRemoveTrainer(userId: string) {
		setRemoving(true)
		try {
			const res = await fetch(`/api/club/members/${userId}`, { method: "DELETE" })
			if (!res.ok) {
				const json = (await res.json()) as { error?: string }
				throw new Error(json.error ?? "Failed to remove")
			}
			setRemoveTrainerId(null)
			if (detailTrainer?.user_id === userId) setDetailTrainer(null)
			await loadTrainers("silent")
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to remove from club")
		} finally {
			setRemoving(false)
		}
	}

	function copyCode(code: string) {
		navigator.clipboard.writeText(code)
		setExternalCodeCopied(true)
		setTimeout(() => setExternalCodeCopied(false), 2000)
		toast.success("Code copied to clipboard")
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div className="min-w-0 flex-1">
					<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
						Trainers
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{allTrainers.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						All trainers in the club.
					</p>
				</div>
				<PageRefreshButton
					refreshing={refreshing}
					onRefresh={() => loadTrainers("refresh")}
					aria-label="Refresh trainers list"
				/>
			</div>

			<Card>
				<CardHeader>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2 text-lg">
								<GraduationCap className="size-5" />
								All trainers
							</CardTitle>
							<CardDescription>
								{allTrainers.length} trainer{allTrainers.length === 1 ? "" : "s"}.
							</CardDescription>
						</div>
						{data.isTrainer && (
							<Button
								variant="outline"
								size="sm"
								className="gap-2 shrink-0"
								onClick={() => {
									setAddExternalOpen(true)
									setExternalResult(null)
									setExternalName("")
									setExternalCodeCopied(false)
								}}
							>
								<UserPlus className="size-4" />
								Add external teacher
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{allTrainers.length > 0 && (
						<div className="flex flex-wrap items-end gap-3">
							<div className="relative flex-1 min-w-[12rem] max-w-xs">
								<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
								<Input
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder="Search by name…"
									className="h-9 pl-9 rounded-lg"
									aria-label="Search trainers"
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
							<label className="flex cursor-pointer items-center gap-2">
								<Checkbox
									checked={externalOnly}
									onCheckedChange={(c) => setExternalOnly(!!c)}
									aria-label="External only"
								/>
								<span className="text-sm">External only</span>
							</label>
							{(searchQuery.trim() || ageMin.trim() || ageMax.trim() || externalOnly || filterRankStandard || filterRankLatin) && (
								<p className="text-muted-foreground text-xs">
									Showing {filteredTrainers.length} of {allTrainers.length}
								</p>
							)}
						</div>
					)}
					{allTrainers.length === 0 ? (
						<p className="text-muted-foreground text-sm">No trainers in this club yet.</p>
					) : filteredTrainers.length === 0 ? (
						<p className="text-muted-foreground text-sm">No trainers match your filters.</p>
					) : (
						<>
							{/* Mobile/tablet: compact list + detail sheet */}
							<div className="space-y-2 lg:hidden">
								{filteredTrainers.map((t) => (
									<div
										key={t.user_id}
										className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3"
									>
										<button
											type="button"
											onClick={() => setDetailTrainer(t)}
											className="min-w-0 flex-1 cursor-pointer text-left"
										>
											<span className="font-medium">{t.full_name}</span>
											{t.is_external && (
												<span className="ml-1.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
													External
												</span>
											)}
											{t.phone && (
												<span className="text-muted-foreground text-xs font-normal flex items-center gap-1 mt-0.5">
													<Phone className="size-3" />{t.phone}
												</span>
											)}
										</button>
										<div className="flex shrink-0 items-center gap-1">
											{t.is_external && t.login_code && (
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 cursor-pointer"
													onClick={(e) => { e.stopPropagation(); copyCode(t.login_code!) }}
													aria-label="Copy code"
												>
													<Copy className="size-4" />
												</Button>
											)}
											<Button
												variant="ghost"
												size="icon"
												className="shrink-0"
												onClick={() => setDetailTrainer(t)}
												aria-label="View details"
											>
												<MoreVertical className="size-5" />
											</Button>
										</div>
									</div>
								))}
							</div>

							{/* Desktop: full grid (no Partner column) */}
							<div className="hidden space-y-3 lg:block">
								<div className={cn(TRAINERS_GRID, "px-3 pb-1 text-muted-foreground text-xs font-medium uppercase tracking-wide")}>
									<span>Name</span>
									<span className="flex items-center gap-1">
										<Phone className="size-3.5" />
										Contact
									</span>
									<span>Age</span>
									<span>STT</span>
									<span>LAT</span>
									<span className="flex items-center gap-1">
										<Clock className="size-3.5" />
										Availability
									</span>
								</div>
								{filteredTrainers.map((t) => (
									<div
										key={t.user_id}
										className={cn(TRAINERS_GRID, "rounded-lg border border-border bg-muted/30 px-3 py-3")}
									>
										<div className="flex min-w-0 items-center gap-2">
											<span className="font-medium">{t.full_name}</span>
											{t.is_external && (
												<>
													<span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
														External
													</span>
													{t.login_code && (
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 shrink-0 cursor-pointer"
															onClick={() => copyCode(t.login_code!)}
															aria-label="Copy code"
															title={`Code: ${t.login_code}`}
														>
															<Copy className="size-4" />
														</Button>
													)}
												</>
											)}
										</div>
										<div className="min-w-0">
											<Button
												variant="outline"
												size="sm"
												className="h-8 gap-1.5 text-xs"
												onClick={() => {
													setContactDialogTitle(t.full_name)
													setContactDialogContact({ phone: t.phone ?? null, email: t.email ?? null })
													setContactDialogOpen(true)
												}}
											>
												<Phone className="size-3.5" />
												Contact
											</Button>
										</div>
										<div className="text-muted-foreground text-sm tabular-nums">
											{t.age != null ? `${t.age} ${t.age === 1 ? "year" : "years"} old` : "–"}
										</div>
										<div className="flex items-center gap-1.5">
											{t.rank_standard != null ? (
												<>
													<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide shrink-0">STT</span>
													<RankBadge rank={t.rank_standard as Rank} />
												</>
											) : (
												<span className="text-muted-foreground text-sm">–</span>
											)}
										</div>
										<div className="flex items-center gap-1.5">
											{t.rank_latin != null ? (
												<>
													<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide shrink-0">LAT</span>
													<RankBadge rank={t.rank_latin as Rank} />
												</>
											) : (
												<span className="text-muted-foreground text-sm">–</span>
											)}
										</div>
										<div className="min-w-0 flex flex-wrap items-center gap-1.5">
											{(t.availability?.length ?? 0) === 0 ? (
												<span className="text-muted-foreground text-sm">—</span>
											) : (
												<>
													{(t.availability ?? []).slice(0, 2).map((slot, i) => (
														<span key={i} className="rounded-md bg-muted/50 border border-border px-1.5 py-0.5 text-xs">
															{formatSlot(slot)}
														</span>
													))}
													{(t.availability ?? []).length > 2 ? (
														<Button
															variant="ghost"
															size="sm"
															className="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
															onClick={() => setDetailTrainer(t)}
															aria-label="View full availability"
														>
															<ChevronRight className="size-3.5" />
															Expand
														</Button>
													) : null}
												</>
											)}
										</div>
									</div>
								))}
							</div>

							<Sheet open={!!detailTrainer} onOpenChange={(open) => !open && setDetailTrainer(null)}>
								<SheetContent side="right" className="flex flex-col min-h-0 overflow-hidden p-0">
									<SheetHeader className="shrink-0 border-b border-border px-6 pt-6 pb-4">
										<SheetTitle className="flex items-center gap-2">
											{detailTrainer?.full_name ?? "Trainer"}
											{detailTrainer?.is_external && (
												<span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
													External
												</span>
											)}
										</SheetTitle>
									</SheetHeader>
									{detailTrainer && (
										<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
										<div className="mt-4 flex flex-col gap-6">
											<div className="space-y-4">
												<div>
													<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Contact</p>
													<div className="mt-1.5 space-y-2">
														{detailTrainer.phone ? (
															<div className="flex flex-wrap items-center gap-2">
																<span className="text-foreground text-sm">{detailTrainer.phone}</span>
																<Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
																	<a href={`tel:${detailTrainer.phone.replace(/\s/g, "")}`} aria-label="Call">
																		<Phone className="size-3.5" />
																	</a>
																</Button>
																<Button
																	variant="outline"
																	size="icon"
																	className="h-8 w-8 shrink-0"
																	aria-label="Copy phone"
																	onClick={() => {
																		void navigator.clipboard.writeText(detailTrainer.phone ?? "").then(() => toast.success("Contact copied"))
																	}}
																>
																	<Copy className="size-3.5" />
																</Button>
															</div>
														) : (
															<span className="text-muted-foreground text-sm">—</span>
														)}
														{detailTrainer.email ? (
															<div className="flex flex-wrap items-center gap-2">
																<span className="text-foreground text-sm break-all">{detailTrainer.email}</span>
																<Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
																	<a href={`mailto:${detailTrainer.email}`} aria-label="Email">
																		<Mail className="size-3.5" />
																	</a>
																</Button>
																<Button
																	variant="outline"
																	size="icon"
																	className="h-8 w-8 shrink-0"
																	aria-label="Copy email"
																	onClick={() => {
																		void navigator.clipboard.writeText(detailTrainer.email ?? "").then(() => toast.success("Contact copied"))
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
												{detailTrainer.is_external && detailTrainer.login_code && (
													<div>
														<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Access code</p>
														<div className="mt-1.5 flex items-center gap-2">
															<code className="rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-sm tracking-wider">
																{detailTrainer.login_code}
															</code>
															<Button variant="outline" size="sm" onClick={() => copyCode(detailTrainer!.login_code!)} className="cursor-pointer gap-1.5">
																{externalCodeCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
																{externalCodeCopied ? "Copied" : "Copy"}
															</Button>
														</div>
													</div>
												)}
												<div>
													<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Age</p>
													<p className="mt-0.5 text-foreground">
														{detailTrainer.age != null ? `${detailTrainer.age} ${detailTrainer.age === 1 ? "year" : "years"} old` : "–"}
													</p>
												</div>
												<div>
													<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Standard (STT)</p>
													<div className="mt-1.5">
														{detailTrainer.rank_standard != null ? (
															<RankBadge rank={detailTrainer.rank_standard as Rank} />
														) : (
															<span className="text-muted-foreground text-sm">–</span>
														)}
													</div>
												</div>
												<div>
													<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Latin (LAT)</p>
													<div className="mt-1.5">
														{detailTrainer.rank_latin != null ? (
															<RankBadge rank={detailTrainer.rank_latin as Rank} />
														) : (
															<span className="text-muted-foreground text-sm">–</span>
														)}
													</div>
												</div>
												<div>
													<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
														<Clock className="size-3.5" />
														Availability
													</p>
													{(detailTrainer.availability?.length ?? 0) === 0 ? (
														<p className="text-muted-foreground text-sm mt-0.5">No availability set.</p>
													) : (
														<ul className="flex flex-wrap gap-2 mt-1.5">
															{(detailTrainer.availability ?? []).map((slot, i) => (
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
											</div>
											{data.isTrainer && (
												<div className="mt-auto border-t border-border pt-4">
													<Button
														variant="outline"
														className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
														onClick={() => setRemoveTrainerId(detailTrainer.user_id)}
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
						</>
					)}
				</CardContent>
			</Card>

			<Dialog open={addExternalOpen} onOpenChange={setAddExternalOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Add external teacher</DialogTitle>
						<DialogDescription>
							{externalResult
								? "Share this code with the external teacher. They sign in on the login page by choosing “External Teacher” and entering the code. The code cannot be recovered later."
								: "Create a one-time access code so an external teacher can sign in without email or password."}
						</DialogDescription>
					</DialogHeader>
					{externalResult ? (
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<Input
									readOnly
									value={externalResult.code}
									className="font-mono text-lg tracking-widest"
								/>
								<Button variant="outline" size="icon" onClick={() => copyCode(externalResult.code)} aria-label="Copy code" className="cursor-pointer">
									{externalCodeCopied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
								</Button>
							</div>
							<p className="text-muted-foreground text-sm">
								They will appear as “{externalResult.display_name}” in the trainers list.
							</p>
						</div>
					) : (
						<div className="space-y-4">
							<div>
								<label htmlFor="external-teacher-name" className="mb-1.5 block text-sm font-medium text-muted-foreground">
									Display name (optional)
								</label>
								<Input
									id="external-teacher-name"
									placeholder="e.g. John Smith"
									value={externalName}
									onChange={(e) => setExternalName(e.target.value)}
								/>
								<p className="mt-1 text-xs text-muted-foreground">
									Leave empty to use &quot;External Teacher&quot;.
								</p>
							</div>
							<p className="text-sm text-muted-foreground">
								They will appear in the trainers list as “External Teacher” and can only sign in with the generated code.
							</p>
						</div>
					)}
					<DialogFooter className="gap-2 sm:gap-0">
						{externalResult ? (
							<Button onClick={() => { setAddExternalOpen(false); setExternalResult(null) }}>
								Done
							</Button>
						) : (
							<>
								<Button variant="outline" onClick={() => setAddExternalOpen(false)}>
									Cancel
								</Button>
								<Button onClick={handleAddExternalTeacher} disabled={externalCreating}>
									{externalCreating ? (
										<><Loader2 className="size-4 animate-spin" /> Creating…</>
									) : (
										"Generate code"
									)}
								</Button>
							</>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={removeTrainerId !== null} onOpenChange={(open) => !open && setRemoveTrainerId(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Remove from club</DialogTitle>
						<DialogDescription>
							{removeTrainerId === currentUserId
								? "You will be removed from the club and will need to re-join or be added again. Continue?"
								: "This trainer will lose access to the club. They can be re-added later. Continue?"}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2 sm:gap-0">
						<Button variant="outline" onClick={() => setRemoveTrainerId(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => removeTrainerId && handleRemoveTrainer(removeTrainerId)}
							disabled={removing}
						>
							{removing ? <Loader2 className="size-4 animate-spin" /> : "Remove from club"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
