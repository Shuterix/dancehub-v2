/**
 * Types for my-lessons data. Kept in a separate file so client components
 * can import them without pulling in server-only code (supabase/server).
 */

export type LessonItem = {
	id: string
	timetable_id?: string | null
	timetable_name?: string | null
	lesson_type: string
	start_at: string
	end_at: string
	room_name: string | null
	trainer_name: string | null
	label: string
	is_trainer: boolean
	cancelled_at?: string | null
	cancellation_note?: string | null
}
