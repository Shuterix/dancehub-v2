/**
 * Types for club pages data. Kept in a separate file so client components
 * can import them without pulling in server-only code (supabase/server).
 */

export type RoomsPageData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
	allTrainers: Array<{ user_id: string; full_name: string }>
	rooms: Array<{ id: string; name: string; teacher_ids: string[] }>
}

export type LessonTypesPageData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
	groups: Array<{ id: string; name: string }>
	group_lesson_types: Array<{
		id: string
		group_id: string
		group_name: string
		name: string
		duration_minutes: number
	}>
}

export type TimetableRow = {
	id: string
	name: string
	recurrence: string
	valid_from: string
	valid_until: string | null
	is_active: boolean
	paused_at: string | null
	day_start: string
	day_end: string
	created_at: string
}

export type TimetablesPageData = {
	club: { id: string; name: string; code: string }
	isTrainer: boolean
	timetables: TimetableRow[]
}
