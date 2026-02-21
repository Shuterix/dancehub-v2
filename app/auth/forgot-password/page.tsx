"use client"

import { useState } from "react"
import Link from "next/link"
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

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("")
	const [loading, setLoading] = useState(false)
	const [sent, setSent] = useState(false)
	const [error, setError] = useState("")

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError("")
		setLoading(true)
		try {
			const res = await fetch("/api/auth/forgot-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: email.trim() }),
			})
			const data = await res.json().catch(() => ({}))
			if (!res.ok) {
				setError(typeof data?.error === "string" ? data.error : "Something went wrong.")
				return
			}
			setSent(true)
		} catch {
			setError("Request failed. Please try again.")
		} finally {
			setLoading(false)
		}
	}

	if (sent) {
		return (
			<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle className="text-xl">Check your email</CardTitle>
						<CardDescription>
							If an account exists for that address, we sent a password reset link.
							Check your inbox and spam folder.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild className="w-full">
							<Link href="/auth/login">Back to sign in</Link>
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
					<CardTitle className="text-xl">Reset password</CardTitle>
					<CardDescription>
						Enter your email and we’ll send you a link to reset your password.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									placeholder="you@example.com"
									required
									autoComplete="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									disabled={loading}
								/>
							</Field>
							{error && <FieldError>{error}</FieldError>}
							<Button type="submit" className="w-full" disabled={loading}>
								{loading ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Sending…
									</>
								) : (
									"Send reset link"
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
