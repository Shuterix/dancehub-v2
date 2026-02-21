export default function AppLoading() {
	return (
		<div className="flex min-h-[40vh] items-center justify-center">
			<div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
			<span className="sr-only">Loading…</span>
		</div>
	)
}
