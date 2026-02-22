-- =============================================================================
-- Seed: One big timetable – long hours, many rooms, many targets, many lessons
-- =============================================================================
-- Run after: seed_availability_and_couples.sql (so everyone has availability).
-- Uses club 0afc9cb2-2e32-4327-8052-3b7787371acb and existing users/couples.
-- Creates: 4 rooms, 1 timetable "Big week" (08:00–21:00), 3 trainers (12 lessons/day each),
--          all students and all couples as targets (4–5 lessons each) = lots of lessons.
-- =============================================================================

DO $$
DECLARE
  v_club_id   uuid := '0afc9cb2-2e32-4327-8052-3b7787371acb';
  -- Trainers
  v_jupik     uuid := '2800b8c5-cac7-4df2-ab75-d61c2e0968e8';
  v_alina     uuid := '6bf38b0d-9b88-4cd8-90a3-2c10e3f47a88';
  v_matus_t   uuid := 'fc642e02-dc97-4c75-80b3-dedd79ce8360';
  -- Students
  v_marek     uuid := '25b67f34-cbdd-40ea-ba8d-0181cdef7c6e';
  v_test_acc  uuid := '579f1722-16a5-419f-a90d-92a6340f998b';
  v_matus_s   uuid := '5bca37d2-356f-4902-acc8-b5b9854afc2e';
  v_alice     uuid := '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c';
  v_papanica  uuid := '9365b4b1-8132-436b-9725-cfb7f7ba5a49';
  v_dave      uuid := 'a4704f91-55b8-4e15-8d05-5eaf9a913a84';
  v_bob       uuid := 'af2730ff-3c00-4849-bec7-cc2223760e7b';
  v_carol     uuid := 'af2c716a-a329-4e6e-8b0d-df80a3471129';
  v_lukas     uuid := 'e54cd6d9-494c-40ea-965c-3de284c8975a';
  -- Couple ids (looked up)
  v_couple_ab uuid;
  v_couple_cd uuid;
  v_couple_mt uuid;
  v_couple_pl uuid;
  v_room1     uuid;
  v_room2     uuid;
  v_room3     uuid;
  v_room4     uuid;
  v_tt        uuid;
BEGIN
  SELECT id INTO v_couple_ab FROM public.couples WHERE club_id = v_club_id AND (name = 'Alice & Bob' OR (partner1_user_id = v_alice AND partner2_user_id = v_bob)) LIMIT 1;
  SELECT id INTO v_couple_cd FROM public.couples WHERE club_id = v_club_id AND (name = 'Carol & Dave' OR (partner1_user_id = v_carol AND partner2_user_id = v_dave)) LIMIT 1;
  SELECT id INTO v_couple_mt FROM public.couples WHERE club_id = v_club_id AND name = 'Marek & Test acc' LIMIT 1;
  SELECT id INTO v_couple_pl FROM public.couples WHERE club_id = v_club_id AND name = 'Papanica TV & Lukáš' LIMIT 1;

  -- More rooms
  INSERT INTO public.rooms (club_id, name) SELECT v_club_id, 'Studio A' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio A');
  INSERT INTO public.rooms (club_id, name) SELECT v_club_id, 'Studio B' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio B');
  INSERT INTO public.rooms (club_id, name) SELECT v_club_id, 'Studio C' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio C');
  INSERT INTO public.rooms (club_id, name) SELECT v_club_id, 'Studio D' WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio D');
  SELECT id INTO v_room1 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio A' LIMIT 1;
  SELECT id INTO v_room2 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio B' LIMIT 1;
  SELECT id INTO v_room3 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio C' LIMIT 1;
  SELECT id INTO v_room4 FROM public.rooms WHERE club_id = v_club_id AND name = 'Studio D' LIMIT 1;

  IF v_room1 IS NOT NULL AND v_room2 IS NOT NULL AND v_room3 IS NOT NULL AND v_room4 IS NOT NULL THEN
    INSERT INTO public.room_teachers (room_id, user_id)
    VALUES
      (v_room1, v_jupik), (v_room1, v_alina), (v_room1, v_matus_t),
      (v_room2, v_jupik), (v_room2, v_alina), (v_room2, v_matus_t),
      (v_room3, v_jupik), (v_room3, v_alina), (v_room3, v_matus_t),
      (v_room4, v_jupik), (v_room4, v_alina), (v_room4, v_matus_t)
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END IF;

  -- One big timetable: 08:00–21:00, 45 min lessons → many slots per day
  INSERT INTO public.timetables (club_id, name, recurrence, valid_from, day_start, day_end)
  VALUES (v_club_id, 'Big week', 'weekly', '2026-02-01', '08:00', '21:00')
  RETURNING id INTO v_tt;

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, distribution, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 180, 15, 'same', 0);

  -- 3 trainers, 12 lessons/day each → up to 36 lesson-slots per day
  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day)
  VALUES (v_tt, v_jupik, 12), (v_tt, v_alina, 12), (v_tt, v_matus_t, 12);

  -- Targets: every student (4–5 lessons), every couple (4 lessons), mixed priority and preferred trainer
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
  VALUES
    (v_tt, v_marek, NULL, 5, 'high', v_jupik),
    (v_tt, v_test_acc, NULL, 4, 'high', v_alina),
    (v_tt, v_matus_s, NULL, 5, 'medium', v_matus_t),
    (v_tt, v_alice, NULL, 4, 'high', v_jupik),
    (v_tt, v_papanica, NULL, 4, 'medium', v_alina),
    (v_tt, v_dave, NULL, 5, 'high', v_matus_t),
    (v_tt, v_bob, NULL, 4, 'medium', NULL),
    (v_tt, v_carol, NULL, 5, 'high', v_alina),
    (v_tt, v_lukas, NULL, 4, 'medium', v_jupik);
  -- Couples
  IF v_couple_ab IS NOT NULL THEN
    INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
    VALUES (v_tt, NULL, v_couple_ab, 4, 'high', v_jupik);
  END IF;
  IF v_couple_cd IS NOT NULL THEN
    INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
    VALUES (v_tt, NULL, v_couple_cd, 4, 'high', v_alina);
  END IF;
  IF v_couple_mt IS NOT NULL THEN
    INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
    VALUES (v_tt, NULL, v_couple_mt, 4, 'medium', v_matus_t);
  END IF;
  IF v_couple_pl IS NOT NULL THEN
    INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id)
    VALUES (v_tt, NULL, v_couple_pl, 4, 'medium', NULL);
  END IF;

  RAISE NOTICE 'Big timetable created. Timetable id: %', v_tt;
END $$;
