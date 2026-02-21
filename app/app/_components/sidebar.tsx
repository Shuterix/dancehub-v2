"use client"

import { LayoutDashboard, User, LogOut, Menu, X, Trophy, Users, UserPlus, Heart, GraduationCap, Clock } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ThemeSwitcher } from "@/components/theme-switcher"

const navItems = [
	{ title: "Dashboard", url: "/app/dashboard", icon: LayoutDashboard },
	{ title: "Club", url: "/app/club", icon: Users },
	{ title: "Students", url: "/app/club/students", icon: UserPlus },
	{ title: "Trainers", url: "/app/club/trainers", icon: GraduationCap },
	{ title: "Couples", url: "/app/club/couples", icon: Heart },
]

function ClubHeader({ clubName }: { clubName: string | null }) {
	return (
		<div className="flex shrink-0 items-center gap-3 border-b border-sidebar-border px-3 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground">
				<Trophy className="size-5" aria-hidden />
			</div>
			<span className="truncate text-base font-semibold text-sidebar-foreground">
				{clubName ?? "My Club"}
			</span>
		</div>
	)
}

function NavLinks({ onLinkClick }: { onLinkClick?: () => void }) {
	const pathname = usePathname()
	return (
		<nav className="flex flex-col gap-1.5">
			{navItems.map((item) => {
				const isActive = pathname === item.url
				return (
					<Link
						key={item.title}
						href={item.url}
						onClick={onLinkClick}
						className={`flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive
								? "bg-sidebar-accent text-sidebar-accent-foreground"
								: "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
							}`}
					>
						<item.icon className="size-4 shrink-0" />
						<span>{item.title}</span>
					</Link>
				)
			})}
		</nav>
	)
}

function UserBlock({
	userName,
	rankStandard,
	rankLatin,
	onLinkClick,
}: {
	userName: string | null
	rankStandard: string | null
	rankLatin: string | null
	onLinkClick?: () => void
}) {
	const router = useRouter()
	const pathname = usePathname()

	async function handleSignOut() {
		await fetch("/api/auth/signout", { method: "POST" })
		router.refresh()
		router.push("/auth/login")
	}

	return (
		<div className="rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-2">
			<div className="px-2 py-2">
				<p className="truncate text-sm font-semibold text-sidebar-foreground">
					{userName ?? "…"}
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
			<nav className="flex flex-col gap-1">
				<Link
					href="/app/profile"
					onClick={onLinkClick}
					className={`flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname === "/app/profile"
							? "bg-sidebar-accent text-sidebar-accent-foreground"
							: "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						}`}
				>
					<User className="size-4 shrink-0" />
					Profile
				</Link>
				<Link
					href="/app/availability"
					onClick={onLinkClick}
					className={`flex min-h-[44px] min-w-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${pathname === "/app/availability"
							? "bg-sidebar-accent text-sidebar-accent-foreground"
							: "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						}`}
				>
					<Clock className="size-4 shrink-0" />
					Availability
				</Link>
			</nav>
			<div className="mt-1 border-t border-sidebar-border pt-1">
				<button
					type="button"
					onClick={handleSignOut}
					className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				>
					<LogOut className="size-4 shrink-0" />
					Sign out
				</button>
			</div>
		</div>
	)
}

export function DashboardSidebar({
	open,
	onClose,
}: {
	open?: boolean
	onClose?: () => void
}) {
	const router = useRouter()
	const [clubName, setClubName] = useState<string | null>(null)
	const [userName, setUserName] = useState<string | null>(null)
	const [rankStandard, setRankStandard] = useState<string | null>(null)
	const [rankLatin, setRankLatin] = useState<string | null>(null)

	useEffect(() => {
		fetch("/api/auth/me")
			.then((res) => {
				if (res.status === 401) {
					toast.error("Session expired. Please sign in again.")
					router.push("/auth/login")
					return null
				}
				return res.ok ? res.json() : null
			})
			.then((data: {
				user?: { user_metadata?: { full_name?: string }; email?: string }
				profile?: { rank_standard?: string; rank_latin?: string }
				club?: { name: string }
			} | null) => {
				if (!data?.user) return
				setUserName(data.user.user_metadata?.full_name ?? data.user.email ?? "User")
				if (data.profile) {
					setRankStandard(data.profile.rank_standard ?? null)
					setRankLatin(data.profile.rank_latin ?? null)
				}
				if (data.club?.name) setClubName(data.club.name)
			})
	}, [])

	return (
		<aside
			className={`
        m-0 flex w-64 flex-col border-sidebar-border bg-sidebar text-sidebar-foreground
        h-[100svh] max-h-[100svh]
        sm:m-4 sm:h-[calc(100svh-2rem)] sm:max-h-[calc(100svh-2rem)]
        fixed inset-y-0 left-0 z-40 shrink-0 overflow-hidden shadow-lg
        rounded-2xl border transition-transform duration-200 ease-out
        md:relative md:z-auto md:translate-x-0
        ${open === false ? "-translate-x-full" : "translate-x-0 rounded-l-none"}
      `}
			style={{ willChange: "transform" }}
		>
			<div className="flex h-14 shrink-0 items-center justify-end border-b border-sidebar-border px-3 md:hidden">
				<button
					type="button"
					onClick={onClose}
					aria-label="Close menu"
					className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				>
					<X className="size-5" />
				</button>
			</div>
			<ClubHeader clubName={clubName} />
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
				<NavLinks onLinkClick={onClose} />
			</div>
			<div className="shrink-0 space-y-3 border-t border-sidebar-border p-3">
				<ThemeSwitcher />
				<UserBlock
					userName={userName}
					rankStandard={rankStandard}
					rankLatin={rankLatin}
					onLinkClick={onClose}
				/>
			</div>
		</aside>
	)
}

const SEGMENT_LABELS: Record<string, string> = {
	app: "App",
	dashboard: "Dashboard",
	profile: "Profile",
	availability: "Availability",
	club: "Club",
	students: "Students",
	trainers: "Trainers",
	couples: "Couples",
}

function DashboardBreadcrumbs() {
	const pathname = usePathname()
	const segments = pathname.split("/").filter(Boolean)

	const items = segments.map((segment, i) => {
		const href = "/" + segments.slice(0, i + 1).join("/")
		const label = SEGMENT_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
		const isLast = i === segments.length - 1
		return { href, label, isLast }
	})

	if (items.length === 0) return null

	return (
		<Breadcrumb className="min-w-0 overflow-hidden">
			<BreadcrumbList className="flex-wrap">
				{items.map((item, i) => (
					<Fragment key={item.href}>
						{i > 0 && <BreadcrumbSeparator />}
						<BreadcrumbItem>
							{item.isLast ? (
								<BreadcrumbPage>{item.label}</BreadcrumbPage>
							) : (
								<BreadcrumbLink asChild>
									<Link href={item.href}>{item.label}</Link>
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	)
}

export function DashboardSidebarTrigger({ onOpen }: { onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label="Open menu"
			className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl p-2 text-foreground transition-colors hover:bg-muted md:hidden"
		>
			<Menu className="size-5" />
		</button>
	)
}

export function DashboardSidebarLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const pathname = usePathname()
	const [mobileOpen, setMobileOpen] = useState(false)
	const prevPathnameRef = useRef(pathname)

	// Close mobile sidebar when route changes (e.g. after tapping a nav link), not on initial mount
	useEffect(() => {
		if (prevPathnameRef.current !== pathname) {
			prevPathnameRef.current = pathname
			setMobileOpen(false)
		}
	}, [pathname])

	useEffect(() => {
		if (mobileOpen) {
			const handler = () => setMobileOpen(false)
			window.addEventListener("resize", handler)
			return () => window.removeEventListener("resize", handler)
		}
	}, [mobileOpen])

	return (
		<div className="flex h-[100svh] max-h-[100svh] w-full gap-0 overflow-hidden">
			<DashboardSidebar
				open={mobileOpen}
				onClose={() => setMobileOpen(false)}
			/>
			{mobileOpen && (
				<button
					type="button"
					aria-label="Close menu"
					className="fixed inset-0 z-30 cursor-pointer bg-foreground/50 backdrop-blur-sm md:hidden"
					onClick={() => setMobileOpen(false)}
				/>
			)}
			<div className="flex min-h-0 flex-1 flex-col min-w-0 overflow-hidden sm:mr-4">
				<header className="flex shrink-0 flex-col gap-2 border-border bg-background px-4 py-3 md:px-6 sm:my-4 sm:rounded-xl md:min-h-14 md:flex-row md:items-center">
					<div className="flex h-10 items-center md:h-auto">
						<DashboardSidebarTrigger onOpen={() => setMobileOpen(true)} />
					</div>
					<DashboardBreadcrumbs />
				</header>
				<main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto rounded-t-xl m-4">{children}</main>
			</div>
		</div>
	)
}
