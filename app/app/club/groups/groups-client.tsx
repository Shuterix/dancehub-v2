"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
	UsersRound,
	ChevronLeft,
	Plus,
	Loader2,
	Pencil,
	Trash2,
	UserPlus,
	Heart,
	Search,
	Clock,
} from "lucide-react"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { PageRefreshButton } from "@/app/app/_components/page-refresh-button"
import { getPageCache, setPageCache } from "@/lib/app-page-cache"
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
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { formatSlot, type AvailabilitySlot } from "@/lib/availability"
import { cn } from "@/lib/utils"
import type { ClubData } from "@/lib/club-data.types"

type Group = ClubData["groups"][number]

export function ClubGroupsClient({ initialData }: { initialData: ClubData }) {
	const [data, setData] = useState<ClubData>(() => {
		return getPageCache<ClubData>("app/club/groups") ?? initialData
	})
	const [refreshing, setRefreshing] = useState(false)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editingGroup, setEditingGroup] = useState<Group | null>(null)
	const [formName, setFormName] = useState("")
	const [formStudentIds, setFormStudentIds] = useState<Set<string>>(new Set())
	const [formCoupleIds, setFormCoupleIds] = useState<Set<string>>(new Set())
	const [searchStudents, setSearchStudents] = useState("")
	const [searchCouples, setSearchCouples] = useState("")
	const [saving, setSaving] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const [detailGroup, setDetailGroup] = useState<Group | null>(null)
	const [listSearchQuery, setListSearchQuery] = useState("")

	useEffect(() => {
		const cached = getPageCache<ClubData>("app/club/groups")
		if (!cached) {
			setPageCache("app/club/groups", initialData)
		}
	}, [initialData])

	const { groups, allStudents, couples, isTrainer } = data

	const filteredGroups = useMemo(() => {
		const q = listSearchQuery.trim().toLowerCase()
		if (!q) return groups
		return groups.filter((g) => g.name.toLowerCase().includes(q))
	}, [groups, listSearchQuery])

	const loadData = useCallback(() => {
		return fetch("/api/club")
			.then((res) => {
				if (res.status === 401 || res.status === 404) return null
				if (!res.ok) throw new Error("Failed to load club")
				return res.json()
			})
			.then((json) => {
				if (json) {
					setData(json)
					setPageCache("app/club/groups", json)
				}
			})
	}, [])

	function openCreate() {
		setEditingGroup(null)
		setFormName("")
		setFormStudentIds(new Set())
		setFormCoupleIds(new Set())
		setSearchStudents("")
		setSearchCouples("")
		setDialogOpen(true)
	}

	function openEdit(group: Group) {
		setEditingGroup(group)
		setFormName(group.name)
		const coupleIdsSet = new Set(group.couple_ids ?? [])
		const studentIdsSet = new Set(group.student_ids ?? [])
		for (const c of couples) {
			if (coupleIdsSet.has(c.id)) {
				if (c.partner1_user_id) studentIdsSet.add(c.partner1_user_id)
				if (c.partner2_user_id) studentIdsSet.add(c.partner2_user_id)
			}
		}
		setFormStudentIds(studentIdsSet)
		setFormCoupleIds(coupleIdsSet)
		setSearchStudents("")
		setSearchCouples("")
		setDialogOpen(true)
	}

	function toggleStudent(userId: string) {
		setFormStudentIds((prev) => {
			const next = new Set(prev)
			if (next.has(userId)) next.delete(userId)
			else next.add(userId)
			return next
		})
	}

	function toggleCouple(coupleId: string) {
		const c = couples.find((x) => x.id === coupleId)
		const isAdding = !formCoupleIds.has(coupleId)
		setFormCoupleIds((prev) => {
			const next = new Set(prev)
			if (next.has(coupleId)) next.delete(coupleId)
			else next.add(coupleId)
			return next
		})
		if (c && (c.partner1_user_id || c.partner2_user_id)) {
			setFormStudentIds((prev) => {
				const next = new Set(prev)
				if (isAdding) {
					if (c.partner1_user_id) next.add(c.partner1_user_id)
					if (c.partner2_user_id) next.add(c.partner2_user_id)
				} else {
					if (c.partner1_user_id) next.delete(c.partner1_user_id)
					if (c.partner2_user_id) next.delete(c.partner2_user_id)
				}
				return next
			})
		}
	}

	async function handleSave() {
		const name = formName.trim()
		if (!name) {
			toast.error("Please enter a group name.")
			return
		}
		const coupleIdsArr = Array.from(formCoupleIds)
		const partnerIdsInSelectedCouples = new Set<string>()
		for (const c of couples) {
			if (coupleIdsArr.includes(c.id)) {
				if (c.partner1_user_id) partnerIdsInSelectedCouples.add(c.partner1_user_id)
				if (c.partner2_user_id) partnerIdsInSelectedCouples.add(c.partner2_user_id)
			}
		}
		const studentIdsToSend = Array.from(formStudentIds).filter((id) => !partnerIdsInSelectedCouples.has(id))

		setSaving(true)
		try {
			if (editingGroup) {
				const res = await fetch(`/api/club/groups/${editingGroup.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name,
						student_ids: studentIdsToSend,
						couple_ids: coupleIdsArr,
					}),
				})
				const json = await res.json().catch(() => ({}))
				if (!res.ok) {
					toast.error(json.error ?? "Failed to update group")
					return
				}
				toast.success("Group updated")
			} else {
				const res = await fetch("/api/club/groups", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name }),
				})
				const json = await res.json().catch(() => ({}))
				if (!res.ok) {
					toast.error(json.error ?? "Failed to create group")
					return
				}
				const newId = json.id as string
				if (studentIdsToSend.length > 0 || coupleIdsArr.length > 0) {
					await fetch(`/api/club/groups/${newId}`, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							student_ids: studentIdsToSend,
							couple_ids: coupleIdsArr,
						}),
					})
				}
				toast.success("Group created")
			}
			setDialogOpen(false)
			loadData()
		} finally {
			setSaving(false)
		}
	}

	async function handleDelete(groupId: string) {
		setDeletingId(groupId)
		try {
			const res = await fetch(`/api/club/groups/${groupId}`, { method: "DELETE" })
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				toast.error(json.error ?? "Failed to delete group")
				return
			}
			toast.success("Group deleted")
			loadData()
			if (editingGroup?.id === groupId) setDialogOpen(false)
		} finally {
			setDeletingId(null)
		}
	}

	const studentSearchLower = searchStudents.trim().toLowerCase()
	const filteredStudents = studentSearchLower
		? allStudents.filter((s) => s.full_name.toLowerCase().includes(studentSearchLower))
		: allStudents

	const coupleSearchLower = searchCouples.trim().toLowerCase()
	const filteredCouples = coupleSearchLower
		? couples.filter((c) => {
				const name = (c.name ?? [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")) || ""
				return name.toLowerCase().includes(coupleSearchLower)
		  })
		: couples

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/club" aria-label="Back to club">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
						Groups
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{groups.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						{isTrainer
							? "Create groups and add students or couples. Each person or couple can be in multiple groups."
							: "Groups in your club. Students and couples can belong to more than one group."}
					</p>
				</div>
				<PageRefreshButton refreshing={refreshing} onRefresh={() => setRefreshing(true)} aria-label="Refresh groups" />
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<UsersRound className="size-5" />
						Groups
					</CardTitle>
					<CardDescription>
						{groups.length === 0
							? "No groups yet."
							: `${groups.length} group${groups.length === 1 ? "" : "s"}. ${isTrainer ? "Create a new group or edit existing ones." : ""}`}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{groups.length > 0 && (
						<div className="relative max-w-xs">
							<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
							<Input
								value={listSearchQuery}
								onChange={(e) => setListSearchQuery(e.target.value)}
								placeholder="Search groups by name…"
								className="h-9 pl-9 rounded-lg"
								aria-label="Search groups"
							/>
							{listSearchQuery.trim() && (
								<p className="text-muted-foreground text-xs mt-1.5">
									Showing {filteredGroups.length} of {groups.length} groups
								</p>
							)}
						</div>
					)}
					{isTrainer && (
						<Button
							onClick={openCreate}
							className="cursor-pointer rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:brightness-110 active:scale-[0.98]"
						>
							<Plus className="mr-2 size-4" />
							Create group
						</Button>
					)}

					{groups.length === 0 && !isTrainer ? (
						<p className="text-muted-foreground text-sm">No groups in this club yet.</p>
					) : filteredGroups.length === 0 ? (
						<p className="text-muted-foreground text-sm">No groups match your search.</p>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{filteredGroups.map((g) => (
								<div
									key={g.id}
									role="button"
									tabIndex={0}
									onClick={() => setDetailGroup(g)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault()
											setDetailGroup(g)
										}
									}}
									className={cn(
										"flex flex-col rounded-xl border border-border bg-muted/30 p-4 transition-colors cursor-pointer",
										"hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<h3 className="font-semibold text-foreground truncate" title={g.name}>
												{g.name}
											</h3>
											<p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-sm">
												<span className="inline-flex items-center gap-1">
													<UserPlus className="size-3.5" />
													{g.student_ids?.length ?? 0}
												</span>
												<span className="inline-flex items-center gap-1">
													<Heart className="size-3.5" />
													{g.couple_ids?.length ?? 0}
												</span>
												<span>· {g.member_count} total</span>
											</p>
										</div>
										{isTrainer && (
											<div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
													onClick={() => openEdit(g)}
													aria-label="Edit group"
												>
													<Pencil className="size-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="size-8 text-destructive hover:text-destructive"
													onClick={() => handleDelete(g.id)}
													disabled={deletingId === g.id}
													aria-label="Delete group"
												>
													{deletingId === g.id ? (
														<Loader2 className="size-4 animate-spin" />
													) : (
														<Trash2 className="size-4" />
													)}
												</Button>
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Sheet open={!!detailGroup} onOpenChange={(open) => !open && setDetailGroup(null)}>
				<SheetContent side="right" className="flex flex-col">
					<SheetHeader>
						<SheetTitle>{detailGroup?.name ?? "Group"}</SheetTitle>
					</SheetHeader>
					{detailGroup && (() => {
						const groupAvailability = (detailGroup.availability ?? []) as AvailabilitySlot[]
						return (
						<div className="mt-6 flex flex-1 flex-col gap-6 overflow-y-auto">
							<div>
								<h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
									<Clock className="size-4" />
									Group availability
								</h4>
								<p className="text-muted-foreground text-xs mb-2">
									When all students and couples in this group are free (stored in database).
								</p>
								{groupAvailability.length === 0 ? (
									<p className="text-muted-foreground text-sm">No overlapping availability.</p>
								) : (
									<ul className="flex flex-wrap gap-2">
										{groupAvailability.map((slot, i) => (
											<li
												key={`${slot.day}-${slot.start}-${slot.end}-${i}`}
												className="rounded-md bg-muted/50 border border-border px-2 py-1.5 text-sm"
											>
												{formatSlot(slot)}
											</li>
										))}
									</ul>
								)}
							</div>
							<div>
								<h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
									<UserPlus className="size-4" />
									Students in this group
								</h4>
								{(detailGroup.student_ids?.length ?? 0) === 0 ? (
									<p className="text-muted-foreground text-sm">No students.</p>
								) : (
									<ul className="space-y-1.5">
										{(detailGroup.student_ids ?? [])
											.map((userId) => allStudents.find((s) => s.user_id === userId))
											.filter(Boolean)
											.map((s) => (
												<li
													key={s!.user_id}
													className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm font-medium"
												>
													{s!.full_name}
													{s!.age != null && (
														<span className="ml-2 text-muted-foreground font-normal">({s!.age}y)</span>
													)}
												</li>
											))}
									</ul>
								)}
							</div>
							<div>
								<h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
									<Heart className="size-4" />
									Couples in this group
								</h4>
								{(detailGroup.couple_ids?.length ?? 0) === 0 ? (
									<p className="text-muted-foreground text-sm">No couples.</p>
								) : (
									<ul className="space-y-1.5">
										{(detailGroup.couple_ids ?? [])
											.map((coupleId) => couples.find((c) => c.id === coupleId))
											.filter(Boolean)
											.map((c) => (
												<li
													key={c!.id}
													className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm font-medium"
												>
													{(c!.name ?? [c!.partner1_name, c!.partner2_name].filter(Boolean).join(" & ")) || "Unnamed couple"}
												</li>
											))}
									</ul>
								)}
							</div>
							{isTrainer && (
								<Button
									variant="outline"
									size="icon"
									className="shrink-0"
									onClick={() => {
										openEdit(detailGroup)
										setDetailGroup(null)
									}}
									aria-label="Edit group (add or remove people)"
								>
									<Pencil className="size-4" />
								</Button>
							)}
						</div>
						)
					})()}
				</SheetContent>
			</Sheet>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-h-[90dvh] max-w-lg flex flex-col overflow-hidden">
					<DialogHeader>
						<DialogTitle>{editingGroup ? "Edit group" : "Create group"}</DialogTitle>
						<DialogDescription>
							Set the group name and choose which students and couples to add. They can be in multiple groups.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
						<div className="grid gap-2">
							<Label htmlFor="group-name">Group name</Label>
							<Input
								id="group-name"
								value={formName}
								onChange={(e) => setFormName(e.target.value)}
								placeholder="e.g. Beginners, Competition A"
								className="rounded-lg"
							/>
						</div>

						<div className="grid gap-2">
							<Label className="flex items-center gap-2">
								<UserPlus className="size-4" />
								Students
							</Label>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
								<Input
									value={searchStudents}
									onChange={(e) => setSearchStudents(e.target.value)}
									placeholder="Search students…"
									className="h-9 rounded-lg pl-9"
									aria-label="Search students"
								/>
							</div>
							<div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
								{allStudents.length === 0 ? (
									<p className="text-muted-foreground text-sm">No students in the club.</p>
								) : filteredStudents.length === 0 ? (
									<p className="text-muted-foreground text-sm">No students match your search.</p>
								) : (
									filteredStudents.map((s) => (
										<label
											key={s.user_id}
											className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
										>
											<Checkbox
												checked={formStudentIds.has(s.user_id)}
												onCheckedChange={() => toggleStudent(s.user_id)}
											/>
											<span className="text-sm font-medium">{s.full_name}</span>
											{s.age != null && (
												<span className="text-muted-foreground text-xs">{s.age}y</span>
											)}
										</label>
									))
								)}
							</div>
						</div>

						<div className="grid gap-2">
							<Label className="flex items-center gap-2">
								<Heart className="size-4" />
								Couples
							</Label>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
								<Input
									value={searchCouples}
									onChange={(e) => setSearchCouples(e.target.value)}
									placeholder="Search couples…"
									className="h-9 rounded-lg pl-9"
									aria-label="Search couples"
								/>
							</div>
							<div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
								{couples.length === 0 ? (
									<p className="text-muted-foreground text-sm">No couples in the club.</p>
								) : filteredCouples.length === 0 ? (
									<p className="text-muted-foreground text-sm">No couples match your search.</p>
								) : (
									filteredCouples.map((c) => (
										<label
											key={c.id}
											className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
										>
											<Checkbox
												checked={formCoupleIds.has(c.id)}
												onCheckedChange={() => toggleCouple(c.id)}
											/>
											<span className="text-sm font-medium">
												{(c.name ?? [c.partner1_name, c.partner2_name].filter(Boolean).join(" & ")) || "Unnamed couple"}
											</span>
										</label>
									))
								)}
							</div>
						</div>
					</div>
					<DialogFooter className="shrink-0 flex-wrap gap-3 border-t pt-4">
						{editingGroup && (
							<Button
								variant="outline"
								className="mr-auto w-full sm:w-auto text-destructive border-destructive/50 hover:bg-destructive/10"
								onClick={() => handleDelete(editingGroup.id)}
								disabled={deletingId === editingGroup.id}
							>
								{deletingId === editingGroup.id ? (
									<Loader2 className="mr-2 size-4 animate-spin" />
								) : (
									<Trash2 className="mr-2 size-4" />
								)}
								Delete group
							</Button>
						)}
						<div className="flex w-full flex-wrap gap-3 sm:w-auto sm:flex-nowrap">
							<Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-initial">
								Cancel
							</Button>
							<Button onClick={handleSave} disabled={!formName.trim() || saving} className="flex-1 sm:flex-initial">
								{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
								{editingGroup ? "Save changes" : "Create group"}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
