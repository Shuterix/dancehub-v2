import { Toaster } from "@/components/ui/sonner"
import { ErrorBoundary } from "@/components/error-boundary"
import "./_theme/globals.css"

const THEME_SCRIPT = `
(function() {
	var key = 'app-theme-preset';
	var preset = localStorage.getItem(key);
	var presets = ['ocean','sunset','forest','lavender','slate','rose'];
	if (preset && presets.indexOf(preset) >= 0) {
		document.documentElement.classList.add('theme-' + preset);
	}
})();
`

export default function RootLayout({
	children,
}: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
			</head>
			<body className="min-h-svh bg-background text-foreground">
				<ErrorBoundary>
					{children}
				</ErrorBoundary>
				<Toaster />
			</body>
		</html>
	)
}