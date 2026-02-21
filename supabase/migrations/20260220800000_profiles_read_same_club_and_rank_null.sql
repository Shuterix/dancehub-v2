-- 1) Allow users to read profiles of other members in their club (so club page can show names/ranks).
--    Uses only club_members to avoid RLS recursion with profiles.
create policy "Users can read profiles of same-club members"
	on public.profiles for select
	using (
		auth.uid() = id
		or exists (
			select 1
			from public.club_members c1
			join public.club_members c2 on c1.club_id = c2.club_id and c2.user_id = profiles.id
			where c1.user_id = auth.uid()
		)
	);

-- 2) Rank null by default: trainers will set ranks later. Allow NULL and default NULL for new users.
alter table public.profiles
	alter column rank_standard drop not null,
	alter column rank_standard set default null;

alter table public.profiles
	alter column rank_latin drop not null,
	alter column rank_latin set default null;

-- Relax check to allow NULL
alter table public.profiles drop constraint if exists profiles_rank_standard_check;
alter table public.profiles add constraint profiles_rank_standard_check
	check (rank_standard is null or rank_standard in ('E', 'D', 'C', 'B', 'A', 'S'));

alter table public.profiles drop constraint if exists profiles_rank_latin_check;
alter table public.profiles add constraint profiles_rank_latin_check
	check (rank_latin is null or rank_latin in ('E', 'D', 'C', 'B', 'A', 'S'));

-- New users: do not set rank; trainer will set later
create or replace function public.handle_new_user()
returns trigger as $$
begin
	insert into public.profiles (id, full_name, phone, dance_partner, category, rank_standard, rank_latin)
	values (
		new.id,
		coalesce(new.raw_user_meta_data->>'full_name', ''),
		nullif(trim(new.raw_user_meta_data->>'phone'), ''),
		nullif(trim(new.raw_user_meta_data->>'dance_partner'), ''),
		coalesce(nullif(new.raw_user_meta_data->>'category', ''), 'C'),
		nullif(trim(new.raw_user_meta_data->>'rank_standard'), ''),
		nullif(trim(new.raw_user_meta_data->>'rank_latin'), '')
	)
	on conflict (id) do update set
		full_name = coalesce(excluded.full_name, profiles.full_name),
		phone = coalesce(excluded.phone, profiles.phone),
		dance_partner = coalesce(excluded.dance_partner, profiles.dance_partner),
		category = coalesce(nullif(excluded.category, ''), profiles.category),
		rank_standard = coalesce(nullif(excluded.rank_standard, ''), profiles.rank_standard),
		rank_latin = coalesce(nullif(excluded.rank_latin, ''), profiles.rank_latin);
	return new;
end;
$$ language plpgsql security definer;
