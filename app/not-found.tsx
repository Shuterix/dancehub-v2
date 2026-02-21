import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4">
			<h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
			<p className="max-w-sm text-center text-sm text-muted-foreground">
				The page you’re looking for doesn’t exist or has been moved.
			</p>
			<Button asChild>
				<Link href="/">Go to home</Link>
			</Button>
		</div>
	)
}
