-- =============================================================================
-- Seed: Mock timetables of ALL types with lots of lessons for testing.
-- Use when you have deleted all timetables; couples and profiles must exist.
-- Uses same club_id and profile/couple IDs as seed_timetables_full.
-- Run in Supabase SQL Editor. Creates: 5 timetables (weekly, bi_weekly, monthly,
-- weekends_only, fixed_period) + preferences/targets/limits + many lessons.
-- =============================================================================

DO $$
DECLARE
  v_club_id     uuid := '0afc9cb2-2e32-4327-8052-3b7787371acb';
  -- Students (from your profiles)
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

  v_couple_ab   uuid;
  v_couple_cd   uuid;
  v_couple_pl   uuid;
  v_couple_mt   uuid;
  v_room1       uuid;
  v_room2       uuid;
  v_room3       uuid;
  v_tt          uuid;
  v_tt_weekly   uuid;
  v_tt_bi       uuid;
  v_tt_monthly  uuid;
  v_tt_weekend  uuid;
  v_tt_fixed    uuid;
  v_d           date;
  v_start       text;
  v_end         text;
  v_trainers    uuid[] := ARRAY[v_jupik, v_alina, v_matus_t];
  v_rooms       uuid[];
  v_ti          int;
  v_ri          int;
  v_students    uuid[] := ARRAY[v_carol, v_dave, v_alice, v_bob, v_matus, v_papanica, v_lukas];
  v_couples     uuid[];
BEGIN
  -- Get existing couples by name (must already exist)
  SELECT id INTO v_couple_ab FROM public.couples WHERE club_id = v_club_id AND (name = 'Alice & Bob' OR (partner1_user_id = v_alice AND partner2_user_id = v_bob)) LIMIT 1;
  SELECT id INTO v_couple_cd FROM public.couples WHERE club_id = v_club_id AND (name = 'Carol & Dave' OR (partner1_user_id = v_carol AND partner2_user_id = v_dave)) LIMIT 1;
  SELECT id INTO v_couple_pl FROM public.couples WHERE club_id = v_club_id AND name LIKE '%Papanica%' LIMIT 1;
  SELECT id INTO v_couple_mt FROM public.couples WHERE club_id = v_club_id AND (name LIKE '%Marek%' OR (partner1_user_id = v_marek AND partner2_user_id = v_test_acc)) LIMIT 1;

  -- Ensure couples exist (fallback: create minimal if missing)
  IF v_couple_ab IS NULL THEN INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id) VALUES (v_club_id, 'Alice & Bob', v_alice, v_bob) RETURNING id INTO v_couple_ab; END IF;
  IF v_couple_cd IS NULL THEN INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id) VALUES (v_club_id, 'Carol & Dave', v_carol, v_dave) RETURNING id INTO v_couple_cd; END IF;
  IF v_couple_pl IS NULL THEN INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id) VALUES (v_club_id, 'Papanica TV & Lukáš', v_papanica, v_lukas) RETURNING id INTO v_couple_pl; END IF;
  IF v_couple_mt IS NULL THEN INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id) VALUES (v_club_id, 'Marek & Test', v_marek, v_test_acc) RETURNING id INTO v_couple_mt; END IF;

  v_couples := ARRAY[v_couple_ab, v_couple_cd, v_couple_pl, v_couple_mt];

  -- Rooms (insert if not exist)
  INSERT INTO public.rooms (club_id, name) SELECT v_club_id, 'Main studio' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Main studio');
  INSERT INTO public.rooms (club_id, name) SELECT v_club_id, 'Room A' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Room A');
  INSERT INTO public.rooms (club_id, name) SELECT v_club_id, 'Room B' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Room B');
  SELECT id INTO v_room1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Main studio' LIMIT 1;
  SELECT id INTO v_room2 FROM public.rooms WHERE club_id = v_club_id AND name = 'Room A' LIMIT 1;
  SELECT id INTO v_room3 FROM public.rooms WHERE club_id = v_club_id AND name = 'Room B' LIMIT 1;
  v_rooms := ARRAY[v_room1, COALESCE(v_room2, v_room1), COALESCE(v_room3, v_room1)];

  -- Ensure trainers in club
  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES (v_club_id, v_jupik, 'trainer'), (v_club_id, v_alina, 'trainer'), (v_club_id, v_matus_t, 'trainer')
  ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- -------------------------------------------------------------------------
  -- 1. Weekly program
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Weekly program', 'weekly', '2026-02-01', '09:00', '20:00')
  RETURNING id INTO v_tt_weekly;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt_weekly, 45, 180, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt_weekly, v_jupik, 10), (v_tt_weekly, v_alina, 10), (v_tt_weekly, v_matus_t, 10);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt_weekly, v_carol, NULL, 2, 'high', v_jupik),
    (v_tt_weekly, v_dave, NULL, 2, 'medium', v_alina),
    (v_tt_weekly, NULL, v_couple_ab, 2, 'high', NULL),
    (v_tt_weekly, NULL, v_couple_cd, 2, 'medium', v_jupik);

  -- -------------------------------------------------------------------------
  -- 2. Bi-weekly program
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Bi-weekly program', 'bi_weekly', '2026-02-01', '14:00', '20:00')
  RETURNING id INTO v_tt_bi;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt_bi, 45, 120, 15, 'second_half', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt_bi, v_jupik, 8), (v_tt_bi, v_alina, 8), (v_tt_bi, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt_bi, v_matus, NULL, 1, 'medium', NULL),
    (v_tt_bi, NULL, v_couple_pl, 2, 'high', v_matus_t),
    (v_tt_bi, NULL, v_couple_mt, 2, 'medium', v_jupik);

  -- -------------------------------------------------------------------------
  -- 3. Monthly program
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Monthly program', 'monthly', '2026-02-01', '15:00', '21:00')
  RETURNING id INTO v_tt_monthly;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt_monthly, 45, 120, 15, 'second_half', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt_monthly, v_jupik, 8), (v_tt_monthly, v_alina, 8), (v_tt_monthly, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt_monthly, v_alice, NULL, 2, 'high', v_alina),
    (v_tt_monthly, v_bob, NULL, 2, 'medium', v_jupik),
    (v_tt_monthly, NULL, v_couple_cd, 2, 'high', NULL);

  -- -------------------------------------------------------------------------
  -- 4. Weekend program
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Weekend program', 'weekends_only', '2026-02-01', '09:00', '18:00')
  RETURNING id INTO v_tt_weekend;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt_weekend, 45, 120, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt_weekend, v_jupik, 6), (v_tt_weekend, v_alina, 6), (v_tt_weekend, v_matus_t, 6);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt_weekend, NULL, v_couple_ab, 1, 'high', v_jupik),
    (v_tt_weekend, NULL, v_couple_cd, 1, 'high', v_alina),
    (v_tt_weekend, NULL, v_couple_pl, 1, 'medium', v_matus_t);

  -- -------------------------------------------------------------------------
  -- 5. Spring fixed (fixed period)
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, valid_until, day_start, day_end)
  VALUES (v_club_id, 'Spring 2026 fixed', 'fixed_period', '2026-02-01', '2026-06-30', '15:00', '20:00')
  RETURNING id INTO v_tt_fixed;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt_fixed, 45, 120, 15, 'first_half', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt_fixed, v_jupik, 8), (v_tt_fixed, v_alina, 8), (v_tt_fixed, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt_fixed, v_carol, NULL, 2, 'high', v_alina),
    (v_tt_fixed, v_dave, NULL, 2, 'medium', v_jupik),
    (v_tt_fixed, v_papanica, NULL, 1, 'low', NULL),
    (v_tt_fixed, v_lukas, NULL, 1, 'low', NULL),
    (v_tt_fixed, NULL, v_couple_ab, 2, 'high', v_jupik),
    (v_tt_fixed, NULL, v_couple_cd, 2, 'high', v_alina);

  -- -------------------------------------------------------------------------
  -- 6. Insert many lessons per timetable (spread over weeks, varied participants)
  -- -------------------------------------------------------------------------
  -- Helper: insert one lesson
  FOR v_d IN SELECT d FROM generate_series('2026-02-24'::date, '2026-05-31'::date, '1 day'::interval) d LOOP
    -- Weekday lessons for weekly, bi_weekly, monthly, fixed (Mon=1 .. Fri=5)
    IF extract(isodow FROM v_d) <= 5 THEN
      FOR v_ti IN 1..4 LOOP
        v_start := to_char(v_d, 'YYYY-MM-DD') || 'T' || lpad((14 + (v_ti-1)*2)::text, 2, '0') || ':00:00';
        v_end   := to_char(v_d, 'YYYY-MM-DD') || 'T' || lpad((14 + (v_ti-1)*2)::text, 2, '0') || ':45:00';
        v_ri := 1 + (v_ti + extract(isodow FROM v_d)::int) % 3;
        INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static)
        VALUES (v_tt_weekly, (CASE WHEN v_ti % 2 = 0 THEN 'individual' ELSE 'couple' END)::public.lesson_type, v_start::timestamptz, v_end::timestamptz, v_rooms[v_ri], v_trainers[1 + v_ti % 3], CASE WHEN v_ti % 2 = 0 THEN v_students[1 + (v_ti + extract(isodow FROM v_d)::int) % 7] ELSE NULL END, CASE WHEN v_ti % 2 = 1 THEN v_couples[1 + v_ti % 4] ELSE NULL END, false);
        INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static)
        VALUES (v_tt_bi, (CASE WHEN (v_ti+1) % 2 = 0 THEN 'individual' ELSE 'couple' END)::public.lesson_type, v_start::timestamptz, v_end::timestamptz, v_rooms[1 + (v_ti+1) % 3], v_trainers[1 + (v_ti+1) % 3], CASE WHEN (v_ti+1) % 2 = 0 THEN v_students[1 + (v_ti+2) % 7] ELSE NULL END, CASE WHEN (v_ti+1) % 2 = 1 THEN v_couples[1 + (v_ti+2) % 4] ELSE NULL END, false);
        INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static)
        VALUES (v_tt_monthly, 'individual'::public.lesson_type, v_start::timestamptz, v_end::timestamptz, v_rooms[1 + (v_ti+2) % 3], v_trainers[1 + (v_ti+2) % 3], v_students[1 + (v_ti + extract(isodow FROM v_d)::int) % 7], NULL, false);
        INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static)
        VALUES (v_tt_fixed, (CASE WHEN (v_ti+3) % 2 = 0 THEN 'individual' ELSE 'couple' END)::public.lesson_type, v_start::timestamptz, v_end::timestamptz, v_rooms[1 + (v_ti+3) % 3], v_trainers[1 + (v_ti+3) % 3], CASE WHEN (v_ti+3) % 2 = 0 THEN v_students[1 + (v_ti+1) % 7] ELSE NULL END, CASE WHEN (v_ti+3) % 2 = 1 THEN v_couples[1 + (v_ti+3) % 4] ELSE NULL END, false);
      END LOOP;
    END IF;
    -- Weekend lessons for weekend program only (Sat=6, Sun=7)
    IF extract(isodow FROM v_d) >= 6 THEN
      FOR v_ti IN 1..3 LOOP
        v_start := to_char(v_d, 'YYYY-MM-DD') || 'T' || lpad((9 + (v_ti-1)*2)::text, 2, '0') || ':00:00';
        v_end   := to_char(v_d, 'YYYY-MM-DD') || 'T' || lpad((9 + (v_ti-1)*2)::text, 2, '0') || ':45:00';
        INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static)
        VALUES (v_tt_weekend, 'couple'::public.lesson_type, v_start::timestamptz, v_end::timestamptz, v_rooms[1 + v_ti % 3], v_trainers[1 + v_ti % 3], NULL, v_couples[1 + v_ti % 4], false);
      END LOOP;
    END IF;
  END LOOP;

  RAISE NOTICE 'Seed complete: 5 timetables (weekly, bi_weekly, monthly, weekends_only, fixed_period) with lessons. Club: %', v_club_id;
END $$;
