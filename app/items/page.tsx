'use client'

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useItemStore } from "@/stores"
import CustomDialog from "./components/dialog"

export default function Page() {
	const items = useItemStore(state => state.items)
	return (
		<div className="flex flex-col h-screen p-4 bg-background">
			<div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-4 pb-20">
				{items.map(item => (
					<Card key={item.id} className="w-full max-w-md shrink-0 hover:shadow-md">
						<CardHeader>
							<CardTitle>{item.name}</CardTitle>
							<CardDescription>{item.description}</CardDescription>
						</CardHeader>
					</Card>
				))}
			</div>
			<CustomDialog />
		</div>
	)
}
