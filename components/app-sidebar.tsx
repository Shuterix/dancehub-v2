"use client"

import {
	Sidebar,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuItem,
	SidebarTrigger,
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/nav-user"

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar variant="inset" collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarTrigger className="-ml-1" />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	)
}