"use client"

import { useEffect, useState } from "react"
import { Palette } from "lucide-react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

const THEME_PRESETS = [
	{ value: "default", label: "Default" },
	{ value: "ocean", label: "Ocean" },
	{ value: "sunset", label: "Sunset" },
	{ value: "forest", label: "Forest" },
	{ value: "lavender", label: "Lavender" },
	{ value: "slate", label: "Slate" },
	{ value: "rose", label: "Rose" },
] as const

const STORAGE_KEY = "app-theme-preset"

function getStored(): string {
	if (typeof window === "undefined") return "default"
	const v = window.localStorage.getItem(STORAGE_KEY) ?? "default"
	return THEME_PRESETS.some((p) => p.value === v) ? v : "default"
}

function applyPreset(value: string) {
	const html = document.documentElement
	THEME_PRESETS.forEach(({ value: v }) => {
		if (v !== "default") html.classList.remove(`theme-${v}`)
	})
	if (value && value !== "default") html.classList.add(`theme-${value}`)
}

export function ThemeSwitcher({ className }: { className?: string }) {
	const [mounted, setMounted] = useState(false)
	const [value, setValue] = useState("default")

	useEffect(() => {
		const stored = getStored()
		applyPreset(stored)
		queueMicrotask(() => {
			setValue(stored)
			setMounted(true)
		})
	}, [])

	function handleChange(newValue: string) {
		setValue(newValue)
		applyPreset(newValue)
		if (typeof window !== "undefined") {
			window.localStorage.setItem(STORAGE_KEY, newValue)
		}
	}

	const labelEl = (
		<label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-sidebar-foreground/80">
			<Palette className="size-3.5" />
			Theme preset
		</label>
	)

	// Render placeholder until mounted to avoid Radix ID hydration mismatch (aria-controls etc.)
	if (!mounted) {
		const label = THEME_PRESETS.find((p) => p.value === value)?.label ?? "Default"
		return (
			<div className={className}>
				{labelEl}
				<div
					className="flex h-9 w-full items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground"
					aria-hidden
				>
					{label}
				</div>
			</div>
		)
	}

	return (
		<div className={className}>
			{labelEl}
			<Select value={value} onValueChange={handleChange}>
				<SelectTrigger className="h-9 border-sidebar-border bg-sidebar text-sidebar-foreground">
					<SelectValue placeholder="Default" />
				</SelectTrigger>
				<SelectContent>
					{THEME_PRESETS.map((p) => (
						<SelectItem key={p.value} value={p.value}>
							{p.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}
