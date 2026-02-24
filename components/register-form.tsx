'use client'

import { Loader2, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import owasp from "owasp-password-strength-test"

owasp.config({
	allowPassphrases: true,
	minLength: 8,
	minOptionalTestsToPass: 2,
})

export function RegisterForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	const router = useRouter()
	const [name, setName] = useState("")
	const [nameErrors, setNameErrors] = useState<string[]>([])
	const [email, setEmail] = useState("")
	const [emailErrors, setEmailErrors] = useState<string[]>([])

	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [passwordErrors, setPasswordErrors] = useState<string[]>([])
	const [confirmError, setConfirmError] = useState<string | null>(null)

	const [didSubmit, setDidSubmit] = useState(false)
	const [loading, setLoading] = useState(false)
	const [apiError, setApiError] = useState("")

	const validatePassword = (value: string) => {
		if (!value) {
			setPasswordErrors([])
			return
		}
		setPasswordErrors(owasp.test(value).errors)
	}

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setDidSubmit(true)
		setConfirmError(null)
		setApiError("")

		const result = owasp.test(password)
		if (!result.strong) {
			setPasswordErrors(result.errors)
			return
		}

		setPasswordErrors([])
		if (password !== confirmPassword) {
			setConfirmError("Passwords do not match.")
			return
		}

		// Allow international names with diacritics, spaces, hyphens and apostrophes
		if (!name.match(/^[\p{L}\s'-]+$/u)) {
			setNameErrors(["Please enter a valid name (letters only)."])
			return
		}
		if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
			setEmailErrors(["Please enter a valid email address."])
			return
		}

		setNameErrors([])
		setEmailErrors([])
		setLoading(true)

		try {
			const res = await fetch("/api/auth/signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password, full_name: name }),
			})
			const data = (await res.json()) as { error?: string; session?: boolean }
			if (!res.ok) {
				throw new Error(data.error ?? "Sign up failed")
			}
			// If email confirmation is enabled, user may not have session yet
			if (data.session) {
				router.replace("/app")
			} else {
				// Rich toast with quick links to common email providers
				toast.custom(
					() => (
						<div className="bg-background text-foreground border-border flex w-full max-w-sm flex-col gap-3 rounded-lg border p-3 shadow-lg">
							<div className="space-y-1">
								<p className="text-sm font-medium">Check your email</p>
								<p className="text-xs text-muted-foreground">
									We sent a confirmation link. Click it to activate your account, then return here to sign in.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => window.open("https://mail.google.com", "_blank", "noopener,noreferrer")}
								>
									<span>Gmail</span>
									<ExternalLink className="size-3.5" />
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => window.open("https://outlook.live.com/mail/0/", "_blank", "noopener,noreferrer")}
								>
									<span>Outlook</span>
									<ExternalLink className="size-3.5" />
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => window.open("https://mail.yahoo.com", "_blank", "noopener,noreferrer")}
								>
									<span>Yahoo</span>
									<ExternalLink className="size-3.5" />
								</Button>
							</div>
						</div>
					),
					{ duration: 12_000 }
				)
				// Short delay so the toast is visible before navigation
				setTimeout(() => router.replace("/auth/login?message=check-email"), 600)
			}
		} catch (err) {
			setApiError(err instanceof Error ? err.message : "An unknown error occurred")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader className="text-center">
					<CardTitle className="text-xl">Create your account</CardTitle>
					<CardDescription>
						Enter your email below to create your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="name">Full Name</FieldLabel>
								<Input
									id="name"
									name="name"
									type="text"
									placeholder="John Doe"
									value={name}
									onChange={(e) => {
										setName(e.target.value)
									}}
									required
									autoComplete="name"
									aria-invalid={didSubmit && !name.match(/^[\p{L}\s'-]+$/u)}
								/>
								{didSubmit && nameErrors.length > 0 && (
									<FieldError>
										<ul className="ml-4 list-disc space-y-0.5">
											{nameErrors.map((err, i) => (
												<li key={i}>{err}</li>
											))}
										</ul>
									</FieldError>
								)}
							</Field>
							<Field>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder="john.doe@example.com"
									value={email}
									onChange={(e) => {
										setEmail(e.target.value)
									}}
									required
									autoComplete="email"
									aria-invalid={didSubmit && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)}
								/>
								{didSubmit && emailErrors.length > 0 && (
									<FieldError>
										<ul className="ml-4 list-disc space-y-0.5">
											{emailErrors.map((err, i) => (
												<li key={i}>{err}</li>
											))}
										</ul>
									</FieldError>
								)}
							</Field>
							<Field data-invalid={passwordErrors.length > 0}>
								<Field className="grid grid-cols-2 gap-4">
									<Field>
										<FieldLabel htmlFor="password">Password</FieldLabel>
										<Input
											id="password"
											name="password"
											type="password"
											value={password}
											onChange={(e) => {
												setPassword(e.target.value)
											}}
											onBlur={() => {
												if (didSubmit) validatePassword(password)
											}}
											required
											autoComplete="new-password"
											aria-invalid={passwordErrors.length > 0}
										/>
									</Field>
									<Field data-invalid={!!confirmError}>
										<FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
										<Input
											id="confirm-password"
											name="confirm-password"
											type="password"
											value={confirmPassword}
											onChange={(e) => {
												setConfirmPassword(e.target.value)
												if (confirmError) setConfirmError(null)
											}}
											required
											autoComplete="new-password"
											aria-invalid={!!confirmError}
										/>
										{confirmError && <FieldError>{confirmError}</FieldError>}
									</Field>
								</Field>
								<FieldDescription>
									At least 8 characters; include uppercase, lowercase, number, and special character.
								</FieldDescription>
								{passwordErrors.length > 0 && (
									<FieldError>
										<ul className="ml-4 list-disc space-y-0.5">
											{passwordErrors.map((err, i) => (
												<li key={i}>{err}</li>
											))}
										</ul>
									</FieldError>
								)}
							</Field>
							<Field>
								<Button className="cursor-pointer" type="submit" disabled={loading}>
									{loading ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										"Create Account"
									)}
								</Button>
								{apiError && <FieldError>{apiError}</FieldError>}
								<FieldDescription className="text-center">
									Already have an account? <Link href="/auth/login">Sign in</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
			<FieldDescription className="px-6 text-center">
				By clicking continue, you agree to our <Link href="/terms-of-service">Terms of Service</Link>{" "}
				and <Link href="/privacy-policy">Privacy Policy</Link>.
			</FieldDescription>
		</div>
	)
}
