-- Group lesson targets: how many group lessons per week for each group + lesson type.
create table if not exists public.timetable_group_targets (
	id uuid primary key default gen_random_uuid(),
	timetable_id uuid not null references public.timetables (id) on delete cascade,
	group_id uuid not null references public.groups (id) on delete cascade,
	group_lesson_type_id uuid not null references public.group_lesson_types (id) on delete cascade,
	desired_lessons_count int not null check (desired_lessons_count >= 0),
	priority public.target_priority not null default 'medium',
	preferred_trainer_id uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (timetable_id, group_id, group_lesson_type_id)
);

create index if not exists idx_timetable_group_targets_timetable_id on public.timetable_group_targets (timetable_id);

alter table public.timetable_group_targets enable row level security;

create policy "Club members can read timetable_group_targets"
	on public.timetable_group_targets for select
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid()
		where t.id = timetable_group_targets.timetable_id
	));

create policy "Trainers can manage timetable_group_targets"
	on public.timetable_group_targets for all
	using (exists (
		select 1 from public.timetables t
		join public.club_members cm on cm.club_id = t.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
		where t.id = timetable_group_targets.timetable_id
	));
