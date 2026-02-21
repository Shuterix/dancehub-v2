-- Fix infinite recursion: profiles policy reads club_members, and club_members policy reads profiles.
-- Use a security definer function so club_members policy does not query profiles under RLS.

create or replace function public.get_my_club_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select club_id from public.profiles where id = auth.uid() and club_id is not null limit 1;
$$;

drop policy if exists "Users can read members of their club" on public.club_members;

create policy "Users can read members of their club"
	on public.club_members for select
	using (club_id = get_my_club_id());
