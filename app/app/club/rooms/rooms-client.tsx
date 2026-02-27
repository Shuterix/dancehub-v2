"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
	DoorOpen,
	ChevronLeft,
	Plus,
	Loader2,
	Pencil,
	Trash2,
	GraduationCap,
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
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { RoomsPageData } from "@/lib/club-pages-data.types"

type Room = { id: string; name: string; teacher_ids: string[] }

export function ClubRoomsClient({ initialData }: { initialData: RoomsPageData }) {
	const [data, setData] = useState<RoomsPageData>(() => {
		return getPageCache<RoomsPageData>("app/club/rooms") ?? initialData
	})
	const [refreshing, setRefreshing] = useState(false)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editingRoom, setEditingRoom] = useState<Room | null>(null)
	const [formName, setFormName] = useState("")
	const [formTeacherIds, setFormTeacherIds] = useState<Set<string>>(new Set())
	const [saving, setSaving] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)

	useEffect(() => {
		const cached = getPageCache<RoomsPageData>("app/club/rooms")
		if (!cached) {
			setPageCache("app/club/rooms", initialData)
		}
	}, [initialData])

	const { clubData, rooms } = (() => {
		const clubData = {
			club: data.club,
			isTrainer: data.isTrainer,
			allTrainers: data.allTrainers,
		}
		return { clubData, rooms: data.rooms }
	})()

	function openCreate() {
		setEditingRoom(null)
		setFormName("")
		setFormTeacherIds(new Set())
		setDialogOpen(true)
	}

	function openEdit(room: Room) {
		setEditingRoom(room)
		setFormName(room.name)
		setFormTeacherIds(new Set(room.teacher_ids))
		setDialogOpen(true)
	}

	const loadRooms = useCallback(() => {
		return fetch("/api/club/rooms")
			.then((res) => {
				if (res.status === 401 || res.status === 404) return null
				if (!res.ok) throw new Error("Failed to load rooms")
				return res.json()
			})
			.then((json) => {
				if (json?.rooms) {
					setData((prev) => {
						const next = { ...prev, rooms: json.rooms }
						setPageCache("app/club/rooms", next)
						return next
					})
				}
			})
	}, [])

	async function handleRefresh() {
		setRefreshing(true)
		try {
			await loadRooms()
		} finally {
			setRefreshing(false)
		}
	}

	async function handleSubmit() {
		const name = formName.trim()
		if (!name) {
			toast.error("Room name is required")
			return
		}
		setSaving(true)
		try {
			if (editingRoom) {
				const res = await fetch(`/api/club/rooms/${editingRoom.id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, teacher_ids: Array.from(formTeacherIds) }),
				})
				if (!res.ok) {
					const json = await res.json().catch(() => ({}))
					throw new Error(json.error ?? "Failed to update room")
				}
				toast.success("Room updated")
			} else {
				const res = await fetch("/api/club/rooms", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name }),
				})
				if (!res.ok) {
					const json = await res.json().catch(() => ({}))
					throw new Error(json.error ?? "Failed to create room")
				}
				toast.success("Room created")
			}
			setDialogOpen(false)
			loadRooms()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setSaving(false)
		}
	}

	async function handleDelete(roomId: string) {
		setDeletingId(roomId)
		try {
			const res = await fetch(`/api/club/rooms/${roomId}`, { method: "DELETE" })
			if (!res.ok) {
				const json = await res.json().catch(() => ({}))
				toast.error(json.error ?? "Failed to delete room")
				return
			}
			toast.success("Room deleted")
			loadRooms()
			if (editingRoom?.id === roomId) setDialogOpen(false)
		} finally {
			setDeletingId(null)
		}
	}

	const { isTrainer, allTrainers } = clubData

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
						Rooms
						<span className="inline-flex min-w-7 items-center justify-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary ring-1 ring-primary/20">
							{rooms.length}
						</span>
					</h1>
					<p className="text-muted-foreground text-sm">
						{isTrainer
							? "Manage rooms and assign trainers. Used for timetables and group lessons."
							: "Rooms in your club. Trainers are assigned to rooms for lessons."}
					</p>
				</div>
				<PageRefreshButton
					refreshing={refreshing}
					onRefresh={handleRefresh}
					aria-label="Refresh rooms"
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<DoorOpen className="size-5" />
						Rooms
					</CardTitle>
					<CardDescription>
						{rooms.length === 0
							? "No rooms yet."
							: `${rooms.length} room${rooms.length === 1 ? "" : "s"}. ${isTrainer ? "Assign trainers to rooms for timetable generation." : ""}`}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isTrainer && (
						<Button
							onClick={openCreate}
							className="cursor-pointer rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:brightness-110 active:scale-[0.98]"
						>
							<Plus className="mr-2 size-4" />
							Add room
						</Button>
					)}

					{rooms.length === 0 && !isTrainer ? (
						<p className="text-muted-foreground text-sm">No rooms in this club yet.</p>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{rooms.map((room) => (
								<div
									key={room.id}
									className={cn(
										"flex flex-col rounded-xl border border-border bg-muted/30 p-4 transition-colors",
										"hover:bg-muted/50"
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0 flex-1">
											<h3 className="font-semibold text-foreground truncate" title={room.name}>
												{room.name}
											</h3>
											<p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-sm">
												<GraduationCap className="size-3.5" />
												{room.teacher_ids.length} trainer{room.teacher_ids.length !== 1 ? "s" : ""} assigned
											</p>
										</div>
										{isTrainer && (
											<div className="flex shrink-0 gap-1">
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
													onClick={() => openEdit(room)}
													aria-label="Edit room"
												>
													<Pencil className="size-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="size-8 text-destructive hover:text-destructive"
													onClick={() => handleDelete(room.id)}
													disabled={deletingId === room.id}
													aria-label="Delete room"
												>
													{deletingId === room.id ? (
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

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{editingRoom ? "Edit room" : "Add room"}</DialogTitle>
						<DialogDescription>
							{editingRoom
								? "Change the name or assign trainers who can teach in this room."
								: "Create a new room. You can assign trainers after creating."}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<Label htmlFor="room-name">Room name</Label>
							<Input
								id="room-name"
								value={formName}
								onChange={(e) => setFormName(e.target.value)}
								placeholder="e.g. Main hall"
								className="cursor-pointer"
							/>
						</div>
						{editingRoom && allTrainers.length > 0 && (
							<div className="space-y-2">
								<Label>Trainers assigned to this room</Label>
								<p className="text-muted-foreground text-xs">
									Only assigned trainers can be scheduled in this room.
								</p>
								<div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
									{allTrainers.map((t) => (
										<label
											key={t.user_id}
											className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
										>
											<Checkbox
												checked={formTeacherIds.has(t.user_id)}
												onCheckedChange={(checked) => {
													setFormTeacherIds((prev) => {
														const next = new Set(prev)
														if (checked) next.add(t.user_id)
														else next.delete(t.user_id)
														return next
													})
												}}
											/>
											<span className="text-sm">{t.full_name}</span>
										</label>
									))}
								</div>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={saving}>
							{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
							{editingRoom ? "Save" : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
