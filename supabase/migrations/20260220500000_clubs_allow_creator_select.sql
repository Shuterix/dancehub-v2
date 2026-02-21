-- Allow club creators to read their club (so INSERT ... RETURNING works before membership exists).

create policy "Club creators can read own club"
	on public.clubs for select
	using (created_by = auth.uid());
