import { ProfileForm } from "./_components/profile-form"

export default function ProfilePage() {
	return (
		<div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
				<p className="text-muted-foreground text-sm">Manage your account and personal details.</p>
			</div>
			<ProfileForm />
		</div>
	)
}
