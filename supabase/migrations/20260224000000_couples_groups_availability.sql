-- Store computed availability in the DB for couples and groups (same shape as profiles.availability).

alter table public.couples
	add column if not exists availability jsonb not null default '[]'::jsonb;

comment on column public.couples.availability is 'Computed intersection of both partners'' availability: [{ "day": "monday", "start": "09:00", "end": "12:00" }, ...]';

alter table public.groups
	add column if not exists availability jsonb not null default '[]'::jsonb;

comment on column public.groups.availability is 'Computed intersection of all members (students + couples) availability: [{ "day": "monday", "start": "09:00", "end": "12:00" }, ...]';
