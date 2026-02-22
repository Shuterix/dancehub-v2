-- =============================================================================
-- Seed: Timetable demo (trainers, rooms, timetables, targets, availability)
-- =============================================================================
-- RUN AFTER: seed_test_students_and_couples.sql
-- Uses the SAME club_id and same 4 users (Alice, Bob, Carol, Dave).
-- This seed turns Alice and Bob into TRAINERS and keeps Carol and Dave as
-- students, then adds rooms, 2 timetables with targets and trainer limits.
--
-- 1. Create one club in the app and note its id.
-- 2. Create 4 users in Supabase Auth (Alice, Bob, Carol, Dave).
-- 3. Run seed_test_students_and_couples.sql (set club_id and 4 user ids there).
-- 4. Run this file in SQL Editor (same club_id and user ids as in step 3).
-- =============================================================================

-- ---------- CONFIG: use your club_id from seed_test_students_and_couples ----------
DO $$
DECLARE
  v_club_id uuid := '0afc9cb2-2e32-4327-8052-3b7787371acb';
  v_alice   uuid := '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c';
  v_bob     uuid := 'af2730ff-3c00-4849-bec7-cc2223760e7b';
  v_carol   uuid := 'af2c716a-a329-4e6e-8b0d-df80a3471129';
  v_dave    uuid := 'a4704f91-55b8-4e15-8d05-5eaf9a913a84';
  v_room1   uuid;
  v_room2   uuid;
  v_tt1     uuid;
  v_tt2     uuid;
  v_couple_ab uuid;
  v_couple_cd uuid;
BEGIN
  -- Get couple ids (from seed_test_students_and_couples)
  SELECT id INTO v_couple_ab FROM public.couples WHERE club_id = v_club_id AND name = 'Alice & Bob' LIMIT 1;
  SELECT id INTO v_couple_cd FROM public.couples WHERE club_id = v_club_id AND name = 'Carol & Dave' LIMIT 1;

  -- Make Alice and Bob trainers (so we have 2 trainers, 2 students)
  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES
    (v_club_id, v_alice, 'trainer'),
    (v_club_id, v_bob, 'trainer')
  ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Ensure Carol and Dave stay students
  INSERT INTO public.club_members (club_id, user_id, role)
  VALUES
    (v_club_id, v_carol, 'student'),
    (v_club_id, v_dave, 'student')
  ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Update couple availability (intersection of partners) so solver can use it
  -- Alice: Mon 09-12, Wed 14-18; Bob: Mon 10-13, Wed 14-17 → Mon 10-12, Wed 14-17
  IF v_couple_ab IS NOT NULL THEN
    UPDATE public.couples SET availability = '[
      {"day": "monday", "start": "10:00", "end": "12:00"},
      {"day": "wednesday", "start": "14:00", "end": "17:00"}
    ]'::jsonb WHERE id = v_couple_ab;
  END IF;
  -- Carol: Tue 16-20, Thu 16-20; Dave: Tue 15-19, Thu 17-21 → Tue 16-19, Thu 17-20
  IF v_couple_cd IS NOT NULL THEN
    UPDATE public.couples SET availability = '[
      {"day": "tuesday", "start": "16:00", "end": "19:00"},
      {"day": "thursday", "start": "17:00", "end": "20:00"}
    ]'::jsonb WHERE id = v_couple_cd;
  END IF;

  -- Rooms (ignore if already exist for this club)
  INSERT INTO public.rooms (club_id, name)
  SELECT v_club_id, 'Main studio' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Main studio');
  INSERT INTO public.rooms (club_id, name)
  SELECT v_club_id, 'Small room' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Small room');
  SELECT id INTO v_room1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Main studio' LIMIT 1;
  SELECT id INTO v_room2 FROM public.rooms WHERE club_id = v_club_id AND name = 'Small room' LIMIT 1;

  -- Room teachers (trainers can use both rooms)
  IF v_room1 IS NOT NULL AND v_room2 IS NOT NULL THEN
    INSERT INTO public.room_teachers (room_id, user_id)
    VALUES (v_room1, v_alice), (v_room1, v_bob), (v_room2, v_alice), (v_room2, v_bob)
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END IF;

  -- Timetable 1: "Spring 2026" – Mon 09:00–18:00, 45 min lessons
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Spring 2026', 'weekly', '2026-02-01', '09:00', '18:00')
  RETURNING id INTO v_tt1;

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt1, 45, 120, 15, 'same', 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt1, v_alice, 6), (v_tt1, v_bob, 6);

  -- Targets: Carol (2), Dave (2), couple Carol&Dave (2). Preferred trainers mixed.
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt1, v_carol, NULL, 2, 'high', v_alice),
    (v_tt1, v_dave, NULL, 2, 'medium', v_bob),
    (v_tt1, NULL, v_couple_cd, 2, 'high', NULL);

  -- Timetable 2: "Evening week" – 15:00–20:00
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Evening week', 'weekly', '2026-02-01', '15:00', '20:00')
  RETURNING id INTO v_tt2;

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt2, 45, 120, 15, 'same', 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt2, v_alice, 8), (v_tt2, v_bob, 8);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt2, v_carol, NULL, 1, 'medium', v_alice),
    (v_tt2, v_dave, NULL, 1, 'medium', v_bob),
    (v_tt2, NULL, v_couple_cd, 2, 'high', v_bob);

  RAISE NOTICE 'Timetable demo seed done. Club: %, Timetable 1: %, Timetable 2: %', v_club_id, v_tt1, v_tt2;
END $$;
