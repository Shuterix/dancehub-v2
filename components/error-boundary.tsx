"use client"

import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface Props {
	children: ReactNode
	fallback?: ReactNode
}

interface State {
	hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = { hasError: false }
	}

	static getDerivedStateFromError() {
		return { hasError: true }
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback
			return (
				<div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
					<h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
					<p className="max-w-sm text-sm text-muted-foreground">
						An error occurred. Please try again or go back to the home page.
					</p>
					<div className="flex gap-2">
						<Button variant="outline" asChild>
							<Link href="/">Go home</Link>
						</Button>
						<Button
							variant="secondary"
							onClick={() => this.setState({ hasError: false })}
						>
							Try again
						</Button>
					</div>
				</div>
			)
		}
		return this.props.children
	}
}
