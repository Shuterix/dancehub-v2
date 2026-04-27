-- =============================================================================
-- Maturita demo: wipe ALL timetables, then create a small clean showcase.
--
-- Deletes every timetable in the database (lessons + targets + prefs cascade).
-- Then inserts 3 simple timetables for ONE club picked from real data:
--   1) Weekly — main (couple targets, trainer limits)
--   2) Weekends only — second recurrence flavour
--   3) Paused — shows inactive timetable in list without affecting generation
--
-- Requirements in Supabase before running:
--   • At least one club with ≥1 trainer (club_members.role = 'trainer')
--   • ≥2 couples in that club (couples.club_id)
--
-- Configure club selection below. Run in Supabase Dashboard → SQL Editor.
-- =============================================================================

-- Step 1 — remove every timetable (children cascade via ON DELETE CASCADE)
DELETE FROM public.timetables;

-- Step 2 — insert demo timetables for your presentation club
DO $$
DECLARE
	-- 🔧 Set your club join code (exactly as in the app), or NULL = auto-pick first club that has trainers + couples
	club_join_code text := NULL;

	v_club_id uuid;
	v_tt_weekly uuid;
	v_tt_weekend uuid;
	v_tt_paused uuid;
	v_week_start date := date_trunc('week', (current_timestamp AT TIME ZONE 'Europe/Bratislava')::date)::date;

	v_trainer uuid;
	v_trainers uuid[];
	v_couple_a uuid;
	v_couple_b uuid;
	v_room uuid;
BEGIN
	-- Resolve club_id
	IF club_join_code IS NOT NULL AND trim(club_join_code) <> '' THEN
		SELECT id INTO v_club_id FROM public.clubs WHERE code = trim(club_join_code);
		IF v_club_id IS NULL THEN
			RAISE EXCEPTION 'No club found with code %. Fix club_join_code at top of script.', club_join_code;
		END IF;
	ELSE
		SELECT c.id INTO v_club_id
		FROM public.clubs c
		WHERE EXISTS (
			SELECT 1 FROM public.club_members cm
			WHERE cm.club_id = c.id AND cm.role = 'trainer'
		)
		AND EXISTS (
			SELECT 1 FROM public.couples cp WHERE cp.club_id = c.id
		)
		ORDER BY c.created_at
		LIMIT 1;
	END IF;

	IF v_club_id IS NULL THEN
		RAISE EXCEPTION 'Could not find a club with both trainers and couples. Create/join a club first or set club_join_code.';
	END IF;

	SELECT id INTO v_couple_a FROM public.couples WHERE club_id = v_club_id ORDER BY created_at LIMIT 1;
	SELECT id INTO v_couple_b FROM public.couples WHERE club_id = v_club_id ORDER BY created_at OFFSET 1 LIMIT 1;

	IF v_couple_a IS NULL THEN
		RAISE EXCEPTION 'Club % has no couples. Add couples in the app first.', v_club_id;
	END IF;

	SELECT array_agg(cm.user_id ORDER BY cm.created_at)
	INTO v_trainers
	FROM public.club_members cm
	WHERE cm.club_id = v_club_id AND cm.role = 'trainer';

	IF v_trainers IS NULL OR cardinality(v_trainers) < 1 THEN
		RAISE EXCEPTION 'Club % has no trainers.', v_club_id;
	END IF;

	v_trainer := v_trainers[1];

	-- Ensure at least one room (Generate shortfalls with "No rooms configured" otherwise)
	SELECT id INTO v_room FROM public.rooms WHERE club_id = v_club_id LIMIT 1;
	IF v_room IS NULL THEN
		v_room := gen_random_uuid();
		INSERT INTO public.rooms (id, club_id, name) VALUES (v_room, v_club_id, 'Maturita — Hlavná sála');
		INSERT INTO public.room_teachers (room_id, user_id)
		SELECT v_room, t.uid FROM unnest(v_trainers) AS t(uid);
	END IF;

	-- --- Timetable 1: weekly flagship (open → pick week → Generate) ---
	v_tt_weekly := gen_random_uuid();
	INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
	VALUES (
		v_tt_weekly,
		v_club_id,
		'Maturita — Týždenný rozvrh',
		'weekly',
		v_week_start,
		NULL,
		true,
		'09:00'::time,
		'21:00'::time
	);

	INSERT INTO public.timetable_preferences (
		timetable_id,
		individual_lesson_duration_minutes,
		distribution,
		max_consecutive_minutes_per_trainer,
		min_break_minutes_after_consecutive,
		buffer_between_lessons_minutes
	)
	VALUES (v_tt_weekly, 45, 'same', 120, 15, 0);

	INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
	SELECT v_tt_weekly, t.uid, 8
	FROM unnest(v_trainers) AS t(uid);

	INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
	VALUES
		(v_tt_weekly, NULL, v_couple_a, 3, 'high', v_trainer);

	IF v_couple_b IS NOT NULL THEN
		INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
		VALUES (v_tt_weekly, NULL, v_couple_b, 2, 'medium', NULL);
	END IF;

	-- --- Timetable 2: weekends only (same club, lighter targets) ---
	v_tt_weekend := gen_random_uuid();
	INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
	VALUES (
		v_tt_weekend,
		v_club_id,
		'Maturita — Víkendy',
		'weekends_only',
		v_week_start,
		NULL,
		true,
		'10:00'::time,
		'18:00'::time
	);

	INSERT INTO public.timetable_preferences (
		timetable_id,
		individual_lesson_duration_minutes,
		distribution,
		max_consecutive_minutes_per_trainer,
		min_break_minutes_after_consecutive,
		buffer_between_lessons_minutes
	)
	VALUES (v_tt_weekend, 45, 'same', 120, 15, 0);

	INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
	SELECT v_tt_weekend, t.uid, 6
	FROM unnest(v_trainers) AS t(uid);

	INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
	VALUES (v_tt_weekend, NULL, v_couple_a, 2, 'medium', NULL);

	-- --- Timetable 3: paused (visible in list, does not participate in active scheduling noise) ---
	v_tt_paused := gen_random_uuid();
	INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, paused_at, day_start, day_end)
	VALUES (
		v_tt_paused,
		v_club_id,
		'Maturita — Archív (pozastavený)',
		'weekly',
		v_week_start - 90,
		v_week_start + 30,
		false,
		now(),
		'09:00'::time,
		'21:00'::time
	);

	INSERT INTO public.timetable_preferences (
		timetable_id,
		individual_lesson_duration_minutes,
		distribution,
		max_consecutive_minutes_per_trainer,
		min_break_minutes_after_consecutive,
		buffer_between_lessons_minutes
	)
	VALUES (v_tt_paused, 45, 'same', 120, 15, 0);

	INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
	SELECT v_tt_paused, t.uid, 6
	FROM unnest(v_trainers) AS t(uid);

	INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
	VALUES (v_tt_paused, NULL, v_couple_a, 1, 'low', NULL);

	RAISE NOTICE 'Maturita demo timetables created for club_id=% (weekly %, weekends %, paused %). Log in as a trainer of this club to generate lessons.',
		v_club_id, v_tt_weekly, v_tt_weekend, v_tt_paused;
END $$;
