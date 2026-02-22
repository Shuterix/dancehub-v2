-- =============================================================================
-- Seed: Remove all timetables and related data; create couples, groups,
-- availability for everyone in the club; then create one timetable per
-- recurrence type (weekly, bi_weekly, monthly, weekends_only, fixed_period)
-- with sufficient targets and trainer limits so data is playable.
-- =============================================================================
-- Club: 0afc9cb2-2e32-4327-8052-3b7787371acb
-- Uses profile IDs from your club (Alice, Bob, Carol, Dave, Marek, Test acc,
-- Papanica TV, Lukáš, Matúš Lupták; trainers: Jupik 100, Alina, Matúš Lupták).
-- Ensure club_members has role 'trainer' for Jupik, Alina, Matúš (trainer) so
-- you can generate lessons. Run in Supabase SQL Editor.
-- =============================================================================

DO $$
DECLARE
  v_club_id     uuid := '0afc9cb2-2e32-4327-8052-3b7787371acb';
  -- Students
  v_alice       uuid := '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c';
  v_bob         uuid := 'af2730ff-3c00-4849-bec7-cc2223760e7b';
  v_carol       uuid := 'af2c716a-a329-4e6e-8b0d-df80a3471129';
  v_dave        uuid := 'a4704f91-55b8-4e15-8d05-5eaf9a913a84';
  v_marek       uuid := '25b67f34-cbdd-40ea-ba8d-0181cdef7c6e';
  v_test_acc    uuid := '579f1722-16a5-419f-a90d-92a6340f998b';
  v_papanica    uuid := '9365b4b1-8132-436b-9725-cfb7f7ba5a49';
  v_lukas       uuid := 'e54cd6d9-494c-40ea-965c-3de284c8975a';
  v_matus       uuid := '5bca37d2-356f-4902-acc8-b5b9854afc2e';
  -- Trainers
  v_jupik       uuid := '2800b8c5-cac7-4df2-ab75-d61c2e0968e8';
  v_alina       uuid := '6bf38b0d-9b88-4cd8-90a3-2c10e3f47a88';
  v_matus_t     uuid := 'fc642e02-dc97-4c75-80b3-dedd79ce8360';

  v_avail       jsonb := '[
    {"day": "monday", "start": "15:00", "end": "20:00"},
    {"day": "tuesday", "start": "15:00", "end": "20:00"},
    {"day": "wednesday", "start": "15:00", "end": "20:00"},
    {"day": "thursday", "start": "15:00", "end": "20:00"},
    {"day": "friday", "start": "15:00", "end": "20:00"},
    {"day": "saturday", "start": "09:00", "end": "18:00"},
    {"day": "sunday", "start": "09:00", "end": "18:00"}
  ]'::jsonb;

  v_couple_ab   uuid;
  v_couple_cd   uuid;
  v_couple_pl   uuid;
  v_couple_mt   uuid;
  v_group_beg   uuid;
  v_group_lat   uuid;
  v_type_std    uuid;
  v_type_lat    uuid;
  v_room1       uuid;
  v_room2       uuid;
  v_tt          uuid;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Delete all timetable-related data for this club (cascade order)
  -- -------------------------------------------------------------------------
  DELETE FROM public.lessons
  WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);

  DELETE FROM public.timetable_group_targets
  WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);

  DELETE FROM public.timetable_targets
  WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);

  DELETE FROM public.timetable_trainer_limits
  WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);

  DELETE FROM public.timetable_preferences
  WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);

  DELETE FROM public.timetables WHERE club_id = v_club_id;

  -- Remove existing groups and group-related data for this club (so we can recreate)
  DELETE FROM public.group_members
  WHERE group_id IN (SELECT id FROM public.groups WHERE club_id = v_club_id);

  DELETE FROM public.timetable_group_targets
  WHERE group_id IN (SELECT id FROM public.groups WHERE club_id = v_club_id);
  -- (already deleted above with timetable delete; safe to run)

  DELETE FROM public.group_lesson_types WHERE club_id = v_club_id;
  DELETE FROM public.groups WHERE club_id = v_club_id;

  -- Remove existing couples for this club
  DELETE FROM public.couples WHERE club_id = v_club_id;

  -- -------------------------------------------------------------------------
  -- 2. Set availability for all club members (profiles)
  -- -------------------------------------------------------------------------
  UPDATE public.profiles
  SET availability = v_avail, updated_at = now()
  WHERE club_id = v_club_id;

  -- Ensure trainers are in club_members so they can generate timetables
  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES
    (v_club_id, v_jupik, 'trainer'),
    (v_club_id, v_alina, 'trainer'),
    (v_club_id, v_matus_t, 'trainer')
  ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- -------------------------------------------------------------------------
  -- 3. Create couples (with same availability so solver can place lessons)
  -- -------------------------------------------------------------------------
  INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id, availability)
  VALUES
    (v_club_id, 'Alice & Bob', v_alice, v_bob, v_avail),
    (v_club_id, 'Carol & Dave', v_carol, v_dave, v_avail),
    (v_club_id, 'Papanica TV & Lukáš', v_papanica, v_lukas, v_avail),
    (v_club_id, 'Marek & Test acc', v_marek, v_test_acc, v_avail);

  SELECT id INTO v_couple_ab FROM public.couples WHERE club_id = v_club_id AND name = 'Alice & Bob' LIMIT 1;
  SELECT id INTO v_couple_cd FROM public.couples WHERE club_id = v_club_id AND name = 'Carol & Dave' LIMIT 1;
  SELECT id INTO v_couple_pl FROM public.couples WHERE club_id = v_club_id AND name = 'Papanica TV & Lukáš' LIMIT 1;
  SELECT id INTO v_couple_mt FROM public.couples WHERE club_id = v_club_id AND name = 'Marek & Test acc' LIMIT 1;

  -- -------------------------------------------------------------------------
  -- 4. Create groups and group_lesson_types
  -- -------------------------------------------------------------------------
  INSERT INTO public.groups (club_id, name, availability)
  VALUES
    (v_club_id, 'Beginners', v_avail),
    (v_club_id, 'Advanced Latina', v_avail);

  SELECT id INTO v_group_beg FROM public.groups WHERE club_id = v_club_id AND name = 'Beginners' LIMIT 1;
  SELECT id INTO v_group_lat FROM public.groups WHERE club_id = v_club_id AND name = 'Advanced Latina' LIMIT 1;

  -- Group members: Beginners = couple A&B + couple C&D + student Matúš
  INSERT INTO public.group_members (group_id, user_id, couple_id)
  VALUES
    (v_group_beg, NULL, v_couple_ab),
    (v_group_beg, NULL, v_couple_cd),
    (v_group_beg, v_matus, NULL);

  -- Advanced Latina = Papanica&Lukáš + Marek&Test acc
  INSERT INTO public.group_members (group_id, user_id, couple_id)
  VALUES
    (v_group_lat, NULL, v_couple_pl),
    (v_group_lat, NULL, v_couple_mt);

  -- Group lesson types (name, duration_minutes)
  INSERT INTO public.group_lesson_types (club_id, group_id, name, duration_minutes)
  VALUES
    (v_club_id, v_group_beg, 'Standard', 60),
    (v_club_id, v_group_lat, 'Latina', 90);

  SELECT id INTO v_type_std FROM public.group_lesson_types WHERE club_id = v_club_id AND group_id = v_group_beg AND name = 'Standard' LIMIT 1;
  SELECT id INTO v_type_lat FROM public.group_lesson_types WHERE club_id = v_club_id AND group_id = v_group_lat AND name = 'Latina' LIMIT 1;

  -- -------------------------------------------------------------------------
  -- 5. Ensure rooms exist
  -- -------------------------------------------------------------------------
  INSERT INTO public.rooms (club_id, name)
  SELECT v_club_id, 'Main studio' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Main studio');
  INSERT INTO public.rooms (club_id, name)
  SELECT v_club_id, 'Small room' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Small room');
  SELECT id INTO v_room1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Main studio' LIMIT 1;
  SELECT id INTO v_room2 FROM public.rooms WHERE club_id = v_club_id AND name = 'Small room' LIMIT 1;

  IF v_room1 IS NOT NULL AND v_room2 IS NOT NULL THEN
    INSERT INTO public.room_teachers (room_id, user_id)
    VALUES (v_room1, v_jupik), (v_room1, v_alina), (v_room1, v_matus_t), (v_room2, v_jupik), (v_room2, v_alina), (v_room2, v_matus_t)
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 6. Create one timetable per recurrence type
  -- -------------------------------------------------------------------------

  -- ----- Weekly (standard)
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Weekly program', 'weekly', '2026-02-01', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt, v_jupik, 8), (v_tt, v_alina, 8), (v_tt, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt, v_carol, NULL, 2, 'high', v_jupik),
    (v_tt, v_dave, NULL, 2, 'medium', v_alina),
    (v_tt, NULL, v_couple_ab, 2, 'high', NULL),
    (v_tt, NULL, v_couple_cd, 2, 'medium', v_jupik);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES (v_tt, v_group_beg, v_type_std, 1, 'medium', v_alina);

  -- ----- Bi-weekly
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Bi-weekly program', 'bi_weekly', '2026-02-01', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt, v_jupik, 8), (v_tt, v_alina, 8), (v_tt, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt, v_matus, NULL, 1, 'medium', NULL),
    (v_tt, NULL, v_couple_pl, 2, 'high', v_matus_t),
    (v_tt, NULL, v_couple_mt, 2, 'medium', v_jupik);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES (v_tt, v_group_lat, v_type_lat, 1, 'high', v_alina);

  -- ----- Monthly
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Monthly program', 'monthly', '2026-02-01', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'second_half', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt, v_jupik, 8), (v_tt, v_alina, 8), (v_tt, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt, v_alice, NULL, 2, 'high', v_alina),
    (v_tt, v_bob, NULL, 2, 'medium', v_jupik),
    (v_tt, NULL, v_couple_cd, 2, 'high', NULL);

  -- ----- Weekends only
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Weekend program', 'weekends_only', '2026-02-01', '09:00', '18:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt, v_jupik, 6), (v_tt, v_alina, 6), (v_tt, v_matus_t, 6);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt, NULL, v_couple_ab, 1, 'high', v_jupik),
    (v_tt, NULL, v_couple_cd, 1, 'high', v_alina),
    (v_tt, NULL, v_couple_pl, 1, 'medium', v_matus_t);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES (v_tt, v_group_beg, v_type_std, 1, 'medium', NULL);

  -- ----- Fixed period (with valid_until)
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, valid_until, day_start, day_end)
  VALUES (v_club_id, 'Spring 2026 fixed', 'fixed_period', '2026-02-01', '2026-06-30', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'first_half', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt, v_jupik, 8), (v_tt, v_alina, 8), (v_tt, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt, v_carol, NULL, 2, 'high', v_alina),
    (v_tt, v_dave, NULL, 2, 'medium', v_jupik),
    (v_tt, v_papanica, NULL, 1, 'low', NULL),
    (v_tt, v_lukas, NULL, 1, 'low', NULL),
    (v_tt, NULL, v_couple_ab, 2, 'high', v_jupik),
    (v_tt, NULL, v_couple_cd, 2, 'high', v_alina);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES (v_tt, v_group_beg, v_type_std, 1, 'medium', v_alina), (v_tt, v_group_lat, v_type_lat, 1, 'medium', v_matus_t);

  RAISE NOTICE 'Seed complete: 4 couples, 2 groups with lesson types, 5 timetables (weekly, bi_weekly, monthly, weekends_only, fixed_period). Club: %', v_club_id;
END $$;
