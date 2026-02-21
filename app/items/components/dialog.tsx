'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog"
import { useItemStore } from "@/stores"
import { PlusIcon } from "lucide-react"
import { Label } from "@radix-ui/react-label"
import { Input } from "@/components/ui/input"
import { FieldGroup, Field, FieldError } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

export default function CustomDialog() {
	const addItemToStore = useItemStore(state => state.addItem)

	const [dialogOpen, setDialogOpen] = useState(false)
	const [name, setName] = useState("")
	const [description, setDescription] = useState("")
	const [nameError, setNameError] = useState<string | null>(null)

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		const trimmedName = name.trim()

		if (!trimmedName) {
			setNameError("Name is required")
			return
		}

		setNameError(null)

		addItemToStore({
			id: crypto.randomUUID(),
			name: trimmedName,
			description: description.trim(),
		})

		resetForm()
		setDialogOpen(false)
	}

	const resetForm = () => {
		setName("")
		setDescription("")
		setNameError(null)
	}

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			<DialogTrigger asChild>
				<Button className="fixed bottom-0 left-0 right-0 w-auto m-4 sm:mx-auto max-w-md">
					<PlusIcon className="w-4 h-4" />
					Add new item
				</Button>
			</DialogTrigger>
			<DialogContent onCloseAutoFocus={resetForm} className="sm:max-w-sm p-6 gap-6 rounded-xl border-border/50">
				<DialogHeader className="space-y-2 text-left">
					<DialogTitle>Add new item</DialogTitle>
					<DialogDescription>
						Enter the item name and an optional description.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="contents">
					<FieldGroup className="gap-4">
						<Field data-invalid={!!nameError}>
							<Label htmlFor="item-name" className="text-foreground font-semibold">Name</Label>
							<Input
								value={name}
								onChange={(e) => {
									setName(e.target.value)
									if (nameError) setNameError(null)
								}}
								autoComplete="off"
								id="item-name"
								name="name"
								placeholder="Item name"
								required
								aria-invalid={!!nameError}
								aria-describedby={nameError ? "item-name-error" : undefined}
								className="bg-input border-border rounded-lg h-11 placeholder:text-muted-foreground/80"
							/>
							{nameError && (
								<FieldError id="item-name-error">{nameError}</FieldError>
							)}
						</Field>
						<Field>
							<Label htmlFor="description" className="text-foreground font-semibold">Description</Label>
							<Textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								autoComplete="off"
								id="description"
								name="description"
								placeholder="Item description"
								className="bg-input border-border rounded-lg h-22 placeholder:text-muted-foreground/80"
							/>
						</Field>
					</FieldGroup>
					<div className="flex flex-col gap-3">
						<Button type="submit" disabled={!name.trim()} className="w-full h-11 rounded-lg font-medium">
							Add item
						</Button>
						<DialogClose asChild>
							<Button type="button" variant="secondary" className="w-full h-11 rounded-lg font-medium">
								Cancel
							</Button>
						</DialogClose>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}