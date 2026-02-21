export default function LoginLoading() {
	return (
		<div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
			<div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
			<span className="sr-only">Loading…</span>
		</div>
	)
}
