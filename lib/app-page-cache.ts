type CacheKey =
	| "app/my-lessons"
	| "app/club/overview"
	| "app/club/trainers"
	| "app/club/students"
	| "app/club/rooms"
	| "app/club/lesson-types"
	| "app/club/groups"
	| "app/club/couples"
	| "app/club/timetables"

// Simple in-memory cache that lives for the lifetime of the JS bundle.
// This survives client-side route transitions but resets on full reload.
const cache = new Map<CacheKey, unknown>()

export function getPageCache<T>(key: CacheKey): T | null {
	const value = cache.get(key)
	return (value as T | undefined) ?? null
}

export function setPageCache<T>(key: CacheKey, value: T): void {
	cache.set(key, value)
}

export function clearPageCache(key?: CacheKey): void {
	if (typeof key === "string") {
		cache.delete(key)
	} else {
		cache.clear()
	}
}

