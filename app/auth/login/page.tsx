import { GalleryVerticalEnd } from "lucide-react"

import { LoginForm } from "@/components/login-form"

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ message?: string }>
}) {
	const { message } = await searchParams
	return (
		<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
			<div className="flex w-full max-w-sm flex-col gap-6">
				<a href="#" className="flex items-center gap-2 self-center font-medium">
					<div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
						<GalleryVerticalEnd className="size-4" />
					</div>
					Dancehub
				</a>
				{message === "check-email" && (
					<p className="text-center text-sm text-muted-foreground">
						Check your email to confirm your account, then sign in.
					</p>
				)}
				<LoginForm />
			</div>
		</div>
	)
}