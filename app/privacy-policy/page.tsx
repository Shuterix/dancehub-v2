import Link from "next/link"

export default function PrivacyPolicyPage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
			<div className="space-y-8">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						Privacy Policy
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Last updated: February 2025
					</p>
				</div>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">1. Information we collect</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						We collect information you provide when signing up and using the service,
						such as name, email, phone (optional), dance-related details (e.g. rank,
						partner, availability), and club membership. Account and session data
						are stored to operate the service.
					</p>
				</section>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">2. How we use it</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						We use this information to provide and improve the service, to show you
						relevant club and partner information, and to communicate with you about
						your account when necessary.
					</p>
				</section>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">3. Sharing</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						Information is shared only within your club (e.g. with trainers and other
						members as needed for the service). We do not sell your personal data.
					</p>
				</section>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">4. Security and retention</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						We use industry-standard measures to protect your data. We retain your
						information for as long as your account is active or as needed to
						provide the service and comply with law.
					</p>
				</section>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">5. Contact</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						For privacy-related questions or requests, contact your club administrator
						or the email address associated with your account.
					</p>
				</section>

				<p className="pt-4 text-sm text-muted-foreground">
					<Link href="/auth/login" className="underline underline-offset-4 hover:text-foreground">
						Back to sign in
					</Link>
				</p>
			</div>
		</div>
	)
}
