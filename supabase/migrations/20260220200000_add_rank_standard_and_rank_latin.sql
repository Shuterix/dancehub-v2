-- Two read-only ranks: Standard and Latin (E = lowest, S = highest). Set by the club.

alter table public.profiles
	add column if not exists rank_standard text not null default 'C' check (rank_standard in ('E', 'D', 'C', 'B', 'A', 'S'));

alter table public.profiles
	add column if not exists rank_latin text not null default 'C' check (rank_latin in ('E', 'D', 'C', 'B', 'A', 'S'));

-- Backfill from existing category
update public.profiles
set
	rank_standard = coalesce(nullif(trim(category), ''), 'C'),
	rank_latin = coalesce(nullif(trim(category), ''), 'C')
where rank_standard = 'C' and rank_latin = 'C';

-- New users: set ranks from metadata or default
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
		coalesce(nullif(new.raw_user_meta_data->>'rank_standard', ''), 'C'),
		coalesce(nullif(new.raw_user_meta_data->>'rank_latin', ''), 'C')
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
