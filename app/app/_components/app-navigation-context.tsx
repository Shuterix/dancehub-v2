"use client"

import { createContext, useCallback, useContext, useTransition } from "react"
import { useRouter } from "next/navigation"

type AppNavigationContextValue = {
	isPending: boolean
	navigate: (href: string) => void
}

const AppNavigationContext = createContext<AppNavigationContextValue>({
	isPending: false,
	navigate: () => {},
})

export function useAppNavigation() {
	return useContext(AppNavigationContext)
}

export function AppNavigationProvider({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()

	const navigate = useCallback(
		(href: string) => {
			startTransition(() => {
				router.push(href)
			})
		},
		[router]
	)

	return (
		<AppNavigationContext.Provider value={{ isPending, navigate }}>
			{children}
		</AppNavigationContext.Provider>
	)
}
