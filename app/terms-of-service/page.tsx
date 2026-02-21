import Link from "next/link"

export default function TermsOfServicePage() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
			<div className="space-y-8">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						Terms of Service
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Last updated: February 2025
					</p>
				</div>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">1. Acceptance</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						By accessing or using DanceHub (&quot;the service&quot;), you agree to these terms.
						If you do not agree, do not use the service.
					</p>
				</section>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">2. Use of the service</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						You may use the service only for lawful purposes and in line with your role
						(student, trainer, or club). You are responsible for keeping your account
						credentials secure and for activity under your account.
					</p>
				</section>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">3. Privacy</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						Your use of the service is also governed by our{" "}
						<Link href="/privacy-policy" className="underline underline-offset-4 hover:text-foreground">
							Privacy Policy
						</Link>
						.
					</p>
				</section>

				<section className="space-y-4">
					<h2 className="text-lg font-medium text-foreground">4. Contact</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">
						For questions about these terms, please contact the club administrator
						or the email address provided when you signed up.
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
