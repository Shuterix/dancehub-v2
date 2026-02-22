import { Skeleton } from "@/components/ui/skeleton"

export default function AppLoading() {
	return (
		<div className="space-y-6 p-4 md:p-6">
			<div className="flex flex-wrap items-center gap-2">
				<Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
				<div className="space-y-2 min-w-0">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-72 max-w-full" />
				</div>
			</div>
			<div className="rounded-xl border border-border bg-muted/20 p-6 space-y-4">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-4 w-full max-w-md" />
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
					{[1, 2, 3, 4, 5, 6].map((i) => (
						<Skeleton key={i} className="h-28 w-full rounded-xl" />
					))}
				</div>
			</div>
		</div>
	)
}
