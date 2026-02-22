"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Shared skeleton for pages with back button + title + content area */
export function PageSkeleton({
	backHref,
	showBack = true,
	/** Only render content (grid or list), no header row - for inline use e.g. my-lessons */
	contentOnly = false,
	/** Grid of card placeholders (e.g. timetables list) */
	cardGridCount = 0,
	/** Single card with N row placeholders (e.g. students/trainers list) */
	cardRowCount = 0,
	/** Show a single large card (e.g. club dashboard) */
	singleCard = false,
}: {
	backHref: string
	showBack?: boolean
	contentOnly?: boolean
	cardGridCount?: number
	cardRowCount?: number
	singleCard?: boolean
}) {
	return (
		<div className="space-y-6">
			{!contentOnly && (
			<div className="flex flex-wrap items-center gap-2">
				{showBack && (
					<Button variant="ghost" size="icon" asChild className="shrink-0">
						<Link href={backHref} aria-label="Back">
							<ChevronLeft className="size-4" />
						</Link>
					</Button>
				)}
				<div className="min-w-0">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="mt-2 h-4 w-72 max-w-full" />
				</div>
			</div>
			)}

			{singleCard && (
				<Card>
					<CardHeader className="space-y-2">
						<Skeleton className="h-6 w-32" />
						<Skeleton className="h-4 w-full max-w-md" />
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex flex-wrap gap-3">
							<Skeleton className="h-10 w-24 rounded-xl" />
							<Skeleton className="h-10 w-24 rounded-xl" />
							<Skeleton className="h-10 w-24 rounded-xl" />
						</div>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{[1, 2, 3].map((i) => (
								<Skeleton key={i} className="h-28 w-full rounded-xl" />
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{cardGridCount > 0 && (
				<Card>
					<CardHeader className="space-y-2">
						<Skeleton className="h-6 w-28" />
						<Skeleton className="h-4 w-64" />
					</CardHeader>
					<CardContent className="space-y-4">
						<Skeleton className="h-10 w-36 rounded-xl" />
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{Array.from({ length: cardGridCount }).map((_, i) => (
								<Skeleton key={i} className="h-32 w-full rounded-xl p-4" />
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{cardRowCount > 0 && (
				<Card>
					<CardHeader className="space-y-2">
						<Skeleton className="h-6 w-28" />
						<Skeleton className="h-4 w-full max-w-md" />
					</CardHeader>
					<CardContent className="space-y-3">
						<Skeleton className="h-10 w-full max-w-xs rounded-md" />
						<div className="space-y-2">
							{Array.from({ length: cardRowCount }).map((_, i) => (
								<Skeleton key={i} className="h-14 w-full rounded-lg" />
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{!singleCard && cardGridCount === 0 && cardRowCount === 0 && (
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-40" />
						<Skeleton className="h-4 w-full max-w-sm" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-24 w-full rounded-lg" />
					</CardContent>
				</Card>
			)}
		</div>
	)
}

/** Skeleton for timetable detail: header + week picker + filters + grid/table */
export function TimetableDetailSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
					<div className="min-w-0 space-y-2">
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-4 w-36" />
					</div>
				</div>
				<Skeleton className="h-9 w-24 shrink-0 rounded-md" />
			</div>
			<div className="flex flex-col gap-2">
				<Skeleton className="h-10 w-full max-w-[12rem] rounded-md" />
				<div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
					<Skeleton className="h-4 w-16" />
					<div className="flex flex-wrap gap-2">
						{[1, 2, 3, 4, 5].map((i) => (
							<Skeleton key={i} className="h-7 w-20 rounded-md" />
						))}
					</div>
				</div>
				<div className="py-8 space-y-2">
					<Skeleton className="h-6 w-full rounded" />
					<Skeleton className="h-6 w-full rounded" />
					<Skeleton className="h-6 w-3/4 rounded" />
				</div>
			</div>
			<Card className="mt-6">
				<CardHeader className="space-y-2">
					<Skeleton className="h-6 w-36" />
					<Skeleton className="h-4 w-64" />
				</CardHeader>
				<CardContent className="space-y-4">
					{[1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-12 w-full rounded-lg" />
					))}
				</CardContent>
			</Card>
		</div>
	)
}

/** Inline skeleton for "loading lessons" in timetable detail */
export function LessonsLoadingSkeleton() {
	return (
		<div className="space-y-3 py-6">
			<div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
				<Skeleton className="h-4 w-20" />
				<div className="flex flex-wrap gap-2">
					{[1, 2, 3, 4].map((i) => (
						<Skeleton key={i} className="h-7 w-16 rounded-md" />
					))}
				</div>
			</div>
			<div className="grid gap-2 md:grid-cols-7">
				{Array.from({ length: 14 }).map((_, i) => (
					<Skeleton key={i} className="h-16 rounded-lg" />
				))}
			</div>
		</div>
	)
}
