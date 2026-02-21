import { create } from 'zustand'

export interface Item {
	id?: string
	name: string
	description: string
}

interface ItemStoreState {
	items: Array<Item>,
	addItem: (item: Item) => void
	removeItem: (itemId: string) => void
}

export const useItemStore = create<ItemStoreState>()((set) => ({
	items: [],
	addItem: (item: Item) => set(state => ({ items: [...state.items, item] })),
	removeItem: (itemId: string) => set(state => ({ items: state.items.filter(item => item.id !== itemId) }))
}))
