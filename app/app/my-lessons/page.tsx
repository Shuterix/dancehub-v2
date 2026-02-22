"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Calendar, XCircle } from "lucide-react"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { Badge } from "@/components/ui/badge"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type LessonItem = {
	id: string
	lesson_type: string
	start_at: string
	end_at: string
	room_name: string | null
	trainer_name: string | null
	label: string
	is_trainer: boolean
	cancelled_at?: string | null
	cancellation_note?: string | null
}

function formatDate(d: string): string {
	try {
		const date = d.includes("T") ? new Date(d) : new Date(d + "T12:00:00")
		return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
	} catch {
		return d.slice(0, 10)
	}
}

function formatTimeRange(start: string, end: string): string {
	const s = start.slice(11, 16)
	const e = end.slice(11, 16)
	return `${s} – ${e}`
}

export default function MyLessonsPage() {
	const router = useRouter()
	const [lessons, setLessons] = useState<LessonItem[]>([])
	const [loading, setLoading] = useState(true)
	const [cancelLesson, setCancelLesson] = useState<LessonItem | null>(null)
	const [cancelNote, setCancelNote] = useState("")
	const [cancelling, setCancelling] = useState(false)

	const load = useCallback(() => {
		return fetch("/api/app/my-lessons")
			.then((res) => {
				if (res.status === 401) {
					toast.error("Session expired. Please sign in again.")
					router.push("/auth/login")
					return null
				}
				if (!res.ok) throw new Error("Failed to load lessons")
				return res.json()
			})
			.then((json: { lessons?: LessonItem[] }) => {
				if (json) setLessons(json.lessons ?? [])
			})
			.catch(() => setLessons([]))
	}, [router])

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		load().finally(() => {
			if (!cancelled) setLoading(false)
		})
		return () => {
			cancelled = true
		}
	}, [load])

	async function handleCancelConfirm() {
		if (!cancelLesson) return
		setCancelling(true)
		try {
			const res = await fetch(`/api/app/lessons/${cancelLesson.id}/cancel`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ note: cancelNote.trim() || undefined }),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok) {
				toast.error(json.error ?? "Failed to cancel lesson")
				return
			}
			toast.success("Lesson cancelled")
			setCancelLesson(null)
			setCancelNote("")
			load()
		} finally {
			setCancelling(false)
		}
	}

	return (
		<div className="flex flex-col gap-6 p-4 md:p-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">My lessons</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Your upcoming lessons. You can cancel with a short reason (as student or teacher).
				</p>
			</div>

			{loading ? (
				<PageSkeleton backHref="/app" contentOnly cardGridCount={6} />
			) : lessons.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Calendar className="size-5" />
							No upcoming lessons
						</CardTitle>
						<CardDescription>
							When you have lessons scheduled (as a student or trainer), they will appear here. You can cancel any of them with a note.
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{lessons.map((lesson) => {
						const isCancelled = !!lesson.cancelled_at
						return (
							<Card
								key={lesson.id}
								className={isCancelled ? "opacity-75 pointer-events-none" : undefined}
								aria-disabled={isCancelled}
							>
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between gap-2">
										<div>
											<div className="flex items-center gap-2 flex-wrap">
												<CardTitle className="text-base">{lesson.label}</CardTitle>
												{isCancelled && (
													<Badge variant="secondary" className="shrink-0 font-normal">
														Canceled
													</Badge>
												)}
											</div>
											<CardDescription className="mt-1">
												{formatDate(lesson.start_at)} · {formatTimeRange(lesson.start_at, lesson.end_at)}
											</CardDescription>
										</div>
										{!isCancelled && (
											<Button
												variant="ghost"
												size="icon"
												className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
												aria-label="Cancel lesson"
												onClick={() => {
													setCancelLesson(lesson)
													setCancelNote("")
												}}
											>
												<XCircle className="size-4" />
											</Button>
										)}
									</div>
								</CardHeader>
								<CardContent className="pt-0 text-sm text-muted-foreground">
									{lesson.trainer_name && (
										<p>
											{lesson.is_trainer ? "You (trainer)" : `Trainer: ${lesson.trainer_name}`}
										</p>
									)}
									{lesson.room_name && <p>Room: {lesson.room_name}</p>}
									<p className="capitalize">{lesson.lesson_type}</p>
									{isCancelled && lesson.cancellation_note && (
										<p className="mt-1 text-muted-foreground/90 italic">Reason: {lesson.cancellation_note}</p>
									)}
								</CardContent>
							</Card>
						)
					})}
				</ul>
			)}

			<Dialog open={!!cancelLesson} onOpenChange={(open) => !open && setCancelLesson(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Cancel lesson</DialogTitle>
						<DialogDescription>
							{cancelLesson && (
								<>
									{cancelLesson.label} on {formatDate(cancelLesson.start_at)} at{" "}
									{formatTimeRange(cancelLesson.start_at, cancelLesson.end_at)}. Add a reason (optional but recommended).
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2 py-2">
						<Label htmlFor="cancel-note">Reason for cancelling</Label>
						<Textarea
							id="cancel-note"
							placeholder="e.g. Illness, schedule conflict, …"
							value={cancelNote}
							onChange={(e) => setCancelNote(e.target.value)}
							rows={3}
							className="resize-none"
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCancelLesson(null)} disabled={cancelling}>
							Keep lesson
						</Button>
						<Button variant="destructive" onClick={handleCancelConfirm} disabled={cancelling}>
							{cancelling ? <Loader2 className="size-4 animate-spin" /> : null}
							{cancelling ? "Cancelling…" : "Cancel lesson"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
