"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { GraduationCap, Loader2, ChevronLeft, MoreVertical, UserPlus, Copy, Check, Trash2 } from "lucide-react"
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
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const TRAINERS_GRID = "grid grid-cols-[1fr_7rem_7rem_7rem] gap-3 items-center"

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
	rank_standard: string | null
	rank_latin: string | null
	age: number | null
	is_external?: boolean
	login_code?: string
}

type ClubData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
	allTrainers: Trainer[]
}

export default function ClubTrainersPage() {
	const router = useRouter()
	const [data, setData] = useState<ClubData | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [detailTrainer, setDetailTrainer] = useState<Trainer | null>(null)
	const [addExternalOpen, setAddExternalOpen] = useState(false)
	const [externalName, setExternalName] = useState("")
	const [externalCreating, setExternalCreating] = useState(false)
	const [externalResult, setExternalResult] = useState<{ code: string; display_name: string } | null>(null)
	const [externalCodeCopied, setExternalCodeCopied] = useState(false)
	const [removeTrainerId, setRemoveTrainerId] = useState<string | null>(null)
	const [removing, setRemoving] = useState(false)
	const [currentUserId, setCurrentUserId] = useState<string | null>(null)

	function loadClub() {
		return fetch("/api/club")
			.then((res) => {
				if (res.status === 401) {
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
					setError(null)
				}
			})
			.catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
	}

	useEffect(() => {
		loadClub().finally(() => setLoading(false))
	}, [router])

	useEffect(() => {
		fetch("/api/auth/me")
			.then((r) => r.ok ? r.json() : null)
			.then((d: { user?: { id: string } } | null) => setCurrentUserId(d?.user?.id ?? null))
			.catch(() => {})
	}, [])

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
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">Trainers</h1>
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
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Trainers</h1>
					<p className="text-muted-foreground text-sm">{error ?? "Unable to load."}</p>
				</div>
			</div>
		)
	}

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
			loadClub().catch(() => {})
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to add external teacher")
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
			await loadClub()
			if (userId === currentUserId) {
				router.replace("/onboarding")
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to remove from club")
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
				<div>
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
				<CardContent>
					{allTrainers.length === 0 ? (
						<p className="text-muted-foreground text-sm">No trainers in this club yet.</p>
					) : (
						<>
							{/* Mobile/tablet: compact list + detail sheet */}
							<div className="space-y-2 lg:hidden">
								{allTrainers.map((t) => (
									<div
										key={t.user_id}
										className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3"
									>
										<button
											type="button"
											onClick={() => setDetailTrainer(t)}
											className="min-w-0 flex-1 cursor-pointer text-left font-medium"
										>
											<span>{t.full_name}</span>
											{t.is_external && (
												<span className="ml-1.5 inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
													External
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
									<span>Age</span>
									<span>STT</span>
									<span>LAT</span>
								</div>
								{allTrainers.map((t) => (
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
									</div>
								))}
							</div>

							<Sheet open={!!detailTrainer} onOpenChange={(open) => !open && setDetailTrainer(null)}>
								<SheetContent side="right" className="flex flex-col">
									<SheetHeader>
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
										<div className="mt-6 flex flex-1 flex-col gap-6">
											<div className="space-y-4">
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
									)}
								</SheetContent>
							</Sheet>
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
