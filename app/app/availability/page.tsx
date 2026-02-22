"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, Clock, Plus, Trash2, Sun, SunDim, Moon, ChevronLeft } from "lucide-react"
import { PageSkeleton } from "@/app/app/_components/page-skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { AvailabilitySlot } from "@/lib/availability"
import { intersectAvailability, formatSlot } from "@/lib/availability"
import { cn } from "@/lib/utils"

type CoupleWithAvailability = {
	id: string
	partner1_user_id: string | null
	partner2_user_id: string | null
	partner1_name: string | null
	partner2_name: string | null
	partner1_availability: AvailabilitySlot[]
	partner2_availability: AvailabilitySlot[]
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const DAY_ABBREV = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

const QUICK_ADD_PRESETS: { label: string; start: string; end: string; icon: React.ReactNode }[] = [
	{ label: "Morning", start: "06:00", end: "12:00", icon: <Sun className="size-3.5" /> },
	{ label: "Afternoon", start: "12:00", end: "18:00", icon: <SunDim className="size-3.5" /> },
	{ label: "Evening", start: "18:00", end: "22:00", icon: <Moon className="size-3.5" /> },
]

function formatDay(day: string) {
	return day.charAt(0).toUpperCase() + day.slice(1)
}

function formatTimeHHmm(hhmm: string) {
	if (!hhmm) return "–"
	const [h, m] = hhmm.split(":").map(Number)
	return `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`
}

export default function AvailabilityPage() {
	const router = useRouter()
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [slots, setSlots] = useState<AvailabilitySlot[]>([])
	const [selectedDay, setSelectedDay] = useState<string>(DAYS[0])
	const [showCustomTime, setShowCustomTime] = useState(false)
	const [customStart, setCustomStart] = useState("09:00")
	const [customEnd, setCustomEnd] = useState("12:00")
	const [timeError, setTimeError] = useState<string | null>(null)
	const [partnerName, setPartnerName] = useState<string | null>(null)
	const [partnerAvailability, setPartnerAvailability] = useState<AvailabilitySlot[]>([])

	useEffect(() => {
		let cancelled = false
		Promise.all([
			fetch("/api/profile").then(async (res) => {
				if (res.status === 401) {
					toast.error("Session expired. Please sign in again.")
					router.replace("/auth/login")
					return null
				}
				return res.json() as Promise<{ profile?: { availability?: AvailabilitySlot[] } } | null>
			}),
			fetch("/api/auth/me").then((res) => (res.ok ? res.json() : null)) as Promise<{ user?: { id: string } } | null>,
			fetch("/api/club").then((res) => (res.ok ? res.json() : null)) as Promise<{ couples?: CoupleWithAvailability[] } | null>,
		])
			.then(([profileData, meData, clubData]) => {
				if (cancelled) return
				if (profileData?.profile?.availability && Array.isArray(profileData.profile.availability)) {
					setSlots(profileData.profile.availability)
				}
				const myId = meData?.user?.id
				const couples = clubData?.couples ?? []
				const myCouple = myId ? couples.find((c) => c.partner1_user_id === myId || c.partner2_user_id === myId) : null
				if (myCouple) {
					const isPartner1 = myCouple.partner1_user_id === myId
					setPartnerName(isPartner1 ? myCouple.partner2_name : myCouple.partner1_name)
					setPartnerAvailability(isPartner1 ? myCouple.partner2_availability ?? [] : myCouple.partner1_availability ?? [])
				} else {
					setPartnerName(null)
					setPartnerAvailability([])
				}
			})
			.catch(() => { if (!cancelled) setError("Failed to load availability") })
			.finally(() => { if (!cancelled) setLoading(false) })
		return () => { cancelled = true }
	}, [router])

	const slotsForSelectedDay = slots
		.map((slot, index) => ({ slot, index }))
		.filter(({ slot }) => slot.day === selectedDay)
	const hasSlotsForSelected = slotsForSelectedDay.length > 0
	const isValidCustomRange = customStart < customEnd

	function addSlot(day: string, start: string, end: string) {
		const exists = slots.some((s) => s.day === day && s.start === start && s.end === end)
		if (exists) return
		setSlots([...slots, { day, start, end }])
		setTimeError(null)
		setShowCustomTime(false)
		setCustomStart("09:00")
		setCustomEnd("12:00")
	}

	function addCustomSlot() {
		if (!isValidCustomRange) {
			setTimeError("End time must be after start time.")
			return
		}
		setTimeError(null)
		addSlot(selectedDay, customStart, customEnd)
	}

	function removeSlot(index: number) {
		setSlots(slots.filter((_, i) => i !== index))
	}

	function slotCountForDay(day: string) {
		return slots.filter((s) => s.day === day).length
	}

	const coupleAvailability = intersectAvailability(slots, partnerAvailability)

	async function handleSave() {
		setSaving(true)
		setError(null)
		try {
			const res = await fetch("/api/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ availability: slots }),
			})
			const json = (await res.json()) as { ok?: boolean; error?: string }
			if (!res.ok) throw new Error(json.error ?? "Failed to save")
			router.refresh()
			router.push("/app/profile")
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save")
		} finally {
			setSaving(false)
		}
	}

	if (loading) {
		return <PageSkeleton backHref="/app/profile" cardRowCount={8} />
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/app/profile" aria-label="Back to profile">
						<ChevronLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">Availability</h1>
					<p className="text-muted-foreground text-sm">
						Your slots and your couple&apos;s shared availability. Edit below to update.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Clock className="size-5" />
						Edit my availability
					</CardTitle>
					<CardDescription>
						Set the times when you <strong>can</strong> train. Pick a day, then add slots with presets or a custom time. Saving updates your profile and your couple&apos;s shared availability above.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-0">
					{/* Day picker */}
					<div className="grid grid-cols-7 gap-1.5">
						{DAYS.map((day, i) => {
							const count = slotCountForDay(day)
							const isSelected = selectedDay === day
							return (
								<button
									key={day}
									type="button"
									onClick={() => {
										setSelectedDay(day)
										setShowCustomTime(false)
										setTimeError(null)
									}}
									className={cn(
										"cursor-pointer flex flex-col items-center justify-center rounded-xl border py-3 text-center transition-colors",
										isSelected
											? "border-primary bg-primary text-primary-foreground shadow-sm"
											: "border-border bg-muted/40 text-foreground hover:bg-muted/70"
									)}
								>
									<span className="text-xs font-semibold uppercase tracking-wide">{DAY_ABBREV[i]}</span>
									<span className={cn("mt-0.5 text-[10px] font-medium", isSelected ? "text-primary-foreground/90" : "text-emerald-600 dark:text-emerald-400")}>
										{count === 0 ? "Free" : count === 1 ? "1 slot" : `${count} slots`}
									</span>
								</button>
							)
						})}
					</div>

					{/* Selected day panel */}
					<div className="mt-6">
						<h3 className="mb-2 text-sm font-semibold text-foreground">{formatDay(selectedDay)}</h3>
						<div
							className={cn(
								"rounded-xl border px-4 py-4",
								hasSlotsForSelected ? "border-border bg-card" : "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10"
							)}
						>
							{!hasSlotsForSelected ? (
								<>
									<p className="font-medium text-emerald-700 dark:text-emerald-400">Available all day</p>
									<p className="mt-1 text-xs text-muted-foreground">
										No slots set. Use a preset below or add a custom time to mark when you can train.
									</p>
								</>
							) : (
								<ul className="space-y-2">
									{slotsForSelectedDay.map(({ slot, index }) => (
										<li
											key={`${slot.start}-${slot.end}-${index}`}
											className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
										>
											<span className="tabular-nums text-foreground">
												{formatTimeHHmm(slot.start)} – {formatTimeHHmm(slot.end)}
											</span>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
												onClick={() => removeSlot(index)}
												aria-label="Remove slot"
											>
												<Trash2 className="size-4" />
											</Button>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>

					{/* Quick add presets */}
					<div className="mt-6">
						<p className="mb-2 text-xs font-medium text-muted-foreground">Quick add</p>
						<div className="flex flex-wrap gap-2">
							{QUICK_ADD_PRESETS.map((preset) => (
								<Button
									key={preset.label}
									type="button"
									variant="outline"
									size="sm"
									className="h-9 gap-1.5 rounded-full border-border px-3 text-xs font-medium"
									onClick={() => addSlot(selectedDay, preset.start, preset.end)}
								>
									{preset.icon}
									{preset.label}
								</Button>
							))}
						</div>
					</div>

					{/* Custom time */}
					<div className="mt-6">
						{!showCustomTime ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="gap-1.5 rounded-lg border-dashed"
								onClick={() => setShowCustomTime(true)}
							>
								<Plus className="size-4" />
								Add custom time block
							</Button>
						) : (
							<div className="rounded-lg border border-border bg-muted/20 p-3">
								<p className="mb-2 text-xs font-medium text-foreground">Custom time for {formatDay(selectedDay)}</p>
								<div className="flex flex-wrap items-end gap-2">
									<Field className="w-24">
										<FieldLabel className="text-xs text-muted-foreground">Start</FieldLabel>
										<Input
											type="time"
											value={customStart}
											onChange={(e) => {
												setCustomStart(e.target.value)
												setTimeError(null)
											}}
											className="h-9"
										/>
									</Field>
									<Field className="w-24">
										<FieldLabel className="text-xs text-muted-foreground">End</FieldLabel>
										<Input
											type="time"
											value={customEnd}
											onChange={(e) => {
												setCustomEnd(e.target.value)
												setTimeError(null)
											}}
											className="h-9"
										/>
									</Field>
									<div className="flex gap-1.5">
										<Button type="button" size="sm" onClick={addCustomSlot} disabled={!isValidCustomRange}>
											Add
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => {
												setShowCustomTime(false)
												setTimeError(null)
											}}
										>
											Cancel
										</Button>
									</div>
								</div>
								{timeError && <p className="mt-2 text-destructive text-xs">{timeError}</p>}
							</div>
						)}
					</div>

					{error && (
						<div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}

					<div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-6">
						<Button onClick={handleSave} disabled={saving}>
							{saving ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Saving…
								</>
							) : (
								"Save availability"
							)}
						</Button>
						<Button variant="outline" asChild>
							<Link href="/app/profile">Cancel</Link>
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* My availability summary */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Clock className="size-5" />
						My availability
					</CardTitle>
					<CardDescription>
						When you can train. Edit in the section below to change.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{slots.length === 0 ? (
						<p className="text-muted-foreground text-sm">No slots set yet. Add times in the editor below.</p>
					) : (
						<ul className="flex flex-wrap gap-2">
							{slots.map((slot, i) => (
								<li
									key={`${slot.day}-${slot.start}-${slot.end}-${i}`}
									className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground"
								>
									{formatDay(slot.day)} {formatTimeHHmm(slot.start)} – {formatTimeHHmm(slot.end)}
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>

			{/* Our couple's availability */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Clock className="size-5" />
						Our couple&apos;s availability
					</CardTitle>
					<CardDescription>
						{partnerName
							? `When you and ${partnerName} are both free. Updates when you save your availability.`
							: "When you and your partner are both free. Appears here once you're in a couple."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!partnerName ? (
						<p className="text-muted-foreground text-sm">You&apos;re not in a couple. Couple availability will appear here when you&apos;re paired.</p>
					) : coupleAvailability.length === 0 ? (
						<p className="text-muted-foreground text-sm">No overlapping times with your partner. Add or adjust your slots below to find common availability.</p>
					) : (
						<ul className="flex flex-wrap gap-2">
							{coupleAvailability.map((slot, i) => (
								<li
									key={`${slot.day}-${slot.start}-${slot.end}-${i}`}
									className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-foreground"
								>
									{formatSlot(slot)}
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
