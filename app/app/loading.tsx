import { Skeleton } from "@/components/ui/skeleton"

export default function AppLoading() {
	return (
		<div className="space-y-6 p-4">
			<div className="space-y-2">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-72 max-w-full" />
			</div>
			<div className="flex flex-col gap-4">
				<Skeleton className="h-24 w-full rounded-xl" />
				<Skeleton className="h-32 w-full rounded-xl" />
			</div>
		</div>
	)
}
