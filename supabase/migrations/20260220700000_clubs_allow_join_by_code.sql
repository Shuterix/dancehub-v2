-- Allow authenticated users to read clubs so they can look up a club by code when joining.
-- Without this, users cannot SELECT the club row (they are not members yet).

create policy "Authenticated users can read clubs to join by code"
	on public.clubs for select
	using (auth.uid() is not null);
