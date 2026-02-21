-- Fix infinite recursion: club_members SELECT policy must not reference club_members.

drop policy if exists "Users can read club_members for their clubs" on public.club_members;

create policy "Users can read own club_members"
	on public.club_members for select
	using (user_id = auth.uid());
