-- Allow trainers to update rank_standard and rank_latin of students in their club.
-- The app only updates these fields via PATCH /api/club/member-rank.

create policy "Trainers can update student ranks in their club"
	on public.profiles for update
	using (
		auth.uid() in (select user_id from public.club_members where club_id = get_my_club_id() and role = 'trainer')
		and id in (select user_id from public.club_members where club_id = get_my_club_id() and role = 'student')
	);
