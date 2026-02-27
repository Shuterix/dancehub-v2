"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Users, UserPlus, Loader2, ChevronLeft, Trash2, Clock, MoreVertical, UsersRound, Search, Phone, Mail, Copy } from "lucide-react"
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
	DialogTrigger,
} from "@/components/ui/dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { intersectAvailability, formatSlot, type AvailabilitySlot } from "@/lib/availability"
import { cn } from "@/lib/utils"
import type { ClubData } from "@/lib/club-data.types"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { getPageCache, setPageCache } from "@/lib/app-page-cache"
type GroupSummary = { id: string; name: string; student_ids: string[]; couple_ids: string[] }

const COUPLES_GRID = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,2fr)] gap-4 items-center"
const COUPLES_GRID_WITH_GROUPS = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.2fr)] gap-4 items-center"

const RANK_STYLES: Record<string, string> = {
	E: "bg-red-500/30 text-red-700 dark:text-red-300 border-red-500/50",
	D: "bg-orange-500/30 text-orange-700 dark:text-orange-300 border-orange-500/50",
	C: "bg-amber-500/30 text-amber-800 dark:text-amber-300 border-amber-500/50",
	B: "bg-lime-500/30 text-lime-800 dark:text-lime-300 border-lime-500/50",
	A: "bg-emerald-500/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/50",
	S: "bg-violet-500/30 text-violet-800 dark:text-violet-300 border-violet-500/50",
}

function RankBadge({ rank }: { rank: string }) {
	return (
		<span
			className={cn(
				"inline-flex size-8 items-center justify-center rounded-lg border text-xs font-semibold",
				RANK_STYLES[rank] ?? "bg-muted text-muted-foreground border-border"
			)}
		>
			{rank}
		</span>
	)
}

type UnpairedStudent = {
	user_id: string
	full_name: string
	rank_standard: string | null
	rank_latin: string | null
	age: number | null
	availability?: AvailabilitySlot[]
}

type Couple = {
	id: string
	name: string | null
	partner1_user_id: string | null
	partner2_user_id: string | null
	partner1_name: string | null
	partner2_name: string | null
	partner1_phone: string | null
	partner2_phone: string | null
	partner1_email: string | null
	partner2_email: string | null
	partner1_availability: AvailabilitySlot[]
	partner2_availability: AvailabilitySlot[]
	/** Stored in DB (intersection of both partners). */
	availability?: AvailabilitySlot[]
}

type ClubDataCouples = Pick<ClubData, "club" | "isTrainer" | "couples" | "unpairedStudents" | "groups">

export function ClubCouplesClient({ initialData }: { initialData: ClubDataCouples }) {
	const [data, setData] = useState<ClubDataCouples | null>(() => {
		return getPageCache<ClubDataCouples>("app/club/couples") ?? initialData
	})
	const [refreshing, setRefreshing] = useState(false)
	const [createOpen, setCreateOpen] = useState(false)
	const [partner1Id, setPartner1Id] = useState<string>("")
	const [partner2Id, setPartner2Id] = useState<string>("")
	const [creating, setCreating] = useState(false)
	const [removingId, setRemovingId] = useState<string | null>(null)
	const [detailCouple, setDetailCouple] = useState<Couple | null>(null)
	const [removingFromGroup, setRemovingFromGroup] = useState<string | null>(null)
	const [searchQuery, setSearchQuery] = useState("")
	const filteredCouples = useMemo(() => {
		const list = data?.couples ?? []
		const q = searchQuery.trim().toLowerCase()
		if (!q) return list
		return list.filter((c) => {
			const name = (c.name ?? [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")) || ""
			return name.toLowerCase().includes(q) ||
				(c.partner1_name?.toLowerCase().includes(q)) ||
				(c.partner2_name?.toLowerCase().includes(q))
		})
	}, [data?.couples, searchQuery])

	useEffect(() => {
		if (!initialData) return
		const cached = getPageCache<ClubDataCouples>("app/club/couples")
		if (!cached) {
			setPageCache("app/club/couples", initialData)
		}
	}, [initialData])

	async function reloadFromApi(mode: "refresh" | "silent" = "refresh") {
		if (mode === "refresh") {
			setRefreshing(true)
		}
		try {
			const res = await fetch("/api/club")
			if (!res.ok) {
				return
			}
			const json = (await res.json()) as ClubDataCouples
			setData(json)
			setPageCache("app/club/couples", json)
		} finally {
			if (mode === "refresh") {
				setRefreshing(false)
			}
		}
	}

	async function handleCreate() {
		if (!partner1Id || !partner2Id || partner1Id === partner2Id || !data?.isTrainer) return
		setCreating(true)
		try {
			const res = await fetch("/api/club/couples", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					partner1_user_id: partner1Id,
					partner2_user_id: partner2Id,
					name: null,
				}),
			})
			if (!res.ok) {
				const json = (await res.json()) as { error?: string }
				throw new Error(json.error ?? "Failed to create couple")
			}
			setCreateOpen(false)
			setPartner1Id("")
			setPartner2Id("")
			await reloadFromApi("silent")
		} catch (e) {
			// could toast
		} finally {
			setCreating(false)
		}
	}

	async function handleRemove(coupleId: string) {
		setRemovingId(coupleId)
		try {
			const res = await fetch(`/api/club/couples/${coupleId}`, { method: "DELETE" })
			if (!res.ok) throw new Error("Failed to remove couple")
			await reloadFromApi("silent")
		} finally {
			setRemovingId(null)
		}
	}

	function getCoupleGroups(coupleId: string): GroupSummary[] {
		if (!data?.groups) return []
		return data.groups.filter((g) => g.couple_ids?.includes(coupleId) ?? false)
	}

	async function removeCoupleFromGroup(groupId: string, coupleId: string) {
		const group = data?.groups?.find((g) => g.id === groupId)
		if (!group) return
		setRemovingFromGroup(`${groupId}-${coupleId}`)
		try {
			const res = await fetch(`/api/club/groups/${groupId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					student_ids: group.student_ids ?? [],
					couple_ids: (group.couple_ids ?? []).filter((id) => id !== coupleId),
				}),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Failed to remove from group")
				return
			}
			toast.success("Removed from group")
			await reloadFromApi("silent")
		} finally {
			setRemovingFromGroup(null)
		}
	}

	if (!data) {
		return null
	}

	const { couples, unpairedStudents, isTrainer } = data

	const unpairedOptions = unpairedStudents.map((s) => ({
		value: s.user_id,
		label: `${s.full_name}${s.age != null ? ` (${s.age})` : ""}`,
	}))
	const canCreate = isTrainer && unpairedOptions.length >= 2

	if (refreshing) {
		return <PageSkeleton backHref="/app/club" cardRowCount={6} />
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div className="min-w-0 flex-1">
					<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
						Couples
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{couples.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						Paired dancers. Couple availability is when both partners are free.
					</p>
				</div>
				<PageRefreshButton
					refreshing={refreshing}
					onRefresh={() => reloadFromApi("refresh")}
					aria-label="Refresh couples list"
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Users className="size-5" />
						Couples
					</CardTitle>
					<CardDescription>
						{isTrainer && (
							<>
								Create a couple from two unpaired students. Remove a couple to unpair them.
								{" "}
								{unpairedStudents.length < 2 && unpairedStudents.length > 0 && (
									<span className="text-amber-600 dark:text-amber-400">
										Need at least 2 unpaired students to create a new couple.
									</span>
								)}
							</>
						)}
						{!isTrainer && "Dance couples in this club."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{couples.length > 0 && (
						<div className="relative">
							<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
							<Input
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search by couple or partner name…"
								className="h-9 pl-9 rounded-lg max-w-sm"
								aria-label="Search couples"
							/>
							{searchQuery.trim() && (
								<p className="text-muted-foreground text-xs mt-1.5">
									Showing {filteredCouples.length} of {couples.length} couples
								</p>
							)}
						</div>
					)}
					{isTrainer && (
						<Dialog open={createOpen} onOpenChange={setCreateOpen}>
							<Button
								onClick={() => canCreate && setCreateOpen(true)}
								disabled={!canCreate}
								title={!canCreate ? "Need at least 2 unpaired students to create a couple" : undefined}
								className="cursor-pointer rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:brightness-110 active:scale-[0.98] disabled:pointer-events-auto disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:brightness-100"
							>
								<UserPlus className="mr-2 size-4" />
								Create couple
							</Button>
							<DialogContent className="max-w-lg sm:max-w-xl">
								<DialogHeader>
									<DialogTitle>Create couple</DialogTitle>
									<DialogDescription>
										Select two unpaired students. Preview their details and shared availability below.
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-4 py-2">
									<div className="grid gap-2">
										<label className="text-sm font-medium">Partner 1</label>
										<Select value={partner1Id} onValueChange={setPartner1Id}>
											<SelectTrigger>
												<SelectValue placeholder="Select student" />
											</SelectTrigger>
											<SelectContent>
												{unpairedOptions.map((o) => (
													<SelectItem key={o.value} value={o.value} disabled={o.value === partner2Id}>
														{o.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="grid gap-2">
										<label className="text-sm font-medium">Partner 2</label>
										<Select value={partner2Id} onValueChange={setPartner2Id}>
											<SelectTrigger>
												<SelectValue placeholder="Select student" />
											</SelectTrigger>
											<SelectContent>
												{unpairedOptions.map((o) => (
													<SelectItem key={o.value} value={o.value} disabled={o.value === partner1Id}>
														{o.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Partner comparison & couple availability when both selected */}
									{partner1Id && partner2Id && partner1Id !== partner2Id && (() => {
										const p1 = unpairedStudents.find((s) => s.user_id === partner1Id)
										const p2 = unpairedStudents.find((s) => s.user_id === partner2Id)
										if (!p1 || !p2) return null
										const coupleAvailability = intersectAvailability(
											p1.availability ?? [],
											p2.availability ?? []
										)
										return (
											<div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Partner comparison</p>
												<div className="grid grid-cols-2 gap-4">
													<div className="space-y-2 rounded-lg border border-border bg-background p-3">
														<p className="font-medium">{p1.full_name}</p>
														<p className="text-muted-foreground text-sm">
															{p1.age != null ? `${p1.age} ${p1.age === 1 ? "year" : "years"} old` : "–"}
														</p>
														<div className="flex flex-wrap items-center gap-2">
															<span className="text-muted-foreground text-xs">STT</span>
															{p1.rank_standard != null ? <RankBadge rank={p1.rank_standard} /> : <span className="text-muted-foreground text-sm">–</span>}
															<span className="text-muted-foreground text-xs">LAT</span>
															{p1.rank_latin != null ? <RankBadge rank={p1.rank_latin} /> : <span className="text-muted-foreground text-sm">–</span>}
														</div>
													</div>
													<div className="space-y-2 rounded-lg border border-border bg-background p-3">
														<p className="font-medium">{p2.full_name}</p>
														<p className="text-muted-foreground text-sm">
															{p2.age != null ? `${p2.age} ${p2.age === 1 ? "year" : "years"} old` : "–"}
														</p>
														<div className="flex flex-wrap items-center gap-2">
															<span className="text-muted-foreground text-xs">STT</span>
															{p2.rank_standard != null ? <RankBadge rank={p2.rank_standard} /> : <span className="text-muted-foreground text-sm">–</span>}
															<span className="text-muted-foreground text-xs">LAT</span>
															{p2.rank_latin != null ? <RankBadge rank={p2.rank_latin} /> : <span className="text-muted-foreground text-sm">–</span>}
														</div>
													</div>
												</div>
												<div>
													<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5 mb-2">
														<Clock className="size-3.5" />
														Couple availability (when both are free)
													</p>
													{coupleAvailability.length === 0 ? (
														<p className="text-muted-foreground text-sm">No overlapping availability.</p>
													) : (
														<ul className="flex flex-wrap gap-1.5">
															{coupleAvailability.map((slot, i) => (
																<li
																	key={`${slot.day}-${slot.start}-${slot.end}-${i}`}
																	className="rounded-md bg-background border border-border px-2 py-1 text-sm"
																>
																	{formatSlot(slot)}
																</li>
															))}
														</ul>
													)}
												</div>
											</div>
										)
									})()}
								</div>
								<DialogFooter>
									<Button variant="outline" onClick={() => setCreateOpen(false)}>
										Cancel
									</Button>
									<Button
										onClick={handleCreate}
										disabled={!partner1Id || !partner2Id || partner1Id === partner2Id || creating}
									>
										{creating && <Loader2 className="mr-2 size-4 animate-spin" />}
										Create couple
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					)}

					{couples.length === 0 ? (
						<p className="text-muted-foreground text-sm">No couples yet.</p>
					) : filteredCouples.length === 0 ? (
						<p className="text-muted-foreground text-sm">No couples match your search.</p>
					) : (
						<>
							{/* Mobile/tablet: compact list + detail sheet */}
							<div className="space-y-2 lg:hidden">
								{filteredCouples.map((c) => {
									const coupleGroups = getCoupleGroups(c.id)
									return (
										<div
											key={c.id}
											className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3"
										>
											<button
												type="button"
												onClick={() => setDetailCouple(c)}
												className="min-w-0 flex-1 cursor-pointer text-left font-medium"
											>
												{(c.name ?? [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")) || "Unnamed couple"}
												{coupleGroups.length > 0 && (
													<span className="ml-2 text-muted-foreground text-xs font-normal">
														{coupleGroups.length} group{coupleGroups.length !== 1 ? "s" : ""}
													</span>
												)}
											</button>
											<Button
												variant="ghost"
												size="icon"
												className="shrink-0"
												onClick={() => setDetailCouple(c)}
												aria-label="View details"
											>
												<MoreVertical className="size-5" />
											</Button>
										</div>
									)
								})}
							</div>

							{/* Desktop: full grid */}
							<div className="hidden lg:block space-y-4">
								<div className={cn(COUPLES_GRID_WITH_GROUPS, isTrainer && "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto]")}>
									<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Couple</span>
									<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Partners</span>
									<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
										<Clock className="size-3.5" />
										Availability
									</span>
									<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
										<UsersRound className="size-3.5" />
										Groups
									</span>
									{isTrainer && <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide text-right">Action</span>}
								</div>
								{filteredCouples.map((c) => {
									const coupleAvailability =
										(c.availability?.length ? c.availability : null) ??
										intersectAvailability(
											c.partner1_availability ?? [],
											c.partner2_availability ?? []
										)
									const coupleGroups = getCoupleGroups(c.id)
									const coupleDisplayName = (c.name ?? [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")) || "Unnamed couple"
									return (
										<div
											key={c.id}
											className={cn(
												"rounded-lg border border-border bg-muted/30 p-4",
												isTrainer ? "grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_auto] gap-4 items-center" : COUPLES_GRID_WITH_GROUPS
											)}
										>
											<div className="font-medium min-w-0">{coupleDisplayName}</div>
											<div className="text-muted-foreground text-sm min-w-0">
												{c.partner1_name ?? "—"} & {c.partner2_name ?? "—"}
											</div>
											<div className="min-w-0">
												{coupleAvailability.length === 0 ? (
													<p className="text-muted-foreground text-sm">No overlapping availability.</p>
												) : (
													<ul className="flex flex-wrap gap-2">
														{coupleAvailability.map((slot, i) => (
															<li
																key={`${slot.day}-${slot.start}-${slot.end}-${i}`}
																className="rounded-md bg-background border border-border px-2 py-1 text-sm"
															>
																{formatSlot(slot)}
															</li>
														))}
													</ul>
												)}
											</div>
											<div className="min-w-0">
												{coupleGroups.length === 0 ? (
													<span className="text-muted-foreground text-sm">—</span>
												) : (
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<button
																type="button"
																className="flex items-center gap-1 text-left text-sm text-foreground hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
																aria-label={`${coupleGroups.length} group(s). Open to view or remove`}
															>
																{coupleGroups.length <= 2 ? (
																	<span className="truncate">
																		{coupleGroups.map((g) => g.name).join(", ")}
																	</span>
																) : (
																	<>
																		<span className="truncate">{coupleGroups[0].name}</span>
																		<span className="text-muted-foreground shrink-0">+{coupleGroups.length - 1}</span>
																	</>
																)}
															</button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="max-w-[16rem]">
															{coupleGroups.map((g) => (
																<DropdownMenuItem
																	key={g.id}
																	onSelect={(e) => {
																		e.preventDefault()
																		if (isTrainer) removeCoupleFromGroup(g.id, c.id)
																	}}
																	disabled={!isTrainer || removingFromGroup === `${g.id}-${c.id}`}
																	className={cn(isTrainer && "flex items-center justify-between gap-2")}
																>
																	<span className="truncate">{g.name}</span>
																	{isTrainer && (
																		<span className="text-destructive text-xs shrink-0">
																			{removingFromGroup === `${g.id}-${c.id}` ? (
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
											{isTrainer && (
												<div className="flex justify-end">
													<Button
														variant="ghost"
														size="sm"
														className="text-destructive hover:text-destructive"
														onClick={() => handleRemove(c.id)}
														disabled={removingId === c.id}
													>
														{removingId === c.id ? (
															<Loader2 className="size-4 animate-spin" />
														) : (
															<Trash2 className="size-4" />
														)}
														<span className="sr-only">Remove couple</span>
													</Button>
												</div>
											)}
										</div>
									)
								})}
							</div>

							<Sheet open={!!detailCouple} onOpenChange={(open) => !open && setDetailCouple(null)}>
								<SheetContent side="right" className="flex flex-col min-h-0 overflow-hidden p-0">
									<SheetHeader className="shrink-0 border-b border-border px-6 pt-6 pb-4">
										<SheetTitle>
											{(detailCouple?.name ?? [detailCouple?.partner1_name, detailCouple?.partner2_name].filter(Boolean).join(" & ")) || "Unnamed couple"}
										</SheetTitle>
									</SheetHeader>
									{detailCouple && (
										<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
										<div className="mt-4 space-y-4">
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Partners</p>
												<p className="text-foreground mt-0.5">
													{detailCouple.partner1_name ?? "—"} & {detailCouple.partner2_name ?? "—"}
												</p>
											</div>
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
													<Phone className="size-3.5" />
													Contact
												</p>
												<div className="mt-1.5 space-y-4">
													<div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
														<p className="font-medium text-sm">{detailCouple.partner1_name ?? "Partner 1"}</p>
														{detailCouple.partner1_phone ? (
															<div className="flex flex-wrap items-center gap-2">
																<span className="text-foreground text-sm">{detailCouple.partner1_phone}</span>
																<Button variant="outline" size="icon" className="h-7 w-7 shrink-0" asChild>
																	<a href={`tel:${detailCouple.partner1_phone.replace(/\s/g, "")}`} aria-label="Call"><Phone className="size-3" /></a>
																</Button>
																<Button
																	variant="outline"
																	size="icon"
																	className="h-7 w-7 shrink-0"
																	aria-label="Copy phone"
																	onClick={() => {
																		void navigator.clipboard.writeText(detailCouple.partner1_phone ?? "").then(() => toast.success("Contact copied"))
																	}}
																>
																	<Copy className="size-3" />
																</Button>
															</div>
														) : <span className="text-muted-foreground text-sm">—</span>}
														{detailCouple.partner1_email ? (
															<div className="flex flex-wrap items-center gap-2">
																<span className="text-foreground text-sm break-all">{detailCouple.partner1_email}</span>
																<Button variant="outline" size="icon" className="h-7 w-7 shrink-0" asChild>
																	<a href={`mailto:${detailCouple.partner1_email}`} aria-label="Email"><Mail className="size-3" /></a>
																</Button>
																<Button
																	variant="outline"
																	size="icon"
																	className="h-7 w-7 shrink-0"
																	aria-label="Copy email"
																	onClick={() => {
																		void navigator.clipboard.writeText(detailCouple.partner1_email ?? "").then(() => toast.success("Contact copied"))
																	}}
																>
																	<Copy className="size-3" />
																</Button>
															</div>
														) : <span className="text-muted-foreground text-sm">—</span>}
													</div>
													<div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
														<p className="font-medium text-sm">{detailCouple.partner2_name ?? "Partner 2"}</p>
														{detailCouple.partner2_phone ? (
															<div className="flex flex-wrap items-center gap-2">
																<span className="text-foreground text-sm">{detailCouple.partner2_phone}</span>
																<Button variant="outline" size="icon" className="h-7 w-7 shrink-0" asChild>
																	<a href={`tel:${detailCouple.partner2_phone.replace(/\s/g, "")}`} aria-label="Call"><Phone className="size-3" /></a>
																</Button>
																<Button
																	variant="outline"
																	size="icon"
																	className="h-7 w-7 shrink-0"
																	aria-label="Copy phone"
																	onClick={() => {
																		void navigator.clipboard.writeText(detailCouple.partner2_phone ?? "").then(() => toast.success("Contact copied"))
																	}}
																>
																	<Copy className="size-3" />
																</Button>
															</div>
														) : <span className="text-muted-foreground text-sm">—</span>}
														{detailCouple.partner2_email ? (
															<div className="flex flex-wrap items-center gap-2">
																<span className="text-foreground text-sm break-all">{detailCouple.partner2_email}</span>
																<Button variant="outline" size="icon" className="h-7 w-7 shrink-0" asChild>
																	<a href={`mailto:${detailCouple.partner2_email}`} aria-label="Email"><Mail className="size-3" /></a>
																</Button>
																<Button
																	variant="outline"
																	size="icon"
																	className="h-7 w-7 shrink-0"
																	aria-label="Copy email"
																	onClick={() => {
																		void navigator.clipboard.writeText(detailCouple.partner2_email ?? "").then(() => toast.success("Contact copied"))
																	}}
																>
																	<Copy className="size-3" />
																</Button>
															</div>
														) : <span className="text-muted-foreground text-sm">—</span>}
													</div>
												</div>
											</div>
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
													<Clock className="size-3.5" />
													Couple availability
												</p>
												{(() => {
													const slots =
														(detailCouple.availability?.length ? detailCouple.availability : null) ??
														intersectAvailability(
															detailCouple.partner1_availability ?? [],
															detailCouple.partner2_availability ?? []
														)
													return slots.length === 0 ? (
														<p className="text-muted-foreground text-sm mt-1.5">No overlapping availability.</p>
													) : (
														<ul className="flex flex-wrap gap-2 mt-1.5">
															{slots.map((slot, i) => (
																<li
																	key={`${slot.day}-${slot.start}-${slot.end}-${i}`}
																	className="rounded-md bg-background border border-border px-2 py-1 text-sm"
																>
																	{formatSlot(slot)}
																</li>
															))}
														</ul>
													)
												})()}
											</div>
											<div>
												<p className="text-muted-foreground text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
													<UsersRound className="size-3.5" />
													Groups
												</p>
												{(() => {
													const groups = getCoupleGroups(detailCouple.id)
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
																			onClick={() => removeCoupleFromGroup(g.id, detailCouple.id)}
																			disabled={removingFromGroup === `${g.id}-${detailCouple.id}`}
																		>
																			{removingFromGroup === `${g.id}-${detailCouple.id}` ? (
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
											{isTrainer && (
												<div className="pt-2">
													<Button
														variant="outline"
														size="sm"
														className="text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
														onClick={() => {
															handleRemove(detailCouple.id)
															setDetailCouple(null)
														}}
														disabled={removingId === detailCouple.id}
													>
														{removingId === detailCouple.id ? (
															<Loader2 className="mr-2 size-4 animate-spin" />
														) : (
															<Trash2 className="mr-2 size-4" />
														)}
														Remove couple
													</Button>
												</div>
											)}
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
