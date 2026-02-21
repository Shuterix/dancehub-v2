import { ProfileForm } from "./_components/profile-form"

export default function ProfilePage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
				<p className="text-muted-foreground text-sm">Manage your account and personal details.</p>
			</div>
			<ProfileForm />
		</div>
	)
}
