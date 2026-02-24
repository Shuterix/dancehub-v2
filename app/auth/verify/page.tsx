'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

export default function VerifyPage() {
	const router = useRouter()

	// If the user opened this in the same tab as the app, offer a soft way back
	useEffect(() => {
		// After a short delay, suggest navigating to login if they stay here
		const id = setTimeout(() => {
			// Do nothing automatically; user can choose the button below
		}, 5000)
		return () => clearTimeout(id)
	}, [])

	return (
		<div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6">
			<div className="bg-background border-border flex max-w-md flex-col items-center gap-4 rounded-xl border p-6 text-center shadow-sm">
				<CheckCircle2 className="text-emerald-500 size-10" aria-hidden />
				<h1 className="text-xl font-semibold tracking-tight">Email verified</h1>
				<p className="text-muted-foreground text-sm">
					Your email has been successfully confirmed. You can now return to the tab where you signed up or
					simply continue to sign in.
				</p>
				<button
					type="button"
					onClick={() => router.replace("/auth/login")}
					className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors"
				>
					Go to sign in
				</button>
				<p className="text-muted-foreground text-xs">
					If you still have the original tab open, just switch back to it – it will refresh after verification.
				</p>
			</div>
		</div>
	)
}

