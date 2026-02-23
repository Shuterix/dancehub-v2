"use client"

import { Phone, Mail, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"

export type ContactInfo = {
	phone: string | null
	email: string | null
}

type ContactDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	contact: ContactInfo
}

export function ContactDialog({ open, onOpenChange, title, contact }: ContactDialogProps) {
	const hasPhone = !!contact.phone?.trim()
	const hasEmail = !!contact.email?.trim()
	const hasAny = hasPhone || hasEmail

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Contact — {title}</DialogTitle>
					<DialogDescription>
						{hasAny ? "Call, email, or copy contact details." : "No contact info available."}
					</DialogDescription>
				</DialogHeader>
				{hasAny && (
					<div className="space-y-4">
						{hasPhone && (
							<div className="flex flex-col gap-2">
								<span className="text-muted-foreground text-sm">Phone</span>
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-foreground font-medium">{contact.phone}</span>
									<Button variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
										<a href={`tel:${contact.phone!.replace(/\s/g, "")}`} aria-label="Call">
											<Phone className="size-4" />
										</a>
									</Button>
									<Button
										variant="outline"
										size="icon"
										className="h-9 w-9 shrink-0"
										aria-label="Copy phone"
										onClick={() => {
											const p = contact.phone!.trim()
											if (p) {
												navigator.clipboard.writeText(p).then(
													() => toast.success("Contact copied to clipboard"),
													() => toast.error("Failed to copy")
												)
											}
										}}
									>
										<Copy className="size-4" />
									</Button>
								</div>
							</div>
						)}
						{hasEmail && (
							<div className="flex flex-col gap-2">
								<span className="text-muted-foreground text-sm">Email</span>
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-foreground font-medium break-all">{contact.email}</span>
									<Button variant="outline" size="icon" className="h-9 w-9 shrink-0" asChild>
										<a href={`mailto:${contact.email}`} aria-label="Email">
											<Mail className="size-4" />
										</a>
									</Button>
									<Button
										variant="outline"
										size="icon"
										className="h-9 w-9 shrink-0"
										aria-label="Copy email"
										onClick={() => {
											const e = contact.email!.trim()
											if (e) {
												navigator.clipboard.writeText(e).then(
													() => toast.success("Contact copied to clipboard"),
													() => toast.error("Failed to copy")
												)
											}
										}}
									>
										<Copy className="size-4" />
									</Button>
								</div>
							</div>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
