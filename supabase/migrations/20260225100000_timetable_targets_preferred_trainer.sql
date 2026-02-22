-- Optional: which trainer this student/couple should train with (for timetable generation).
alter table public.timetable_targets
	add column if not exists preferred_trainer_id uuid references auth.users (id) on delete set null;

comment on column public.timetable_targets.preferred_trainer_id is 'If set, lessons for this target are assigned to this trainer when possible.';
