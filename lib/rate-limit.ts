/**
 * In-memory rate limit by IP. Use for auth routes to reduce brute-force risk.
 * Note: In serverless (e.g. Vercel), each instance has its own map; for strict
 * global limits consider Upstash Redis + @upstash/ratelimit.
 */

const windowMs = 60 * 1000 // 1 minute
const maxRequests = 10

const store = new Map<string, { count: number; resetAt: number }>()

function prune() {
	const now = Date.now()
	for (const [key, v] of store.entries()) {
		if (v.resetAt < now) store.delete(key)
	}
}

export function getClientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for")
	if (forwarded) {
		const first = forwarded.split(",")[0]?.trim()
		if (first) return first
	}
	const real = request.headers.get("x-real-ip")
	if (real) return real
	return "unknown"
}

/** Returns true if allowed; false if rate limited. Call before doing auth work. */
export function checkAuthRateLimit(request: Request): boolean {
	const ip = getClientIp(request)
	const now = Date.now()
	if (store.size > 5000) prune()

	let entry = store.get(ip)
	if (!entry) {
		store.set(ip, { count: 1, resetAt: now + windowMs })
		return true
	}
	if (entry.resetAt < now) {
		entry = { count: 1, resetAt: now + windowMs }
		store.set(ip, entry)
		return true
	}
	entry.count += 1
	return entry.count <= maxRequests
}
