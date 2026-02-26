/**
 * Types for club data. Kept in a separate file so client components
 * can import them without pulling in server-only code (supabase/server).
 */

import type { AvailabilitySlot } from "@/lib/availability"

export type { AvailabilitySlot }

export type ClubData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
	couples: Array<{
		id: string
		name: string | null
		partner1_user_id: string | null
		partner2_user_id: string | null
		partner1_name: string | null
		partner2_name: string | null
		partner1_phone: string | null
		partner2_phone: string | null
		partner1_email: string | null
		partner2_email: string | null
		partner1_availability: AvailabilitySlot[]
		partner2_availability: AvailabilitySlot[]
		availability?: AvailabilitySlot[]
	}>
	allStudents: Array<{
		user_id: string
		full_name: string
		phone: string | null
		email: string | null
		rank_standard: string | null
		rank_latin: string | null
		age: number | null
		partner_name: string | null
		availability?: AvailabilitySlot[]
	}>
	allTrainers: Array<{
		user_id: string
		full_name: string
		phone: string | null
		email: string | null
		rank_standard: string | null
		rank_latin: string | null
		age: number | null
		is_external?: boolean
		login_code?: string
		availability?: AvailabilitySlot[]
	}>
	unpairedStudents: Array<{
		user_id: string
		full_name: string
		rank_standard: string | null
		rank_latin: string | null
		age: number | null
		availability?: AvailabilitySlot[]
	}>
	groups: Array<{
		id: string
		name: string
		created_at?: string
		student_ids: string[]
		couple_ids: string[]
		member_count?: number
		availability?: AvailabilitySlot[]
	}>
}
