-- Profiles table: one row per user. Add more columns anytime with:
--   ALTER TABLE public.profiles ADD COLUMN your_column type;
-- then run the migration or run the SQL in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	full_name text,
	phone text,
	dance_partner text,
	category text default 'C' check (category in ('E', 'D', 'C', 'B', 'A', 'S')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
	on public.profiles for select
	using (auth.uid() = id);

create policy "Users can update own profile"
	on public.profiles for update
	using (auth.uid() = id);

create policy "Users can insert own profile"
	on public.profiles for insert
	with check (auth.uid() = id);

-- Keep updated_at in sync
create or replace function public.set_updated_at()
returns trigger as $$
begin
	new.updated_at := now();
	return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
	before update on public.profiles
	for each row execute function public.set_updated_at();

-- Create profile row when a new user signs up (from auth.users)
create or replace function public.handle_new_user()
returns trigger as $$
begin
	insert into public.profiles (id, full_name, phone, dance_partner, category)
	values (
		new.id,
		coalesce(new.raw_user_meta_data->>'full_name', ''),
		nullif(trim(new.raw_user_meta_data->>'phone'), ''),
		nullif(trim(new.raw_user_meta_data->>'dance_partner'), ''),
		coalesce(nullif(new.raw_user_meta_data->>'category', ''), 'C')
	)
	on conflict (id) do update set
		full_name = coalesce(excluded.full_name, profiles.full_name),
		phone = coalesce(excluded.phone, profiles.phone),
		dance_partner = coalesce(excluded.dance_partner, profiles.dance_partner),
		category = coalesce(nullif(excluded.category, ''), profiles.category);
	return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

-- Backfill: create profile rows for existing users from their metadata
insert into public.profiles (id, full_name, phone, dance_partner, category)
select
	id,
	coalesce(raw_user_meta_data->>'full_name', ''),
	nullif(trim(raw_user_meta_data->>'phone'), ''),
	nullif(trim(raw_user_meta_data->>'dance_partner'), ''),
	coalesce(nullif(raw_user_meta_data->>'category', ''), 'C')
from auth.users
on conflict (id) do update set
	full_name = coalesce(excluded.full_name, profiles.full_name),
	phone = coalesce(excluded.phone, profiles.phone),
	dance_partner = coalesce(excluded.dance_partner, profiles.dance_partner),
	category = coalesce(nullif(excluded.category, ''), profiles.category);
