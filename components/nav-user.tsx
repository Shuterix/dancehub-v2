"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavUser() {
	const [name, setName] = useState<string | null>(null)
	const [rankStandard, setRankStandard] = useState<string | null>(null)
	const [rankLatin, setRankLatin] = useState<string | null>(null)
	const router = useRouter()

	useEffect(() => {
		fetch("/api/auth/me")
			.then((res) => (res.ok ? res.json() : null))
			.then((data: {
				user?: { user_metadata?: { full_name?: string }; email?: string }
				profile?: { rank_standard?: string; rank_latin?: string }
			} | null) => {
				if (!data?.user) return
				setName(data.user.user_metadata?.full_name ?? data.user.email ?? "User")
				if (data.profile) {
					setRankStandard(data.profile.rank_standard ?? null)
					setRankLatin(data.profile.rank_latin ?? null)
				}
			})
	}, [])

	async function handleSignOut() {
		await fetch("/api/auth/signout", { method: "POST" })
		router.refresh()
		router.push("/auth/login")
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<div className="px-2 py-1.5">
					<p className="truncate text-sm font-medium text-sidebar-foreground">
						{name ?? "…"}
					</p>
					{(rankStandard || rankLatin) && (
						<p className="mt-0.5 truncate text-xs text-sidebar-foreground/70">
							{rankStandard && rankLatin
								? `Standard ${rankStandard} · Latin ${rankLatin}`
								: rankStandard
									? `Standard ${rankStandard}`
									: rankLatin
										? `Latin ${rankLatin}`
										: null}
						</p>
					)}
				</div>
			</SidebarMenuItem>
			<SidebarMenuItem>
				<SidebarMenuButton asChild>
					<Button
						variant="ghost"
						className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						onClick={handleSignOut}
					>
						<LogOut className="size-4" />
						Sign out
					</Button>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}