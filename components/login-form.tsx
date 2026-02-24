'use client'

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { Loader2, GraduationCap, User } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

type LoginMode = "member" | "external"

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
	const router = useRouter()
	const searchParams = useSearchParams()
	const [mode, setMode] = useState<LoginMode>("member")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [accessCode, setAccessCode] = useState("")
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(false)
	const [googleLoading, setGoogleLoading] = useState(false)

	useEffect(() => {
		const err = searchParams.get("error")
		if (err) setError(decodeURIComponent(err))
	}, [searchParams])

	// After signup, when the login page shows \"check-email\" message, automatically refresh
	// the page when the user comes back from the verification tab.
	useEffect(() => {
		const message = searchParams.get("message")
		if (message !== "check-email") return

		const onFocus = () => {
			// Reload once when user returns, so session / verification status is up to date
			window.location.reload()
		}
		window.addEventListener("focus", onFocus)
		return () => window.removeEventListener("focus", onFocus)
	}, [searchParams])

	const handleMemberSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setLoading(true)
		setError("")
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			})
			const data = await response.json().catch(() => ({}))
			if (!response.ok) {
				if (response.status === 429) {
					toast.error(typeof data?.error === "string" ? data.error : "Too many attempts. Try again in a minute.")
				}
				throw new Error(typeof data?.error === "string" ? data.error : "Login failed")
			}
			router.replace("/onboarding")
		} catch (err) {
			setError(err instanceof Error ? err.message : "An unknown error occurred")
		} finally {
			setLoading(false)
		}
	}

	const handleExternalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setLoading(true)
		setError("")
		try {
			const response = await fetch("/api/auth/external-teacher-signin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: accessCode.trim() }),
			})
			const data = await response.json().catch(() => ({}))
			if (!response.ok) {
				throw new Error(typeof data?.error === "string" ? data.error : "Invalid access code")
			}
			router.replace("/app")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Invalid or expired code")
		} finally {
			setLoading(false)
		}
	}

	async function handleGoogleLogin() {
		setError("")
		setGoogleLoading(true)
		try {
			const supabase = createClient()
			const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
				provider: "google",
				options: {
					redirectTo: `${window.location.origin}/auth/callback`,
				},
			})
			if (oauthError) {
				setError(oauthError.message)
				return
			}
			if (data?.url) {
				window.location.href = data.url
				return
			}
		} catch {
			setError("Could not start Google sign-in")
		} finally {
			setGoogleLoading(false)
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader className="text-center">
					<CardTitle className="text-xl">Sign in to your account</CardTitle>
					<CardDescription>
						{mode === "member"
							? "Sign in with email or Google."
							: "Use the access code your club gave you."}
					</CardDescription>
					{/* Member / External toggle */}
					<div className="mt-4 flex gap-1.5 rounded-lg border border-border bg-muted/30 p-1">
						<button
							type="button"
							onClick={() => {
								setMode("member")
								setError("")
							}}
							className={cn(
								"flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
								mode === "member"
									? "bg-primary text-primary-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							)}
						>
							<User className="size-4 shrink-0" />
							Member
						</button>
						<button
							type="button"
							onClick={() => {
								setMode("external")
								setError("")
							}}
							className={cn(
								"flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
								mode === "external"
									? "bg-primary text-primary-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							)}
						>
							<GraduationCap className="size-4 shrink-0" />
							External
						</button>
					</div>
				</CardHeader>
				<CardContent>
					{mode === "member" ? (
						<form onSubmit={handleMemberSubmit}>
							<FieldGroup>
								<Field>
									<Button
										variant="outline"
										type="button"
										disabled={googleLoading}
										onClick={handleGoogleLogin}
									>
										{googleLoading ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
												<path
													d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
													fill="currentColor"
												/>
											</svg>
										)}
										{googleLoading ? "Redirecting…" : "Continue with Google"}
									</Button>
								</Field>
								<FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
									Or continue with
								</FieldSeparator>
								<Field>
									<FieldLabel htmlFor="email">Email</FieldLabel>
									<Input
										id="email"
										type="email"
										placeholder="example@email.com"
										required
										autoComplete="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
									/>
								</Field>
								<Field>
									<div className="flex items-center">
										<FieldLabel htmlFor="password">Password</FieldLabel>
										<Link
											href="/auth/forgot-password"
											className="ml-auto text-sm underline-offset-4 hover:underline"
										>
											Forgot your password?
										</Link>
									</div>
									<Input
										id="password"
										type="password"
										required
										autoComplete="current-password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
									/>
								</Field>
								<Field>
									<Button className="cursor-pointer" type="submit" disabled={loading}>
										{loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
									</Button>
									{error && <FieldError>{error}</FieldError>}
									<FieldDescription className="text-center">
										Don&apos;t have an account? <Link href="/auth/register">Create account</Link>
									</FieldDescription>
								</Field>
							</FieldGroup>
						</form>
					) : (
						<form onSubmit={handleExternalSubmit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="access-code">Access code</FieldLabel>
									<Input
										id="access-code"
										type="text"
										placeholder="Enter the code from your club"
										required
										autoComplete="one-time-code"
										value={accessCode}
										onChange={(e) => setAccessCode(e.target.value)}
										className="font-mono tracking-wider"
									/>
								</Field>
								<Field>
									<Button className="cursor-pointer" type="submit" disabled={loading}>
										{loading ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
									</Button>
									{error && <FieldError>{error}</FieldError>}
									<FieldDescription className="text-center">
										Only for external. Get a code from your club trainer.
									</FieldDescription>
								</Field>
							</FieldGroup>
						</form>
					)}
				</CardContent>
			</Card>
			<FieldDescription className="px-6 text-center">
				By continuing, you agree to our <Link href="/terms-of-service">Terms of Service</Link> and{" "}
				<Link href="/privacy-policy">Privacy Policy</Link>.
			</FieldDescription>
		</div>
	)
}