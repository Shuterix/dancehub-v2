-- Add availability: array of { day, start, end } (day = monday..sunday, start/end = HH:mm)
alter table public.profiles
	add column if not exists availability jsonb not null default '[]'::jsonb;

comment on column public.profiles.availability is 'Training availability slots: [{ "day": "monday", "start": "09:00", "end": "12:00" }, ...]';
