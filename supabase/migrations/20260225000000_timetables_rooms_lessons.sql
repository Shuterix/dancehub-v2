-- Timetables: validity, recurrence, day window. Trainers create timetables and generate lessons.

create type public.timetable_recurrence as enum (
	'weekly',
	'bi_weekly',
	'monthly',
	'weekends_only',
	'fixed_period'
);

create type public.distribution_preference as enum (
	'first_half',   -- prefer Mon-Wed
	'second_half',  -- prefer Thu-Sun
	'same'          -- spread evenly
);

create type public.lesson_type as enum (
	'individual',
	'couple',
	'group'
);

create type public.target_priority as enum (
	'high',
	'medium',
	'low'
);

create table if not exists public.timetables (
	id uuid primary key default gen_random_uuid(),
	club_id uuid not null references public.clubs (id) on delete cascade,
	name text not null,
	recurrence public.timetable_recurrence not null default 'weekly',
	valid_from date not null,
	valid_until date,
	is_active boolean not null default true,
	paused_at timestamptz,
	day_start time not null default '08:00',
	day_end time not null default '22:00',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_timetables_club_id on public.timetables (club_id);

create table if not exists public.timetable_preferences (
	id uuid primary key default gen_random_uuid(),
	timetable_id uuid not null references public.timetables (id) on delete cascade,
	individual_lesson_duration_minutes int not null default 45 check (individual_lesson_duration_minutes > 0),
	max_consecutive_minutes_per_trainer int not null default 120 check (max_consecutive_minutes_per_trainer > 0),
	min_break_minutes_after_consecutive int not null default 15 check (min_break_minutes_after_consecutive >= 0),
	preferred_min_teaching_minutes_per_day int check (preferred_min_teaching_minutes_per_day is null or preferred_min_teaching_minutes_per_day >= 0),
	distribution public.distribution_preference not null default 'same',
	buffer_between_lessons_minutes int not null default 0 check (buffer_between_lessons_minutes >= 0),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (timetable_id)
);

create table if not exists public.rooms (
	id uuid primary key default gen_random_uuid(),
	club_id uuid not null references public.clubs (id) on delete cascade,
	name text not null,
	created_at timestamptz not null default now()
);

create index if not exists idx_rooms_club_id on public.rooms (club_id);

create table if not exists public.room_teachers (
	room_id uuid not null references public.rooms (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (room_id, user_id)
);

create table if not exists public.group_lesson_types (
	id uuid primary key default gen_random_uuid(),
	club_id uuid not null references public.clubs (id) on delete cascade,
	group_id uuid not null references public.groups (id) on delete cascade,
	name text not null,
	duration_minutes int not null check (duration_minutes > 0),
	created_at timestamptz not null default now()
);

create index if not exists idx_group_lesson_types_club_id on public.group_lesson_types (club_id);
create index if not exists idx_group_lesson_types_group_id on public.group_lesson_types (group_id);

create table if not exists public.timetable_targets (
	id uuid primary key default gen_random_uuid(),
	timetable_id uuid not null references public.timetables (id) on delete cascade,
	student_id uuid references auth.users (id) on delete cascade,
	couple_id uuid references public.couples (id) on delete cascade,
	desired_lessons_count int not null check (desired_lessons_count >= 0),
	priority public.target_priority not null default 'medium',
	created_at timestamptz not null default now(),
	constraint timetable_target_one_of check (
		(student_id is not null and couple_id is null) or (student_id is null and couple_id is not null)
	)
);

create index if not exists idx_timetable_targets_timetable_id on public.timetable_targets (timetable_id);

create table if not exists public.timetable_trainer_limits (
	id uuid primary key default gen_random_uuid(),
	timetable_id uuid not null references public.timetables (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	max_lessons_per_day int not null check (max_lessons_per_day > 0),
	created_at timestamptz not null default now(),
	unique (timetable_id, user_id)
);

create index if not exists idx_timetable_trainer_limits_timetable_id on public.timetable_trainer_limits (timetable_id);

create table if not exists public.lessons (
	id uuid primary key default gen_random_uuid(),
	timetable_id uuid not null references public.timetables (id) on delete cascade,
	lesson_type public.lesson_type not null,
	start_at timestamptz not null,
	end_at timestamptz not null,
	room_id uuid references public.rooms (id) on delete set null,
	trainer_id uuid references auth.users (id) on delete set null,
	student_id uuid references auth.users (id) on delete set null,
	couple_id uuid references public.couples (id) on delete set null,
	group_id uuid references public.groups (id) on delete set null,
	group_lesson_type_id uuid references public.group_lesson_types (id) on delete set null,
	is_static boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint lesson_individual check (
		lesson_type != 'individual' or (student_id is not null and couple_id is null and group_id is null)
	),
	constraint lesson_couple check (
		lesson_type != 'couple' or (couple_id is not null and student_id is null and group_id is null)
	),
	constraint lesson_group check (
		lesson_type != 'group' or (group_id is not null and group_lesson_type_id is not null and student_id is null and couple_id is null)
	),
	constraint lesson_times check (end_at > start_at)
);

create index if not exists idx_lessons_timetable_id on public.lessons (timetable_id);
create index if not exists idx_lessons_start_at on public.lessons (start_at);
create index if not exists idx_lessons_trainer_id on public.lessons (trainer_id);
create index if not exists idx_lessons_room_id on public.lessons (room_id);

-- RLS: club members read, trainers manage (same pattern as groups)
alter table public.timetables enable row level security;
alter table public.timetable_preferences enable row level security;
alter table public.rooms enable row level security;
alter table public.room_teachers enable row level security;
alter table public.group_lesson_types enable row level security;
alter table public.timetable_targets enable row level security;
alter table public.timetable_trainer_limits enable row level security;
alter table public.lessons enable row level security;

create policy "Club members can read timetables"
	on public.timetables for select
	using (exists (
		select 1 from public.club_members cm where cm.club_id = timetables.club_id and cm.user_id = auth.uid()
	));

create policy "Trainers can manage timetables"
	on public.timetables for all
	using (exists (
		select 1 from public.club_members cm where cm.club_id = timetables.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
	));

create policy "Club members can read timetable_preferences"
	on public.timetable_preferences for select
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid()
		where t.id = timetable_preferences.timetable_id
	));

create policy "Trainers can manage timetable_preferences"
	on public.timetable_preferences for all
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
		where t.id = timetable_preferences.timetable_id
	));

create policy "Club members can read rooms"
	on public.rooms for select
	using (exists (
		select 1 from public.club_members cm where cm.club_id = rooms.club_id and cm.user_id = auth.uid()
	));

create policy "Trainers can manage rooms"
	on public.rooms for all
	using (exists (
		select 1 from public.club_members cm where cm.club_id = rooms.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
	));

create policy "Club members can read room_teachers"
	on public.room_teachers for select
	using (exists (
		select 1 from public.rooms r
		join public.club_members cm on cm.club_id = r.club_id and cm.user_id = auth.uid()
		where r.id = room_teachers.room_id
	));

create policy "Trainers can manage room_teachers"
	on public.room_teachers for all
	using (exists (
		select 1 from public.rooms r
		join public.club_members cm on cm.club_id = r.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
		where r.id = room_teachers.room_id
	));

create policy "Club members can read group_lesson_types"
	on public.group_lesson_types for select
	using (exists (
		select 1 from public.club_members cm where cm.club_id = group_lesson_types.club_id and cm.user_id = auth.uid()
	));

create policy "Trainers can manage group_lesson_types"
	on public.group_lesson_types for all
	using (exists (
		select 1 from public.club_members cm where cm.club_id = group_lesson_types.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
	));

create policy "Club members can read timetable_targets"
	on public.timetable_targets for select
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid()
		where t.id = timetable_targets.timetable_id
	));

create policy "Trainers can manage timetable_targets"
	on public.timetable_targets for all
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
		where t.id = timetable_targets.timetable_id
	));

create policy "Club members can read timetable_trainer_limits"
	on public.timetable_trainer_limits for select
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid()
		where t.id = timetable_trainer_limits.timetable_id
	));

create policy "Trainers can manage timetable_trainer_limits"
	on public.timetable_trainer_limits for all
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
		where t.id = timetable_trainer_limits.timetable_id
	));

create policy "Club members can read lessons"
	on public.lessons for select
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid()
		where t.id = lessons.timetable_id
	));

create policy "Trainers can manage lessons"
	on public.lessons for all
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
		where t.id = lessons.timetable_id
	));
