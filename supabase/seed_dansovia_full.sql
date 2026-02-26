-- =============================================================================
-- Seed: Dansovia club – full mock data
-- Club id: 0afc9cb2-2e32-4327-8052-3b7787371acb
-- Does not touch: clubs, club_members, profiles (except availability updates).
-- Cleans then creates: rooms, room_teachers, couples, groups, group_members,
-- group_lesson_types, timetables, preferences, trainer_limits, targets,
-- timetable_group_targets, and sample lessons.
-- Run in Supabase SQL Editor after migrations.
-- =============================================================================

DO $$
DECLARE
  v_club_id uuid := '0afc9cb2-2e32-4327-8052-3b7787371acb';

  -- Students (from your club_members)
  v_marek     uuid := '25b67f34-cbdd-40ea-ba8d-0181cdef7c6e';  -- Marek Topolsky
  v_matus_s   uuid := '5bca37d2-356f-4902-acc8-b5b9854afc2e';  -- Matúš Lupták (student)
  v_papanica  uuid := '9365b4b1-8132-436b-9725-cfb7f7ba5a49';  -- Papanica TV
  v_bruno     uuid := 'a0ab19d2-7978-4ae0-b5be-90aba61fb29a';  -- Bruno Mravec
  v_dave      uuid := 'a4704f91-55b8-4e15-8d05-5eaf9a913a84';  -- Dave Brown
  v_carol     uuid := 'af2c716a-a329-4e6e-8b0d-df80a3471129';  -- Carol White
  v_lukas     uuid := 'e54cd6d9-494c-40ea-965c-3de284c8975a';  -- Lukáš Eliaš

  -- Trainers (from your club_members)
  v_jakub     uuid := '07a0f840-c115-45f2-b7b6-c878daa45096';  -- Jakub Žák
  v_jupik     uuid := '2800b8c5-cac7-4df2-ab75-d61c2e0968e8';  -- Jupik 100
  v_maxim     uuid := '679802c1-dfa0-4dba-832f-2f7c0fa70b7f';  -- Maxim Fruhwald
  v_alina     uuid := '6bf38b0d-9b88-4cd8-90a3-2c10e3f47a88';  -- Alina
  v_alice     uuid := '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c';  -- Alice Smith
  v_bob       uuid := 'af2730ff-3c00-4849-bec7-cc2223760e7b';  -- Bob Jones
  v_matus_t   uuid := 'fc642e02-dc97-4c75-80b3-dedd79ce8360';  -- Matúš Lupták (trainer)

  v_avail_full jsonb := '[
    {"day":"monday","start":"15:00","end":"20:00"},
    {"day":"tuesday","start":"15:00","end":"20:00"},
    {"day":"wednesday","start":"15:00","end":"20:00"},
    {"day":"thursday","start":"15:00","end":"20:00"},
    {"day":"friday","start":"15:00","end":"20:00"},
    {"day":"saturday","start":"09:00","end":"18:00"},
    {"day":"sunday","start":"09:00","end":"18:00"}
  ]'::jsonb;

  v_avail_weekdays jsonb := '[
    {"day":"monday","start":"15:00","end":"20:00"},
    {"day":"tuesday","start":"15:00","end":"20:00"},
    {"day":"wednesday","start":"15:00","end":"20:00"},
    {"day":"thursday","start":"15:00","end":"20:00"},
    {"day":"friday","start":"15:00","end":"20:00"}
  ]'::jsonb;

  v_avail_weekends jsonb := '[
    {"day":"saturday","start":"09:00","end":"18:00"},
    {"day":"sunday","start":"09:00","end":"18:00"}
  ]'::jsonb;

  v_avail_evening jsonb := '[
    {"day":"monday","start":"17:00","end":"21:00"},
    {"day":"wednesday","start":"17:00","end":"21:00"},
    {"day":"friday","start":"17:00","end":"21:00"}
  ]'::jsonb;

  v_couple_ab  uuid;
  v_couple_cd  uuid;
  v_couple_pl  uuid;
  v_couple_mb  uuid;
  v_group_beg  uuid;
  v_group_lat  uuid;
  v_group_comp uuid;
  v_type_std   uuid;
  v_type_lat   uuid;
  v_type_adv   uuid;
  v_room1      uuid;
  v_room2      uuid;
  v_room3      uuid;
  v_tt         uuid;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Clean existing data for this club (keep club + club_members + profiles)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lessons') THEN
    DELETE FROM public.lessons WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timetable_group_targets') THEN
    DELETE FROM public.timetable_group_targets WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timetable_targets') THEN
    DELETE FROM public.timetable_targets WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timetable_trainer_limits') THEN
    DELETE FROM public.timetable_trainer_limits WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timetable_preferences') THEN
    DELETE FROM public.timetable_preferences WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  END IF;
  DELETE FROM public.timetables WHERE club_id = v_club_id;
  DELETE FROM public.group_members WHERE group_id IN (SELECT id FROM public.groups WHERE club_id = v_club_id);
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timetable_group_targets') THEN
    DELETE FROM public.timetable_group_targets WHERE group_id IN (SELECT id FROM public.groups WHERE club_id = v_club_id);
  END IF;
  DELETE FROM public.group_lesson_types WHERE club_id = v_club_id;
  DELETE FROM public.groups WHERE club_id = v_club_id;
  DELETE FROM public.room_teachers WHERE room_id IN (SELECT id FROM public.rooms WHERE club_id = v_club_id);
  DELETE FROM public.rooms WHERE club_id = v_club_id;
  DELETE FROM public.couples WHERE club_id = v_club_id;

  -- -------------------------------------------------------------------------
  -- 2. Set varied availability on profiles (different windows for variety)
  -- -------------------------------------------------------------------------
  UPDATE public.profiles SET availability = v_avail_full,   updated_at = now() WHERE id = v_marek;
  UPDATE public.profiles SET availability = v_avail_full,     updated_at = now() WHERE id = v_matus_s;
  UPDATE public.profiles SET availability = v_avail_weekdays, updated_at = now() WHERE id = v_papanica;
  UPDATE public.profiles SET availability = v_avail_weekends, updated_at = now() WHERE id = v_bruno;
  UPDATE public.profiles SET availability = v_avail_full,     updated_at = now() WHERE id = v_dave;
  UPDATE public.profiles SET availability = v_avail_evening, updated_at = now() WHERE id = v_carol;
  UPDATE public.profiles SET availability = v_avail_full,     updated_at = now() WHERE id = v_lukas;
  UPDATE public.profiles SET availability = v_avail_full,     updated_at = now() WHERE id IN (v_jakub, v_jupik, v_maxim, v_alina, v_alice, v_bob, v_matus_t);

  -- -------------------------------------------------------------------------
  -- 3. Rooms + room_teachers (3 rooms, all trainers can teach in each)
  -- -------------------------------------------------------------------------
  INSERT INTO public.rooms (club_id, name) VALUES
    (v_club_id, 'Main studio'),
    (v_club_id, 'Small room'),
    (v_club_id, 'Studio B');
  SELECT id INTO v_room1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Main studio' LIMIT 1;
  SELECT id INTO v_room2 FROM public.rooms WHERE club_id = v_club_id AND name = 'Small room' LIMIT 1;
  SELECT id INTO v_room3 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio B' LIMIT 1;
  INSERT INTO public.room_teachers (room_id, user_id)
  SELECT r.id, u.id
  FROM (SELECT v_room1 AS id UNION ALL SELECT v_room2 UNION ALL SELECT v_room3) r
  CROSS JOIN (VALUES (v_jakub),(v_jupik),(v_maxim),(v_alina),(v_alice),(v_bob),(v_matus_t)) AS u(id)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 4. Couples (4 couples: Alice&Bob, Carol&Dave, Papanica&Lukáš, Marek&Bruno)
  --    + Matúš (student) stays solo
  -- -------------------------------------------------------------------------
  INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id, availability) VALUES
    (v_club_id, 'Alice & Bob',           v_alice, v_bob,   v_avail_full),
    (v_club_id, 'Carol & Dave',          v_carol, v_dave,  v_avail_full),
    (v_club_id, 'Papanica TV & Lukáš',   v_papanica, v_lukas, v_avail_full),
    (v_club_id, 'Marek & Bruno',          v_marek, v_bruno, v_avail_full);
  SELECT id INTO v_couple_ab FROM public.couples WHERE club_id = v_club_id AND name = 'Alice & Bob' LIMIT 1;
  SELECT id INTO v_couple_cd FROM public.couples WHERE club_id = v_club_id AND name = 'Carol & Dave' LIMIT 1;
  SELECT id INTO v_couple_pl FROM public.couples WHERE club_id = v_club_id AND name = 'Papanica TV & Lukáš' LIMIT 1;
  SELECT id INTO v_couple_mb FROM public.couples WHERE club_id = v_club_id AND name = 'Marek & Bruno' LIMIT 1;

  -- -------------------------------------------------------------------------
  -- 5. Groups + group_members + group_lesson_types (3 groups)
  -- -------------------------------------------------------------------------
  INSERT INTO public.groups (club_id, name, availability) VALUES
    (v_club_id, 'Beginners', v_avail_full),
    (v_club_id, 'Advanced Latina', v_avail_full),
    (v_club_id, 'Competition', v_avail_weekdays);
  SELECT id INTO v_group_beg FROM public.groups WHERE club_id = v_club_id AND name = 'Beginners' LIMIT 1;
  SELECT id INTO v_group_lat FROM public.groups WHERE club_id = v_club_id AND name = 'Advanced Latina' LIMIT 1;
  SELECT id INTO v_group_comp FROM public.groups WHERE club_id = v_club_id AND name = 'Competition' LIMIT 1;

  INSERT INTO public.group_members (group_id, user_id, couple_id) VALUES
    (v_group_beg, NULL, v_couple_ab),
    (v_group_beg, NULL, v_couple_cd),
    (v_group_beg, v_matus_s, NULL),
    (v_group_lat, NULL, v_couple_pl),
    (v_group_lat, NULL, v_couple_mb),
    (v_group_comp, NULL, v_couple_ab),
    (v_group_comp, NULL, v_couple_cd),
    (v_group_comp, NULL, v_couple_pl);

  INSERT INTO public.group_lesson_types (club_id, group_id, name, duration_minutes) VALUES
    (v_club_id, v_group_beg, 'Standard', 60),
    (v_club_id, v_group_lat, 'Latina', 90),
    (v_club_id, v_group_comp, 'Standard Advanced', 60);
  SELECT id INTO v_type_std FROM public.group_lesson_types WHERE club_id = v_club_id AND name = 'Standard' LIMIT 1;
  SELECT id INTO v_type_lat FROM public.group_lesson_types WHERE club_id = v_club_id AND name = 'Latina' LIMIT 1;
  SELECT id INTO v_type_adv FROM public.group_lesson_types WHERE club_id = v_club_id AND name = 'Standard Advanced' LIMIT 1;

  -- -------------------------------------------------------------------------
  -- 6. Timetable: Weekly
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Weekly program', 'weekly', '2026-02-01', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt, v_jakub, 8), (v_tt, v_jupik, 8), (v_tt, v_maxim, 8), (v_tt, v_alina, 8), (v_tt, v_alice, 8), (v_tt, v_bob, 8), (v_tt, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_matus_s, NULL, 2, 'high', v_jupik),
    (v_tt, v_carol, NULL, 2, 'medium', v_alina),
    (v_tt, v_dave, NULL, 2, 'medium', v_jakub),
    (v_tt, NULL, v_couple_ab, 2, 'high', NULL),
    (v_tt, NULL, v_couple_cd, 2, 'high', v_jupik),
    (v_tt, NULL, v_couple_pl, 2, 'medium', v_matus_t),
    (v_tt, NULL, v_couple_mb, 1, 'low', v_maxim);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_group_beg, v_type_std, 1, 'medium', v_alina),
    (v_tt, v_group_lat, v_type_lat, 1, 'high', v_matus_t);

  -- -------------------------------------------------------------------------
  -- 7. Timetable: Bi-weekly
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Bi-weekly program', 'bi_weekly', '2026-02-01', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt, v_jakub, 6), (v_tt, v_jupik, 6), (v_tt, v_maxim, 6), (v_tt, v_alina, 6), (v_tt, v_alice, 6), (v_tt, v_bob, 6), (v_tt, v_matus_t, 6);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_matus_s, NULL, 1, 'medium', NULL),
    (v_tt, NULL, v_couple_pl, 2, 'high', v_matus_t),
    (v_tt, NULL, v_couple_mb, 2, 'medium', v_jupik),
    (v_tt, NULL, v_couple_ab, 1, 'high', v_alina);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_group_lat, v_type_lat, 1, 'high', v_alina);

  -- -------------------------------------------------------------------------
  -- 8. Timetable: Monthly
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Monthly program', 'monthly', '2026-02-01', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'second_half', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt, v_jakub, 8), (v_tt, v_jupik, 8), (v_tt, v_maxim, 8), (v_tt, v_alina, 8), (v_tt, v_alice, 8), (v_tt, v_bob, 8), (v_tt, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_alice, NULL, 2, 'high', v_alina),
    (v_tt, v_bob, NULL, 2, 'medium', v_jupik),
    (v_tt, NULL, v_couple_cd, 2, 'high', NULL),
    (v_tt, NULL, v_couple_pl, 1, 'medium', v_jakub);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_group_beg, v_type_std, 1, 'medium', v_jupik),
    (v_tt, v_group_comp, v_type_adv, 1, 'high', v_matus_t);

  -- -------------------------------------------------------------------------
  -- 9. Timetable: Weekends only
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Weekend program', 'weekends_only', '2026-02-01', '09:00', '18:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'same', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt, v_jakub, 6), (v_tt, v_jupik, 6), (v_tt, v_maxim, 6), (v_tt, v_alina, 6), (v_tt, v_alice, 6), (v_tt, v_bob, 6), (v_tt, v_matus_t, 6);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, NULL, v_couple_ab, 1, 'high', v_jupik),
    (v_tt, NULL, v_couple_cd, 1, 'high', v_alina),
    (v_tt, NULL, v_couple_pl, 1, 'medium', v_matus_t),
    (v_tt, NULL, v_couple_mb, 1, 'low', NULL);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_group_beg, v_type_std, 1, 'medium', NULL);

  -- -------------------------------------------------------------------------
  -- 10. Timetable: Fixed period
  -- -------------------------------------------------------------------------
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, valid_until, day_start, day_end)
  VALUES (v_club_id, 'Spring 2026 fixed', 'fixed_period', '2026-02-01', '2026-06-30', '15:00', '20:00')
  RETURNING id INTO v_tt;
  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 120, 15, 'first_half', 0);
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt, v_jakub, 8), (v_tt, v_jupik, 8), (v_tt, v_maxim, 8), (v_tt, v_alina, 8), (v_tt, v_alice, 8), (v_tt, v_bob, 8), (v_tt, v_matus_t, 8);
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_carol, NULL, 2, 'high', v_alina),
    (v_tt, v_dave, NULL, 2, 'medium', v_jupik),
    (v_tt, v_papanica, NULL, 1, 'low', NULL),
    (v_tt, v_lukas, NULL, 1, 'low', NULL),
    (v_tt, v_matus_s, NULL, 2, 'high', v_jakub),
    (v_tt, NULL, v_couple_ab, 2, 'high', v_jupik),
    (v_tt, NULL, v_couple_cd, 2, 'high', v_alina),
    (v_tt, NULL, v_couple_pl, 1, 'medium', v_matus_t),
    (v_tt, NULL, v_couple_mb, 2, 'medium', v_maxim);
  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, v_group_beg, v_type_std, 1, 'medium', v_alina),
    (v_tt, v_group_lat, v_type_lat, 1, 'medium', v_matus_t),
    (v_tt, v_group_comp, v_type_adv, 1, 'high', v_jupik);

  -- -------------------------------------------------------------------------
  -- 11. Sample lessons (so timetables show some scheduled lessons)
  -- -------------------------------------------------------------------------
  IF v_room1 IS NOT NULL AND v_room2 IS NOT NULL THEN
    FOR v_tt IN SELECT id FROM public.timetables WHERE club_id = v_club_id LIMIT 3 LOOP
      INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static) VALUES
        (v_tt, 'individual', date_trunc('week', current_date) + interval '1 day' + time '15:00', date_trunc('week', current_date) + interval '1 day' + time '15:45', v_room1, v_jupik, v_matus_s, NULL, false),
        (v_tt, 'couple',     date_trunc('week', current_date) + interval '1 day' + time '16:00', date_trunc('week', current_date) + interval '1 day' + time '16:45', v_room1, v_alina, NULL, v_couple_ab, false),
        (v_tt, 'couple',     date_trunc('week', current_date) + interval '2 day' + time '15:00', date_trunc('week', current_date) + interval '2 day' + time '15:45', v_room2, v_matus_t, NULL, v_couple_cd, false),
        (v_tt, 'individual', date_trunc('week', current_date) + interval '3 day' + time '17:00', date_trunc('week', current_date) + interval '3 day' + time '17:45', v_room1, v_jakub, v_carol, NULL, false);
    END LOOP;
  END IF;

  RAISE NOTICE 'Seed complete: Dansovia – 3 rooms, 4 couples, 3 groups, 5 timetables (all recurrence types), varied availability, sample lessons.';
END $$;
