"use client"

import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PageRefreshButtonProps = {
	refreshing?: boolean
	onRefresh?: () => void
	className?: string
	"aria-label"?: string
}

export function PageRefreshButton({
	refreshing = false,
	onRefresh,
	className,
	"aria-label": ariaLabel = "Refresh page",
}: PageRefreshButtonProps) {
	const router = useRouter()

	const handleClick = () => {
		if (onRefresh) {
			onRefresh()
		} else {
			router.refresh()
		}
	}

	return (
		<Button
			variant="outline"
			size="sm"
			className={cn("gap-2 shrink-0", className)}
			onClick={handleClick}
			disabled={refreshing}
			aria-label={ariaLabel}
		>
			<RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
			{refreshing ? "Refreshing…" : "Refresh"}
		</Button>
	)
}
