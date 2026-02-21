-- Clubs and onboarding: clubs have name and code; users join or create; club has couples.

create table if not exists public.clubs (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	code text not null unique,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now()
);

create table if not exists public.club_members (
	club_id uuid not null references public.clubs (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	role text not null check (role in ('trainer', 'student')),
	created_at timestamptz not null default now(),
	primary key (club_id, user_id)
);

create table if not exists public.couples (
	id uuid primary key default gen_random_uuid(),
	club_id uuid not null references public.clubs (id) on delete cascade,
	name text,
	created_at timestamptz not null default now()
);

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.couples enable row level security;

create policy "Club members can read own club"
	on public.clubs for select
	using (exists (
		select 1 from public.club_members cm where cm.club_id = clubs.id and cm.user_id = auth.uid()
	));

create policy "Authenticated users can create club"
	on public.clubs for insert
	with check (auth.uid() = created_by);

create policy "Club creator can update own club"
	on public.clubs for update
	using (created_by = auth.uid());

create policy "Users can read club_members for their clubs"
	on public.club_members for select
	using (
		user_id = auth.uid()
		or exists (select 1 from public.club_members cm2 where cm2.club_id = club_members.club_id and cm2.user_id = auth.uid())
	);

create policy "Users can insert themselves as member"
	on public.club_members for insert
	with check (user_id = auth.uid());

create policy "Club members can read couples"
	on public.couples for select
	using (exists (
		select 1 from public.club_members cm where cm.club_id = couples.club_id and cm.user_id = auth.uid()
	));

create policy "Trainers can manage couples in their club"
	on public.couples for all
	using (exists (
		select 1 from public.club_members cm where cm.club_id = couples.club_id and cm.user_id = auth.uid() and cm.role = 'trainer'
	));

-- Add onboarding and club to profiles
alter table public.profiles
	add column if not exists onboarding_completed boolean not null default false,
	add column if not exists role text check (role in ('student', 'trainer')),
	add column if not exists club_id uuid references public.clubs (id) on delete set null;

-- Generate a random 6-char alphanumeric code
create or replace function public.generate_club_code()
returns text as $$
declare
	chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	result text := '';
	i int;
begin
	for i in 1..6 loop
		result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
	end loop;
	return result;
end;
$$ language plpgsql;
