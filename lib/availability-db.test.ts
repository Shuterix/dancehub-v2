import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { refreshCoupleAvailability, refreshGroupAvailability } from "./availability-db"
import type { AvailabilitySlot } from "./availability"

function slot(day: string, start: string, end: string): AvailabilitySlot {
	return { day, start, end }
}

describe("refreshCoupleAvailability", () => {
	it("computes couple availability as intersection of both partners and updates DB", async () => {
		let couplesCallCount = 0
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "couples") {
				couplesCallCount++
				if (couplesCallCount === 1) {
					return {
						select: vi.fn().mockReturnThis(),
						eq: vi.fn().mockReturnThis(),
						single: vi.fn().mockResolvedValue({
							data: { partner1_user_id: "u1", partner2_user_id: "u2" },
							error: null,
						}),
					}
				}
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			if (table === "profiles") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "u1", availability: [slot("monday", "10:00", "12:00")] },
							{ id: "u2", availability: [slot("monday", "10:00", "11:00")] },
						],
						error: null,
					}),
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshCoupleAvailability(supabase, "c1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([slot("monday", "10:00", "11:00")])
	})

	it("writes [] when one partner has no availability", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "couples") {
				const first = !from.mock.calls.some((c) => c[0] === "couples" && c !== from.mock.calls[from.mock.calls.length - 1])
				const isFirstCouples = from.mock.calls.filter((c) => c[0] === "couples").length === 1
				if (isFirstCouples) {
					return {
						select: vi.fn().mockReturnThis(),
						eq: vi.fn().mockReturnThis(),
						single: vi.fn().mockResolvedValue({
							data: { partner1_user_id: "u1", partner2_user_id: "u2" },
							error: null,
						}),
					}
				}
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			if (table === "profiles") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "u1", availability: [slot("monday", "10:00", "12:00")] },
							{ id: "u2", availability: [] },
						],
						error: null,
					}),
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshCoupleAvailability(supabase, "c1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([])
	})
})

describe("refreshGroupAvailability", () => {
	it("writes [] when any member has no availability", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "group_members") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({
						data: [{ user_id: null, couple_id: "c1" }, { user_id: null, couple_id: "c2" }],
						error: null,
					}),
				}
			}
			if (table === "couples") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "c1", availability: [slot("monday", "10:00", "12:00")] },
							{ id: "c2", availability: [] },
						],
						error: null,
					}),
				}
			}
			if (table === "groups") {
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshGroupAvailability(supabase, "g1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([])
	})

	it("writes intersection when all members have overlapping slot", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "group_members") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({
						data: [{ user_id: null, couple_id: "c1" }, { user_id: null, couple_id: "c2" }],
						error: null,
					}),
				}
			}
			if (table === "couples") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "c1", availability: [slot("monday", "10:00", "12:00")] },
							{ id: "c2", availability: [slot("monday", "10:00", "11:00")] },
						],
						error: null,
					}),
				}
			}
			if (table === "groups") {
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshGroupAvailability(supabase, "g1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([slot("monday", "10:00", "11:00")])
	})

	it("group with 3 couples: writes intersection when all have overlapping slot", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "group_members") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({
						data: [
							{ user_id: null, couple_id: "c1" },
							{ user_id: null, couple_id: "c2" },
							{ user_id: null, couple_id: "c3" },
						],
						error: null,
					}),
				}
			}
			if (table === "couples") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "c1", availability: [slot("monday", "09:00", "12:00")] },
							{ id: "c2", availability: [slot("monday", "10:00", "11:30")] },
							{ id: "c3", availability: [slot("monday", "10:15", "11:00")] },
						],
						error: null,
					}),
				}
			}
			if (table === "groups") {
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshGroupAvailability(supabase, "g1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([slot("monday", "10:15", "11:00")])
	})

	it("group with 2 couples + 2 students (4 members): writes only when all four can", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "group_members") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({
						data: [
							{ user_id: "s1", couple_id: null },
							{ user_id: "s2", couple_id: null },
							{ user_id: null, couple_id: "c1" },
							{ user_id: null, couple_id: "c2" },
						],
						error: null,
					}),
				}
			}
			if (table === "profiles") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "s1", availability: [slot("monday", "09:30", "11:30")] },
							{ id: "s2", availability: [slot("monday", "10:00", "10:45")] },
						],
						error: null,
					}),
				}
			}
			if (table === "couples") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "c1", availability: [slot("monday", "10:00", "12:00")] },
							{ id: "c2", availability: [slot("monday", "10:00", "11:00")] },
						],
						error: null,
					}),
				}
			}
			if (table === "groups") {
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshGroupAvailability(supabase, "g1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([slot("monday", "10:00", "10:45")])
	})

	it("group with 3 couples: one couple has no availability → writes []", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "group_members") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({
						data: [
							{ user_id: null, couple_id: "c1" },
							{ user_id: null, couple_id: "c2" },
							{ user_id: null, couple_id: "c3" },
						],
						error: null,
					}),
				}
			}
			if (table === "couples") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "c1", availability: [slot("monday", "10:00", "12:00")] },
							{ id: "c2", availability: [] },
							{ id: "c3", availability: [slot("monday", "10:00", "12:00")] },
						],
						error: null,
					}),
				}
			}
			if (table === "groups") {
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshGroupAvailability(supabase, "g1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([])
	})

	it("group with only students (no couples): writes intersection of all students", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "group_members") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({
						data: [
							{ user_id: "s1", couple_id: null },
							{ user_id: "s2", couple_id: null },
							{ user_id: "s3", couple_id: null },
						],
						error: null,
					}),
				}
			}
			if (table === "profiles") {
				return {
					select: vi.fn().mockReturnThis(),
					in: vi.fn().mockResolvedValue({
						data: [
							{ id: "s1", availability: [slot("wednesday", "14:00", "17:00")] },
							{ id: "s2", availability: [slot("wednesday", "14:00", "16:00")] },
							{ id: "s3", availability: [slot("wednesday", "15:00", "17:00")] },
						],
						error: null,
					}),
				}
			}
			if (table === "groups") {
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshGroupAvailability(supabase, "g1")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([slot("wednesday", "15:00", "16:00")])
	})
})

describe("Edge cases: refreshCoupleAvailability", () => {
	it("does not update when couple not found (single returns null)", async () => {
		let updateCalled = false
		const from = vi.fn((table: string) => {
			if (table === "couples") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					single: vi.fn().mockResolvedValue({ data: null, error: null }),
					update: () => {
						updateCalled = true
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshCoupleAvailability(supabase, "nonexistent")
		expect(updateCalled).toBe(false)
	})

	it("does not update when couple has missing partner ids", async () => {
		let updateCalled = false
		const from = vi.fn((table: string) => {
			if (table === "couples") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					single: vi.fn().mockResolvedValue({
						data: { partner1_user_id: "u1", partner2_user_id: null },
						error: null,
					}),
					update: () => {
						updateCalled = true
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshCoupleAvailability(supabase, "c1")
		expect(updateCalled).toBe(false)
	})
})

describe("Edge cases: refreshGroupAvailability", () => {
	it("writes [] when group has no members", async () => {
		let updatePayload: { availability: AvailabilitySlot[] } | null = null
		const from = vi.fn((table: string) => {
			if (table === "group_members") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({ data: [], error: null }),
				}
			}
			if (table === "groups") {
				return {
					update: (p: { availability: AvailabilitySlot[] }) => {
						updatePayload = p
						return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) }
					},
				}
			}
			return {}
		})
		const supabase = { from } as unknown as SupabaseClient
		await refreshGroupAvailability(supabase, "empty-group")
		expect(updatePayload).not.toBeNull()
		expect(updatePayload!.availability).toEqual([])
	})
})
