"use client"

import { Loader2, User as UserIcon, Phone, Award, Calendar, Users, Clock, CalendarDays } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type AvailabilitySlot = { day: string; start: string; end: string }

function formatDay(day: string) {
	return day.charAt(0).toUpperCase() + day.slice(1)
}

function formatTimeHHmm(hhmm: string) {
	if (!hhmm) return "–"
	const [h, m] = hhmm.split(":").map(Number)
	return `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`
}

const CATEGORIES = ["E", "D", "C", "B", "A", "S"] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_STYLES: Record<Category, string> = {
	E: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40",
	D: "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/40",
	C: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40",
	B: "bg-lime-500/20 text-lime-700 dark:text-lime-400 border-lime-500/40",
	A: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
	S: "bg-violet-500/20 text-violet-200 dark:text-violet-300 border-violet-400/50",
}

function CategoryBadge({ category }: { category: Category }) {
	return (
		<span
			className={cn(
				"inline-flex size-9 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums",
				CATEGORY_STYLES[category]
			)}
		>
			{category}
		</span>
	)
}

function isValidCategory(v: string): v is Category {
	return CATEGORIES.includes(v as Category)
}

export function ProfileForm() {
	const router = useRouter()
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [apiError, setApiError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)

	const [fullName, setFullName] = useState("")
	const [email, setEmail] = useState("")
	const [phone, setPhone] = useState("")
	const [dateOfBirth, setDateOfBirth] = useState("")
	const [dancePartner, setDancePartner] = useState("")
	const [rankStandard, setRankStandard] = useState<Category | null>(null)
	const [rankLatin, setRankLatin] = useState<Category | null>(null)
	const [profileRole, setProfileRole] = useState<"student" | "trainer" | null>(null)
	const [createdAt, setCreatedAt] = useState<string | null>(null)
	const [availability, setAvailability] = useState<AvailabilitySlot[]>([])

	const [nameError, setNameError] = useState<string | null>(null)
	const [emailError, setEmailError] = useState<string | null>(null)
	const [phoneError, setPhoneError] = useState<string | null>(null)
	const [saveHighlight, setSaveHighlight] = useState(false)

	const isDirtyRef = useRef(false)
	const saveSectionRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		async function load() {
			const res = await fetch("/api/auth/me")
			if (!res.ok) {
				if (res.status === 401) {
					router.replace("/auth/login")
					return
				}
				setApiError("Failed to load profile.")
				setLoading(false)
				return
			}
			const data = (await res.json()) as {
				user: { email: string | null; created_at?: string; user_metadata?: Record<string, unknown> }
				profile: {
					full_name: string | null
					phone: string | null
					dance_partner: string | null
					date_of_birth?: string | null
					rank_standard?: string
					rank_latin?: string
					role?: string
					availability?: AvailabilitySlot[]
				} | null
			}
			const { user, profile } = data
			setEmail(user.email ?? "")
			setCreatedAt(user.created_at ?? null)
			if (profile) {
				setFullName(profile.full_name ?? "")
				setPhone(profile.phone ?? "")
				setDateOfBirth(profile.date_of_birth ?? "")
				setDancePartner(profile.dance_partner ?? "")
				const std = profile.rank_standard ?? ""
				const lat = profile.rank_latin ?? ""
				setRankStandard(isValidCategory(std) ? (std as Category) : null)
				setRankLatin(isValidCategory(lat) ? (lat as Category) : null)
				setProfileRole(profile.role === "student" || profile.role === "trainer" ? profile.role : null)
				setAvailability(Array.isArray(profile.availability) ? profile.availability : [])
			} else {
				const meta = user.user_metadata as Record<string, unknown> | undefined
				setFullName((meta?.full_name as string) ?? "")
				setPhone((meta?.phone as string) ?? "")
				setDateOfBirth((meta?.date_of_birth as string) ?? "")
				setDancePartner((meta?.dance_partner as string) ?? "")
				setRankStandard(isValidCategory(meta?.rank_standard as string) ? (meta?.rank_standard as Category) : null)
				setRankLatin(isValidCategory(meta?.rank_latin as string) ? (meta?.rank_latin as Category) : null)
				setProfileRole(meta?.role === "student" || meta?.role === "trainer" ? (meta?.role as "student" | "trainer") : null)
				setAvailability([])
			}
			setLoading(false)
		}
		load()
		// eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
	}, [])

	function validate(): boolean {
		let ok = true
		setNameError(null)
		setEmailError(null)
		setPhoneError(null)
		if (!fullName.trim()) {
			setNameError("Name is required.")
			ok = false
		}
		if (!email.trim()) {
			setEmailError("Email is required.")
			ok = false
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			setEmailError("Enter a valid email address.")
			ok = false
		}
		if (phone.trim() && !/^[+]?[\d\s()-]{10,}$/.test(phone)) {
			setPhoneError("Enter a valid phone number.")
			ok = false
		}
		return ok
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setApiError(null)
		setSuccess(false)
		if (!validate()) return
		setSaving(true)
		try {
			const res = await fetch("/api/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					full_name: fullName.trim(),
					email: email.trim(),
					phone: phone.trim() || null,
					date_of_birth: dateOfBirth.trim() || null,
					...(profileRole === "trainer" && { dance_partner: dancePartner.trim() || null }),
				}),
			})
			const json = (await res.json()) as { ok?: boolean; error?: string }
			if (!res.ok) throw new Error(json.error ?? "Failed to save")
			setSuccess(true)
			isDirtyRef.current = false
			router.refresh()
		} catch (err) {
			setApiError(err instanceof Error ? err.message : "Something went wrong.")
		} finally {
			setSaving(false)
		}
	}

	function markDirty() {
		isDirtyRef.current = true
	}

	function handleBlurScrollToSave() {
		if (!isDirtyRef.current || !saveSectionRef.current) return
		if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) return
		saveSectionRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
		setSaveHighlight(true)
		setTimeout(() => setSaveHighlight(false), 2500)
	}

	if (loading) {
		return (
			<div className="flex min-h-[40vh] items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
			</div>
		)
	}

	return (
		<form id="profile-form" onSubmit={handleSubmit} className="relative">
			{/* Sticky Save bar: visible on mobile/tablet so users don't have to scroll to the bottom */}
			<div className="sticky top-0 z-10 flex lg:hidden -mx-4 px-4 py-3 mb-4 rounded-b-xl border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 shadow-sm">
				<div className="flex w-full items-center justify-end gap-2">
					{apiError && <span className="text-destructive text-sm truncate mr-auto">{apiError}</span>}
					{success && <span className="text-emerald-600 text-sm dark:text-emerald-400 mr-auto">Saved.</span>}
					<Button type="submit" disabled={saving} className="shrink-0">
						{saving ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								Saving…
							</>
						) : (
							"Save changes"
						)}
					</Button>
				</div>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{/* Role card (Student / Trainer) – name, email, rank */}
				<Card className="sm:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<UserIcon className="size-5" />
							{profileRole === "trainer" ? "Trainer" : profileRole === "student" ? "Student" : "Personal"}
						</CardTitle>
						<CardDescription>Your name and email.</CardDescription>
					</CardHeader>
					<CardContent>
						<FieldGroup className="gap-4">
							<Field>
								<FieldLabel htmlFor="name">Full name</FieldLabel>
								<Input
									id="name"
									type="text"
									placeholder="e.g. Alex Smith"
									value={fullName}
									onChange={(e) => {
										markDirty()
										setFullName(e.target.value)
									}}
									onBlur={handleBlurScrollToSave}
									autoComplete="name"
									className="border-input bg-background"
									aria-invalid={!!nameError}
								/>
								{nameError && <FieldError>{nameError}</FieldError>}
							</Field>
							<Field>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									type="email"
									placeholder="you@example.com"
									value={email}
									onChange={(e) => {
										markDirty()
										setEmail(e.target.value)
									}}
									onBlur={handleBlurScrollToSave}
									autoComplete="email"
									className="border-input bg-background"
									aria-invalid={!!emailError}
								/>
								{emailError && <FieldError>{emailError}</FieldError>}
								<p className="text-muted-foreground text-sm">Changing email may require a new sign-in.</p>
							</Field>
							<div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
								<span className="text-muted-foreground text-sm font-medium">Rank</span>
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-muted-foreground text-xs">Standard</span>
									{rankStandard != null ? <CategoryBadge category={rankStandard} /> : <span className="text-muted-foreground text-sm">–</span>}
									<span className="text-muted-foreground text-xs">Latin</span>
									{rankLatin != null ? <CategoryBadge category={rankLatin} /> : <span className="text-muted-foreground text-sm">–</span>}
								</div>
								<p className="w-full text-muted-foreground text-xs">Set by the club.</p>
							</div>
						</FieldGroup>
					</CardContent>
				</Card>

				{/* Contact – Phone */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<Phone className="size-5" />
							Phone
						</CardTitle>
						<CardDescription>Your phone number.</CardDescription>
					</CardHeader>
					<CardContent>
						<Field>
							<FieldLabel htmlFor="phone">Phone number</FieldLabel>
							<Input
								id="phone"
								type="tel"
								placeholder="+1 (555) 000-0000"
								value={phone}
								onChange={(e) => {
									markDirty()
									setPhone(e.target.value)
								}}
								onBlur={handleBlurScrollToSave}
								autoComplete="tel"
								className="border-input bg-background"
								aria-invalid={!!phoneError}
							/>
							{phoneError && <FieldError>{phoneError}</FieldError>}
						</Field>
					</CardContent>
				</Card>

				{/* Date of birth */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<CalendarDays className="size-5" />
							Date of birth
						</CardTitle>
						<CardDescription>Used to show your age in the club. Optional.</CardDescription>
					</CardHeader>
					<CardContent>
						<Field>
							<FieldLabel htmlFor="date-of-birth">Birth date</FieldLabel>
							<Input
								id="date-of-birth"
								type="date"
								value={dateOfBirth}
								onChange={(e) => {
									markDirty()
									setDateOfBirth(e.target.value)
								}}
								onBlur={handleBlurScrollToSave}
								max={new Date().toISOString().slice(0, 10)}
								className="border-input bg-background"
							/>
						</Field>
					</CardContent>
				</Card>

				{/* Dance partner – only for students, read-only */}
				{profileRole === "student" && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-xl">
								<Users className="size-5" />
								Dance partner
							</CardTitle>
							<CardDescription>Your regular dance partner. Set by your trainer or club.</CardDescription>
						</CardHeader>
						<CardContent>
							<Field>
								<FieldLabel htmlFor="dance-partner">Partner name</FieldLabel>
								{!dancePartner.trim() ? (
									<div
										id="dance-partner"
										className="cursor-default rounded-md border border-input bg-muted/50 px-3 py-2 text-muted-foreground outline-none focus:outline-none focus:ring-0"
										tabIndex={-1}
									>
										No partner has been assigned yet.
									</div>
								) : (
									<Input
										id="dance-partner"
										type="text"
										value={dancePartner}
										readOnly
										className="cursor-default border-input bg-muted/50 text-foreground outline-none focus:outline-none focus:ring-0"
										aria-readonly="true"
									/>
								)}
							</Field>
						</CardContent>
					</Card>
				)}

				{/* Availability */}
				<Card className="sm:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<Clock className="size-5" />
							Training availability
						</CardTitle>
						<CardDescription>When you can train. Add time slots for each day.</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						{availability.length === 0 ? (
							<p className="text-muted-foreground text-sm">No slots set. Add your preferred training times.</p>
						) : (
							<ul className="flex flex-wrap gap-2 text-sm">
								{availability.map((slot, i) => (
									<li
										key={`${slot.day}-${slot.start}-${slot.end}-${i}`}
										className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-muted-foreground"
									>
										{formatDay(slot.day)} {formatTimeHHmm(slot.start)} – {formatTimeHHmm(slot.end)}
									</li>
								))}
							</ul>
						)}
						<Button type="button" variant="outline" className="w-fit" asChild>
							<Link href="/app/availability">
								<Clock className="size-4" />
								Edit availability
							</Link>
						</Button>
					</CardContent>
				</Card>

				{/* Ranks (read-only: Standard & Latin) */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<Award className="size-5" />
							Your rank
						</CardTitle>
						<CardDescription>Set by the club. Not editable. E = lowest, S = highest.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap items-center gap-3">
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs font-medium">Standard</span>
								{rankStandard != null ? <CategoryBadge category={rankStandard} /> : <span className="text-muted-foreground text-sm">–</span>}
							</div>
							<div className="flex flex-col gap-1">
								<span className="text-muted-foreground text-xs font-medium">Latin</span>
								{rankLatin != null ? <CategoryBadge category={rankLatin} /> : <span className="text-muted-foreground text-sm">–</span>}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Rank scale */}
				<Card className="sm:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<Award className="size-5" />
							Rank scale
						</CardTitle>
						<CardDescription>All categories from E (lowest) to S (best).</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap items-center gap-2">
							{CATEGORIES.map((c) => (
								<CategoryBadge key={c} category={c} />
							))}
						</div>
					</CardContent>
				</Card>

				{/* Account */}
				<Card className="sm:col-span-2 lg:col-span-3">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-xl">
							<Calendar className="size-5" />
							Account
						</CardTitle>
						<CardDescription>Account details.</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="text-sm">
							{createdAt && (
								<p className="text-muted-foreground">
									Member since{" "}
									<time dateTime={createdAt}>
										{new Date(createdAt).toLocaleDateString(undefined, {
											year: "numeric",
											month: "long",
											day: "numeric",
										})}
									</time>
								</p>
							)}
						</div>
						<div ref={saveSectionRef} className="flex flex-col gap-2">
							{apiError && <FieldError>{apiError}</FieldError>}
							{success && (
								<p className="text-emerald-600 text-sm dark:text-emerald-400">Profile saved successfully.</p>
							)}
							<Button
								type="submit"
								disabled={saving}
								className={cn(
									saveHighlight && "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse"
								)}
							>
								{saving ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Saving…
									</>
								) : (
									"Save changes"
								)}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</form>
	)
}
