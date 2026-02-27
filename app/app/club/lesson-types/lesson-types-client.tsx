"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
	BookOpen,
	ChevronLeft,
	Plus,
	Loader2,
	Pencil,
	Trash2,
	UsersRound,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import type { LessonTypesPageData } from "@/lib/club-pages-data.types"

type GroupLessonType = {
	id: string
	group_id: string
	group_name: string
	name: string
	duration_minutes: number
}

type Group = { id: string; name: string }

export function ClubLessonTypesClient({ initialData }: { initialData: LessonTypesPageData }) {
	const [data, setData] = useState<LessonTypesPageData>(() => {
		return getPageCache<LessonTypesPageData>("app/club/lesson-types") ?? initialData
	})
	const [refreshing, setRefreshing] = useState(false)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editingType, setEditingType] = useState<GroupLessonType | null>(null)
	const [formGroupId, setFormGroupId] = useState("")
	const [formName, setFormName] = useState("")
	const [formDuration, setFormDuration] = useState("45")
	const [saving, setSaving] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)

	useEffect(() => {
		const cached = getPageCache<LessonTypesPageData>("app/club/lesson-types")
		if (!cached) {
			setPageCache("app/club/lesson-types", initialData)
		}
	}, [initialData])

	const types = data.group_lesson_types
	const groupOrder = data.groups

	const loadTypes = useCallback(() => {
		return fetch("/api/club/group-lesson-types")
			.then((res) => {
				if (res.status === 401 || res.status === 404) return null
				if (!res.ok) throw new Error("Failed to load lesson types")
				return res.json()
			})
			.then((json) => {
				if (json?.group_lesson_types) {
					setData((prev) => {
						const next = { ...prev, group_lesson_types: json.group_lesson_types }
						setPageCache("app/club/lesson-types", next)
						return next
					})
				}
			})
	}, [])

	async function handleRefresh() {
		setRefreshing(true)
		try {
			await loadTypes()
		} finally {
			setRefreshing(false)
		}
	}

	function openCreate() {
		setEditingType(null)
		setFormGroupId(groupOrder[0]?.id ?? "")
		setFormName("")
		setFormDuration("45")
		setDialogOpen(true)
	}

	function openEdit(t: GroupLessonType) {
		setEditingType(t)
		setFormGroupId(t.group_id)
		setFormName(t.name)
		setFormDuration(String(t.duration_minutes))
		setDialogOpen(true)
	}

	async function handleSubmit() {
		const name = formName.trim()
		if (!name) {
			toast.error("Lesson type name is required")
			return
		}
		const duration = parseInt(formDuration, 10)
		if (!Number.isInteger(duration) || duration < 1) {
			toast.error("Duration must be a positive number of minutes")
			return
		}
		if (!formGroupId && !editingType) {
			toast.error("Select a group")
			return
		}
		setSaving(true)
		try {
			if (editingType) {
				const res = await fetch(`/api/club/group-lesson-types/${editingType.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						group_id: formGroupId || undefined,
						name,
						duration_minutes: duration,
					}),
				})
				if (!res.ok) {
					const json = await res.json().catch(() => ({}))
					throw new Error(json.error ?? "Failed to update")
				}
				toast.success("Lesson type updated")
			} else {
				const res = await fetch("/api/club/group-lesson-types", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						group_id: formGroupId,
						name,
						duration_minutes: duration,
					}),
				})
				if (!res.ok) {
					const json = await res.json().catch(() => ({}))
					throw new Error(json.error ?? "Failed to create")
				}
				toast.success("Lesson type created")
			}
			setDialogOpen(false)
			loadTypes()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setSaving(false)
		}
	}

	async function handleDelete(typeId: string) {
		setDeletingId(typeId)
		try {
			const res = await fetch(`/api/club/group-lesson-types/${typeId}`, { method: "DELETE" })
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				toast.error(json.error ?? "Failed to delete")
				return
			}
			toast.success("Lesson type deleted")
			loadTypes()
			if (editingType?.id === typeId) setDialogOpen(false)
		} finally {
			setDeletingId(null)
		}
	}

	const byGroup = new Map<string, GroupLessonType[]>()
	for (const t of types) {
		if (!byGroup.has(t.group_id)) byGroup.set(t.group_id, [])
		byGroup.get(t.group_id)!.push(t)
	}
	const groupsWithTypes = groupOrder.filter((g) => byGroup.has(g.id))
	const groupsWithNoTypes = groupOrder.filter((g) => !byGroup.has(g.id))

	const { isTrainer } = data

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
						Group lesson types
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{types.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						{isTrainer
							? "Define lesson types per group (name and duration) for timetables and group lessons."
							: "Group lesson types define how long each kind of group lesson lasts."}
					</p>
				</div>
				<PageRefreshButton
					refreshing={refreshing}
					onRefresh={handleRefresh}
					aria-label="Refresh lesson types"
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<BookOpen className="size-5" />
						Lesson types by group
					</CardTitle>
					<CardDescription>
						{types.length === 0
							? "No group lesson types yet. Create groups first, then add lesson types (e.g. Adults Latin 90 min)."
							: `${types.length} lesson type${types.length === 1 ? "" : "s"} across ${groupsWithTypes.length} group${groupsWithTypes.length === 1 ? "" : "s"}.`}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isTrainer && (
						<Button
							onClick={openCreate}
							disabled={groupOrder.length === 0}
							className="cursor-pointer rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
						>
							<Plus className="mr-2 size-4" />
							Add lesson type
						</Button>
					)}

					{groupOrder.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Create groups in the <Link href="/app/club/groups" className="text-primary underline underline-offset-2">Groups</Link> section first.
						</p>
					) : types.length === 0 && !isTrainer ? (
						<p className="text-muted-foreground text-sm">No lesson types in this club yet.</p>
					) : (
						<div className="space-y-6">
							{groupsWithTypes.map((group) => (
								<div key={group.id} className="space-y-2">
									<h3 className="flex items-center gap-2 font-semibold text-foreground">
										<UsersRound className="size-4" />
										{group.name}
									</h3>
									<ul className="space-y-2 pl-6">
										{(byGroup.get(group.id) ?? []).map((t) => (
											<li
												key={t.id}
												className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
											>
												<div className="flex items-center gap-2">
													<span className="font-medium text-foreground">{t.name}</span>
													<span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
														<Clock className="size-3.5" />
														{t.duration_minutes} min
													</span>
												</div>
												{isTrainer && (
													<div className="flex gap-1">
														<Button
															variant="ghost"
															size="icon"
															className="size-8"
															onClick={() => openEdit(t)}
															aria-label="Edit"
														>
															<Pencil className="size-4" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															className="size-8 text-destructive hover:text-destructive"
															onClick={() => handleDelete(t.id)}
															disabled={deletingId === t.id}
															aria-label="Delete"
														>
															{deletingId === t.id ? (
																<Loader2 className="size-4 animate-spin" />
															) : (
																<Trash2 className="size-4" />
															)}
														</Button>
													</div>
												)}
											</li>
										))}
									</ul>
								</div>
							))}
							{groupsWithNoTypes.length > 0 && isTrainer && (
								<p className="text-muted-foreground text-sm">
									Groups with no lesson types yet: {groupsWithNoTypes.map((g) => g.name).join(", ")}. Add a lesson type and select one of them.
								</p>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{editingType ? "Edit lesson type" : "Add lesson type"}</DialogTitle>
						<DialogDescription>
							{editingType
								? "Change name, duration, or group."
								: "Assign a name and duration to a group (e.g. Adults Latin, 90 min)."}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<Label>Group</Label>
							<Select
								value={formGroupId}
								onValueChange={setFormGroupId}
							>
								<SelectTrigger className="cursor-pointer">
									<SelectValue placeholder="Select group" />
								</SelectTrigger>
								<SelectContent>
									{groupOrder.map((g) => (
										<SelectItem key={g.id} value={g.id} className="cursor-pointer">
											{g.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="lesson-type-name">Name</Label>
							<Input
								id="lesson-type-name"
								value={formName}
								onChange={(e) => setFormName(e.target.value)}
								placeholder="e.g. Adults Latin"
								className="cursor-pointer"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="lesson-type-duration">Duration (minutes)</Label>
							<Input
								id="lesson-type-duration"
								type="number"
								min={1}
								value={formDuration}
								onChange={(e) => setFormDuration(e.target.value)}
								className="cursor-pointer"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={saving}>
							{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
							{editingType ? "Save" : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
