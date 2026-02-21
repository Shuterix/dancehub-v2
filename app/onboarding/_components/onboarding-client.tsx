"use client"

import { GraduationCap, Users, Building2, LogIn, Loader2, ArrowLeft, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type Step = "role" | "student-join" | "trainer-choose" | "trainer-create" | "trainer-join"

export function OnboardingClient({
	initialRole,
	initialClubId,
}: {
	initialRole: "student" | "trainer" | null
	initialClubId: string | null
}) {
	const router = useRouter()
	const [role, setRole] = useState<"student" | "trainer" | null>(initialRole)
	const [trainerChoice, setTrainerChoice] = useState<"create" | "join" | null>(null)
	const [code, setCode] = useState("")
	const [clubName, setClubName] = useState("")
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	if (initialClubId) {
		return null
	}

	const step: Step =
		role === null
			? "role"
			: role === "student"
				? "student-join"
				: trainerChoice === null
					? "trainer-choose"
					: trainerChoice === "create"
						? "trainer-create"
						: "trainer-join"

	async function handleSetRole(r: "student" | "trainer") {
		setError(null)
		setLoading(true)
		try {
			const res = await fetch("/api/onboarding/role", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role: r }),
			})
			const data = (await res.json()) as { error?: string }
			if (!res.ok) throw new Error(data.error ?? "Failed to save")
			setRole(r)
		} catch (e) {
			setError(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setLoading(false)
		}
	}

	async function handleJoinClub() {
		const trimmed = code.trim().toUpperCase()
		if (!trimmed) {
			setError("Enter a club code.")
			return
		}
		setError(null)
		setLoading(true)
		try {
			const res = await fetch("/api/onboarding/join", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code: trimmed }),
			})
			const data = (await res.json()) as { error?: string }
			if (!res.ok) throw new Error(data.error ?? "Failed to join")
			router.refresh()
			router.push("/app")
		} catch (e) {
			setError(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setLoading(false)
		}
	}

	async function handleCreateClub() {
		const name = clubName.trim()
		if (!name) {
			setError("Enter a club name.")
			return
		}
		setError(null)
		setLoading(true)
		try {
			const res = await fetch("/api/onboarding/create-club", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			})
			const data = (await res.json()) as { error?: string }
			if (!res.ok) throw new Error(data.error ?? "Failed to create club")
			router.refresh()
			router.push("/app")
		} catch (e) {
			setError(e instanceof Error ? e.message : "Something went wrong")
		} finally {
			setLoading(false)
		}
	}

	async function handleSignOut() {
		await fetch("/api/auth/signout", { method: "POST" })
		router.refresh()
		router.push("/auth/login")
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{step === "role" && "Welcome"}
					{step === "student-join" && "Join a club"}
					{step === "trainer-choose" && "Trainer"}
					{step === "trainer-create" && "Create your club"}
					{step === "trainer-join" && "Join a club"}
				</CardTitle>
				<CardDescription>
					{step === "role" && "Are you a student or a trainer?"}
					{step === "student-join" && "Enter the club code from your trainer or club."}
					{step === "trainer-choose" && "Create your own dance club or join an existing one with a code."}
					{step === "trainer-create" && "Give your club a name. You can add couples later."}
					{step === "trainer-join" && "Enter the club code to join as a trainer."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{error && (
					<p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm" role="alert">
						{error}
					</p>
				)}

				{step === "role" && (
					<FieldGroup className="grid gap-3 sm:grid-cols-2">
						<Button
							type="button"
							variant="outline"
							className="cursor-pointer h-auto flex-col gap-2 py-6"
							onClick={() => handleSetRole("student")}
							disabled={loading}
						>
							<GraduationCap className="size-8" />
							<span className="font-semibold">Student</span>
							<span className="text-muted-foreground text-xs font-normal">I train at a club</span>
						</Button>
						<Button
							type="button"
							variant="outline"
							className="cursor-pointer h-auto flex-col gap-2 py-6"
							onClick={() => handleSetRole("trainer")}
							disabled={loading}
						>
							<Users className="size-8" />
							<span className="font-semibold">Trainer</span>
							<span className="text-muted-foreground text-xs font-normal">I teach or run a club</span>
						</Button>
					</FieldGroup>
				)}

				{step === "student-join" && (
					<form
						onSubmit={(e) => {
							e.preventDefault()
							handleJoinClub()
						}}
						className="flex flex-col gap-4"
					>
						<Field>
							<FieldLabel htmlFor="code">Club code</FieldLabel>
							<Input
								id="code"
								type="text"
								placeholder="e.g. ABC123"
								value={code}
								onChange={(e) => setCode(e.target.value.toUpperCase())}
								maxLength={10}
								className="font-mono uppercase"
								disabled={loading}
							/>
						</Field>
						<div className="flex flex-wrap gap-2">
							<Button type="submit" disabled={loading} className="cursor-pointer">
								{loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
								Join club
							</Button>
							<Button
								type="button"
								variant="ghost"
								className="cursor-pointer"
								onClick={() => { setRole(null); setError(null) }}
								disabled={loading}
							>
								<ArrowLeft className="size-4" />
								Back
							</Button>
						</div>
					</form>
				)}

				{step === "trainer-choose" && (
					<div className="flex flex-col gap-4">
						<FieldGroup className="grid gap-3 sm:grid-cols-2">
							<Button
								type="button"
								variant="outline"
								className="cursor-pointer h-auto flex-col gap-2 py-6"
								onClick={() => setTrainerChoice("create")}
							>
								<Building2 className="size-8" />
								<span className="font-semibold">Create my club</span>
								<span className="text-muted-foreground text-xs font-normal">Start a new dance club</span>
							</Button>
							<Button
								type="button"
								variant="outline"
								className="cursor-pointer h-auto flex-col gap-2 py-6"
								onClick={() => setTrainerChoice("join")}
							>
								<LogIn className="size-8" />
								<span className="font-semibold">Join with code</span>
								<span className="text-muted-foreground text-xs font-normal">Join an existing club</span>
							</Button>
						</FieldGroup>
						<Button
							type="button"
							variant="ghost"
							className="cursor-pointer w-fit"
							onClick={() => { setRole(null); setTrainerChoice(null); setError(null) }}
						>
							<ArrowLeft className="size-4" />
							Back to role selection
						</Button>
					</div>
				)}

				{step === "trainer-create" && (
					<form
						onSubmit={(e) => {
							e.preventDefault()
							handleCreateClub()
						}}
						className="flex flex-col gap-4"
					>
						<Field>
							<FieldLabel htmlFor="club-name">Club name</FieldLabel>
							<Input
								id="club-name"
								type="text"
								placeholder="e.g. Star Dance Club"
								value={clubName}
								onChange={(e) => setClubName(e.target.value)}
								disabled={loading}
							/>
						</Field>
						<div className="flex flex-wrap gap-2">
							<Button type="submit" disabled={loading} className="cursor-pointer">
								{loading ? <Loader2 className="size-4 animate-spin" /> : null}
								Create club
							</Button>
							<Button
								type="button"
								variant="ghost"
								className="cursor-pointer"
								onClick={() => { setTrainerChoice(null); setError(null) }}
								disabled={loading}
							>
								<ArrowLeft className="size-4" />
								Back
							</Button>
						</div>
					</form>
				)}

				{step === "trainer-join" && (
					<form
						onSubmit={(e) => {
							e.preventDefault()
							handleJoinClub()
						}}
						className="flex flex-col gap-4"
					>
						<Field>
							<FieldLabel htmlFor="trainer-code">Club code</FieldLabel>
							<Input
								id="trainer-code"
								type="text"
								placeholder="e.g. ABC123"
								value={code}
								onChange={(e) => setCode(e.target.value.toUpperCase())}
								maxLength={10}
								className="font-mono uppercase"
								disabled={loading}
							/>
						</Field>
						<div className="flex flex-wrap gap-2">
							<Button type="submit" disabled={loading} className="cursor-pointer">
								{loading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
								Join club
							</Button>
							<Button
								type="button"
								variant="ghost"
								className="cursor-pointer"
								onClick={() => { setTrainerChoice(null); setError(null) }}
								disabled={loading}
							>
								<ArrowLeft className="size-4" />
								Back
							</Button>
						</div>
					</form>
				)}
				<div className="mt-6 border-t border-border pt-4">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="cursor-pointer text-muted-foreground hover:text-foreground"
						onClick={handleSignOut}
						disabled={loading}
					>
						<LogOut className="size-4" />
						Sign out
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
