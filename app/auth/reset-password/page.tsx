"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

export default function ResetPasswordPage() {
	const router = useRouter()
	const [ready, setReady] = useState(false)
	const [password, setPassword] = useState("")
	const [confirm, setConfirm] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState("")
	const [success, setSuccess] = useState(false)

	useEffect(() => {
		const supabase = createClient()
		// Let Supabase process the hash (access_token, type=recovery) and establish session
		supabase.auth.getSession().then(({ data: { session } }) => {
			const isRecovery = typeof window !== "undefined" && window.location.hash.includes("type=recovery")
			setReady(true)
			if (!isRecovery && !session) {
				setError("Invalid or expired reset link. Request a new one from the login page.")
			}
		})
	}, [])

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError("")
		if (password !== confirm) {
			setError("Passwords do not match.")
			return
		}
		if (password.length < 6) {
			setError("Password must be at least 6 characters.")
			return
		}
		setLoading(true)
		try {
			const supabase = createClient()
			const { error: updateError } = await supabase.auth.updateUser({ password })
			if (updateError) {
				setError(updateError.message)
				return
			}
			setSuccess(true)
			// Redirect to home so layout can send them to app or onboarding
			setTimeout(() => router.replace("/"), 1500)
		} catch {
			setError("Something went wrong. Please try again.")
		} finally {
			setLoading(false)
		}
	}

	if (!ready) {
		return (
			<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6">
				<div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
				<span className="sr-only">Loading…</span>
			</div>
		)
	}

	if (success) {
		return (
			<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-xl">Password updated</CardTitle>
						<CardDescription>
							Your password has been reset. Redirecting you to the app…
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild className="w-full">
							<Link href="/">Continue</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (error && !password) {
		return (
			<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-xl">Invalid link</CardTitle>
						<CardDescription>{error}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild className="w-full">
							<Link href="/auth/forgot-password">Request a new reset link</Link>
						</Button>
						<Button variant="ghost" asChild className="mt-2 w-full">
							<Link href="/auth/login">
								<ArrowLeft className="size-4" />
								Back to sign in
							</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-xl">Set new password</CardTitle>
					<CardDescription>
						Choose a new password for your account.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="password">New password</FieldLabel>
								<Input
									id="password"
									type="password"
									required
									minLength={6}
									autoComplete="new-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={loading}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
								<Input
									id="confirm"
									type="password"
									required
									minLength={6}
									autoComplete="new-password"
									value={confirm}
									onChange={(e) => setConfirm(e.target.value)}
									disabled={loading}
								/>
							</Field>
							{error && <FieldError>{error}</FieldError>}
							<Button type="submit" className="w-full" disabled={loading}>
								{loading ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Updating…
									</>
								) : (
									"Update password"
								)}
							</Button>
							<Button variant="ghost" asChild className="w-full">
								<Link href="/auth/login">
									<ArrowLeft className="size-4" />
									Back to sign in
								</Link>
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
