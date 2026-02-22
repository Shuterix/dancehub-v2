-- Groups: trainers create groups and add students and/or couples. A student/couple can be in multiple groups.

create table if not exists public.groups (
	id uuid primary key default gen_random_uuid(),
	club_id uuid not null references public.clubs (id) on delete cascade,
	name text not null,
	created_at timestamptz not null default now()
);

-- Each row is either a student (user_id) or a couple (couple_id) in a group.
create table if not exists public.group_members (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.groups (id) on delete cascade,
	user_id uuid references auth.users (id) on delete cascade,
	couple_id uuid references public.couples (id) on delete cascade,
	created_at timestamptz not null default now(),
	constraint group_member_one_of check (
		(user_id is not null and couple_id is null) or (user_id is null and couple_id is not null)
	)
);

create index if not exists idx_group_members_group_id on public.group_members (group_id);
create unique index if not exists idx_group_members_group_user on public.group_members (group_id, user_id) where user_id is not null;
create unique index if not exists idx_group_members_group_couple on public.group_members (group_id, couple_id) where couple_id is not null;
create index if not exists idx_group_members_user_id on public.group_members (user_id);
create index if not exists idx_group_members_couple_id on public.group_members (couple_id);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "Club members can read groups"
	on public.groups for select
	using (exists (
		select 1 from public.club_members cm where cm.club_id = groups.club_id and cm.user_id = auth.uid()	
	));

create policy "Trainers can manage groups in their club"
	on public.groups for all
	using (exists (
		select 1 from public.club_members cm where cm.club_id = groups.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
	));

create policy "Club members can read group_members"
	on public.group_members for select
	using (exists (
		select 1 from public.groups g
		join public.club_members cm on cm.club_id = g.club_id and cm.user_id = auth.uid()
		where g.id = group_members.group_id
	));

create policy "Trainers can manage group_members"
	on public.group_members for all
	using (exists (
		select 1 from public.groups g
		join public.club_members cm on cm.club_id = g.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
		where g.id = group_members.group_id
	));
