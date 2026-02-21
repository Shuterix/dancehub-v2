-- Link couples to two members (for pairing). Unpaired = students not in any couple.

alter table public.couples
	add column if not exists partner1_user_id uuid references auth.users (id) on delete set null,
	add column if not exists partner2_user_id uuid references auth.users (id) on delete set null;

-- Allow club members to read all members of their club (for club page). Uses profiles to avoid recursion.
create policy "Users can read members of their club"
	on public.club_members for select
	using (
		club_id = (select club_id from public.profiles where id = auth.uid() and club_id is not null)
	);
