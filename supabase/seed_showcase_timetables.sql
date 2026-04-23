-- =============================================================================
-- Showcase seed: Dansovia — one timetable per feature / edge case
-- Club id: 0afc9cb2-2e32-4327-8052-3b7787371acb
--
-- This script is IDEMPOTENT. It deletes all existing timetables for this club
-- (and their cascaded preferences / targets / trainer_limits / lessons) and
-- recreates 13 timetables covering:
--   1.  Weekly — Spread ("same" distribution, full week)
--   2.  Weekly — First half (Mon–Wed hard filter)
--   3.  Weekly — Second half (Thu–Sun hard filter)
--   4.  Weekends only (recurrence = weekends_only)
--   5.  Bi-weekly
--   6.  Monthly masterclass
--   7.  Fixed period — Pre-competition (28-day run)
--   8.  Strict rules: buffer + max-consecutive + break
--   9.  Shortfall showcase (Carol can't match Thu–Sun distribution)
--  10.  Groups only (no individual/couple targets)
--  11.  Paused / archived (is_active = false)
--  12.  Conflict demo A — Alice Mon 17:00 static lesson
--  13.  Conflict demo B — Alice Mon 17:00 static lesson (overlaps timetable 12)
--
-- Two static lessons are inserted for timetables 12 and 13 so the "conflicts
-- detected" banner on the timetable detail page lights up immediately without
-- needing to click Generate. All other timetables come configured but empty —
-- click Generate in the UI to populate their week.
--
-- Run this in the Supabase SQL Editor after migrations. Safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_club_id uuid := '0afc9cb2-2e32-4327-8052-3b7787371acb';

  -- Students ----------------------------------------------------------------
  v_marek     uuid := '25b67f34-cbdd-40ea-ba8d-0181cdef7c6e';  -- Marek Topolsky
  v_matus_s   uuid := '5bca37d2-356f-4902-acc8-b5b9854afc2e';  -- Matúš Lupták (student)
  v_papanica  uuid := '9365b4b1-8132-436b-9725-cfb7f7ba5a49';  -- Papanica TV
  v_bruno     uuid := 'a0ab19d2-7978-4ae0-b5be-90aba61fb29a';  -- Bruno Mravec
  v_dave      uuid := 'a4704f91-55b8-4e15-8d05-5eaf9a913a84';  -- Dave Brown
  v_carol     uuid := 'af2c716a-a329-4e6e-8b0d-df80a3471129';  -- Carol White
  v_lukas     uuid := 'e54cd6d9-494c-40ea-965c-3de284c8975a';  -- Lukáš Eliaš

  -- Trainers ----------------------------------------------------------------
  v_jakub     uuid := '07a0f840-c115-45f2-b7b6-c878daa45096';
  v_jupik     uuid := '2800b8c5-cac7-4df2-ab75-d61c2e0968e8';
  v_maxim     uuid := '679802c1-dfa0-4dba-832f-2f7c0fa70b7f';
  v_alina     uuid := '6bf38b0d-9b88-4cd8-90a3-2c10e3f47a88';
  v_alice_t   uuid := '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c';  -- Alice (trainer role in club)
  v_liana     uuid := '80e76da5-3756-4f13-9377-8400e0bf5dee';  -- no availability set
  v_bob_t     uuid := 'af2730ff-3c00-4849-bec7-cc2223760e7b';  -- Bob (trainer role in club)
  v_matus_t   uuid := 'fc642e02-dc97-4c75-80b3-dedd79ce8360';

  -- Couples -----------------------------------------------------------------
  v_couple_ab uuid := '8a75e008-a2d7-4a44-81fd-33cca06a3ffa';  -- Alice & Bob
  v_couple_cd uuid := '416c3910-d94c-4a3b-9899-b7dd579c1d18';  -- Carol & Dave
  v_couple_pl uuid := '0132b728-18c9-4a3f-95e1-dcd6ffec593d';  -- Papanica & Lukáš
  v_couple_mb uuid := '9956eab5-417b-4058-ba1e-2d16265f8378';  -- Marek & Bruno

  -- Groups ------------------------------------------------------------------
  v_g_lat     uuid := 'a490c7c1-50d0-4533-bc82-dc7755bf3601';  -- Advanced Latina
  v_g_beg     uuid := '2f124254-92e6-4bdf-a3ba-cd4d209a397c';  -- Beginners
  v_g_comp    uuid := '67b9909d-954b-41e6-b8e4-d555e4b4a952';  -- Competition

  -- Group lesson types ------------------------------------------------------
  v_gt_lat    uuid := '1f6f199d-e558-46dc-a98e-f66698cfb37a';  -- Latina  (90 min)
  v_gt_std    uuid := '593cea04-1c82-4d16-aecb-65d02245ce0e';  -- Standard (60 min)
  v_gt_adv    uuid := 'bfe78702-819d-4c67-bd6a-75040a9b36fe';  -- Standard Advanced (60 min)

  -- Rooms -------------------------------------------------------------------
  v_room_small uuid := '2f73c7c7-c2d4-48bd-b33c-682b544445c5';
  v_room_b     uuid := 'd7b53166-3269-4b2d-8c09-fcf0a1be2d6d';
  v_room_main  uuid := 'ef261de8-c69c-4fcd-8aa7-5f2476ec6814';

  -- Dates -------------------------------------------------------------------
  v_monday    date := (date_trunc('week', current_date) + interval '0 day')::date;
  v_next_mon  date := (date_trunc('week', current_date) + interval '7 day')::date;

  -- Timetable ids (fixed so re-runs are stable + dev bookmarks keep working)
  v_tt1  uuid := 'aaaa0001-0000-0000-0000-000000000001';  -- Spread
  v_tt2  uuid := 'aaaa0002-0000-0000-0000-000000000002';  -- First half
  v_tt3  uuid := 'aaaa0003-0000-0000-0000-000000000003';  -- Second half
  v_tt4  uuid := 'aaaa0004-0000-0000-0000-000000000004';  -- Weekends
  v_tt5  uuid := 'aaaa0005-0000-0000-0000-000000000005';  -- Bi-weekly
  v_tt6  uuid := 'aaaa0006-0000-0000-0000-000000000006';  -- Monthly
  v_tt7  uuid := 'aaaa0007-0000-0000-0000-000000000007';  -- Fixed period
  v_tt8  uuid := 'aaaa0008-0000-0000-0000-000000000008';  -- Strict rules
  v_tt9  uuid := 'aaaa0009-0000-0000-0000-000000000009';  -- Shortfall
  v_tt10 uuid := 'aaaa0010-0000-0000-0000-000000000010';  -- Groups only
  v_tt11 uuid := 'aaaa0011-0000-0000-0000-000000000011';  -- Paused
  v_tt12 uuid := 'aaaa0012-0000-0000-0000-000000000012';  -- Conflict A
  v_tt13 uuid := 'aaaa0013-0000-0000-0000-000000000013';  -- Conflict B

BEGIN
  -- -------------------------------------------------------------------------
  -- 0. Clean previous timetables for this club (everything else is preserved)
  -- -------------------------------------------------------------------------
  DELETE FROM public.lessons                 WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  DELETE FROM public.timetable_group_targets WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  DELETE FROM public.timetable_targets       WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  DELETE FROM public.timetable_trainer_limits WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  DELETE FROM public.timetable_preferences   WHERE timetable_id IN (SELECT id FROM public.timetables WHERE club_id = v_club_id);
  DELETE FROM public.timetables              WHERE club_id = v_club_id;

  -- =========================================================================
  -- 1. Weekly — Spread (flagship)
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt1, v_club_id, '1. Weekly — Spread (main)', 'weekly', v_monday, NULL, true, '09:00', '21:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt1, 45, 'same', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt1, v_jakub, 6), (v_tt1, v_jupik, 6), (v_tt1, v_maxim, 6),
    (v_tt1, v_alina, 5), (v_tt1, v_matus_t, 6);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt1, NULL, v_couple_ab, 3, 'high',   v_jakub),
    (v_tt1, NULL, v_couple_cd, 2, 'medium', NULL),
    (v_tt1, NULL, v_couple_pl, 3, 'medium', v_maxim),
    (v_tt1, NULL, v_couple_mb, 2, 'low',    NULL),
    (v_tt1, v_matus_s, NULL, 2, 'medium', v_matus_t),
    (v_tt1, v_carol,  NULL, 1, 'low', NULL);

  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt1, v_g_beg,  v_gt_std, 2, 'medium', v_jupik),
    (v_tt1, v_g_lat,  v_gt_lat, 1, 'medium', NULL),
    (v_tt1, v_g_comp, v_gt_adv, 2, 'high',   v_jakub);

  -- =========================================================================
  -- 2. Weekly — First half (Mon–Wed)
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt2, v_club_id, '2. Weekly — First half (Mon–Wed)', 'weekly', v_monday, NULL, true, '15:00', '21:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt2, 45, 'first_half', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt2, v_jakub, 4), (v_tt2, v_maxim, 4), (v_tt2, v_matus_t, 4);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt2, NULL, v_couple_ab, 2, 'medium', NULL),
    (v_tt2, NULL, v_couple_pl, 2, 'high',   v_maxim),
    (v_tt2, v_lukas, NULL, 1, 'medium', v_jakub);

  -- =========================================================================
  -- 3. Weekly — Second half (Thu–Sun)
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt3, v_club_id, '3. Weekly — Second half (Thu–Sun)', 'weekly', v_monday, NULL, true, '09:00', '20:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt3, 60, 'second_half', 180, 20, 10);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt3, v_jupik, 5), (v_tt3, v_alina, 4), (v_tt3, v_matus_t, 5);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt3, NULL, v_couple_mb, 3, 'high',   NULL),   -- Bruno (weekends-only) drives Sat/Sun placements
    (v_tt3, NULL, v_couple_cd, 2, 'medium', NULL),
    (v_tt3, v_matus_s, NULL, 2, 'medium', v_jupik);

  -- =========================================================================
  -- 4. Weekends only
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt4, v_club_id, '4. Weekends only', 'weekends_only', v_monday, NULL, true, '09:00', '18:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt4, 60, 'same', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt4, v_jakub, 6), (v_tt4, v_maxim, 6), (v_tt4, v_matus_t, 6);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt4, NULL, v_couple_mb, 2, 'high', NULL),  -- Bruno is weekends-only — perfect fit
    (v_tt4, NULL, v_couple_ab, 2, 'medium', NULL),
    (v_tt4, v_bruno, NULL, 2, 'medium', NULL);

  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt4, v_g_lat, v_gt_lat, 1, 'medium', v_matus_t);

  -- =========================================================================
  -- 5. Bi-weekly
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt5, v_club_id, '5. Bi-weekly intensive', 'bi_weekly', v_monday, (v_monday + INTERVAL '84 day')::date, true, '10:00', '20:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt5, 60, 'same', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt5, v_jakub, 5), (v_tt5, v_maxim, 5);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt5, NULL, v_couple_pl, 2, 'high', v_jakub),
    (v_tt5, NULL, v_couple_ab, 2, 'medium', v_maxim);

  -- =========================================================================
  -- 6. Monthly masterclass
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt6, v_club_id, '6. Monthly masterclass', 'monthly', v_monday, (v_monday + INTERVAL '6 month')::date, true, '14:00', '18:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt6, 90, 'same', 180, 30, 15);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt6, v_jakub, 2), (v_tt6, v_matus_t, 2);

  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt6, v_g_comp, v_gt_adv, 1, 'high', v_jakub),
    (v_tt6, v_g_lat,  v_gt_lat, 1, 'high', v_matus_t);

  -- =========================================================================
  -- 7. Fixed period — Pre-competition (28 days)
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt7, v_club_id, '7. Fixed period — Pre-competition', 'fixed_period', v_next_mon, (v_next_mon + INTERVAL '27 day')::date, true, '16:00', '21:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt7, 45, 'same', 135, 15, 5);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt7, v_jakub, 5), (v_tt7, v_maxim, 5), (v_tt7, v_matus_t, 5), (v_tt7, v_jupik, 4);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt7, NULL, v_couple_ab, 4, 'high', v_jakub),
    (v_tt7, NULL, v_couple_pl, 3, 'high', v_maxim),
    (v_tt7, NULL, v_couple_cd, 2, 'medium', NULL);

  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt7, v_g_comp, v_gt_adv, 2, 'high', v_jakub);

  -- =========================================================================
  -- 8. Strict rules: buffer + max-consecutive + break
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt8, v_club_id, '8. Strict rules (buffer 15, streak 90, break 30)', 'weekly', v_monday, NULL, true, '15:00', '20:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt8, 45, 'same', 90, 30, 15);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt8, v_jakub, 6), (v_tt8, v_matus_t, 6);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt8, NULL, v_couple_ab, 3, 'high',   v_jakub),
    (v_tt8, NULL, v_couple_pl, 3, 'medium', v_matus_t),
    (v_tt8, v_matus_s, NULL, 2, 'medium', v_matus_t);

  -- =========================================================================
  -- 9. Shortfall showcase — Carol can only do Mon/Wed/Fri but distribution=Thu–Sun
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt9, v_club_id, '9. Shortfall showcase (Thu–Sun w/ Carol)', 'weekly', v_monday, NULL, true, '16:00', '21:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt9, 45, 'second_half', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt9, v_jakub, 4), (v_tt9, v_maxim, 4);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt9, v_carol, NULL, 3, 'high', NULL),                 -- will fall short
    (v_tt9, NULL, v_couple_ab, 2, 'medium', NULL),           -- will succeed
    (v_tt9, NULL, v_couple_mb, 2, 'medium', NULL);           -- ok thanks to Bruno weekends

  -- =========================================================================
  -- 10. Groups only
  -- =========================================================================
  -- Widened window (09–21) and relaxed trainer pins so groups fit alongside the
  -- other 12 active timetables. Competition intentionally has no preferred
  -- trainer so the solver can pick whoever is free.
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt10, v_club_id, '10. Groups only', 'weekly', v_monday, NULL, true, '09:00', '21:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt10, 60, 'same', 180, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt10, v_jakub, 4), (v_tt10, v_jupik, 4), (v_tt10, v_maxim, 4), (v_tt10, v_matus_t, 4);

  INSERT INTO public.timetable_group_targets (timetable_id, group_id, group_lesson_type_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt10, v_g_beg,  v_gt_std, 2, 'medium', v_jupik),
    (v_tt10, v_g_lat,  v_gt_lat, 2, 'high',   v_matus_t),
    (v_tt10, v_g_comp, v_gt_adv, 2, 'high',   NULL);

  -- =========================================================================
  -- 11. Paused / archived (is_active = false)
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end, paused_at)
  VALUES (v_tt11, v_club_id, '11. Paused — Old season (archived)', 'weekly', (v_monday - INTERVAL '60 day')::date, (v_monday - INTERVAL '7 day')::date, false, '15:00', '20:00', now());

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt11, 45, 'same', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt11, v_jakub, 4), (v_tt11, v_maxim, 4);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt11, NULL, v_couple_ab, 2, 'medium', v_jakub),
    (v_tt11, NULL, v_couple_cd, 2, 'medium', NULL);

  -- =========================================================================
  -- 12. Conflict demo A — pre-seeded static Alice lesson, Monday 17:00–17:45
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt12, v_club_id, '12. Conflict demo A (Alice Mon 17:00)', 'weekly', v_monday, NULL, true, '15:00', '20:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt12, 45, 'same', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt12, v_jakub, 4);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt12, NULL, v_couple_ab, 2, 'medium', v_jakub);

  INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static)
  VALUES (v_tt12, 'couple', (v_monday + time '17:00')::timestamptz, (v_monday + time '17:45')::timestamptz, v_room_main, v_jakub, NULL, v_couple_ab, true);

  -- =========================================================================
  -- 13. Conflict demo B — intentionally overlaps timetable 12 at the SAME slot
  -- =========================================================================
  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (v_tt13, v_club_id, '13. Conflict demo B (overlaps 12)', 'weekly', v_monday, NULL, true, '15:00', '20:00');

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt13, 45, 'same', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt13, v_maxim, 4);

  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt13, NULL, v_couple_ab, 2, 'medium', v_maxim);

  -- Same couple at the same time but via a different trainer and room → triggers:
  --   • "couple" conflict on the banner (Alice & Bob scheduled twice at 17:00)
  INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static)
  VALUES (v_tt13, 'couple', (v_monday + time '17:00')::timestamptz, (v_monday + time '17:45')::timestamptz, v_room_b, v_maxim, NULL, v_couple_ab, true);

  -- Also overlap at 18:00 with different participants to show multi-kind conflicts at once
  INSERT INTO public.lessons (timetable_id, lesson_type, start_at, end_at, room_id, trainer_id, student_id, couple_id, is_static) VALUES
    (v_tt12, 'individual', (v_monday + time '18:00')::timestamptz, (v_monday + time '18:45')::timestamptz, v_room_main, v_jakub, v_lukas,  NULL, true),
    (v_tt13, 'individual', (v_monday + time '18:00')::timestamptz, (v_monday + time '18:45')::timestamptz, v_room_main, v_jakub, v_matus_s, NULL, true);
  --   • trainer conflict (Jakub at 18:00)
  --   • room conflict (Main studio at 18:00)

  RAISE NOTICE 'Showcase seed completed: 13 timetables created for club %', v_club_id;
END;
$$ LANGUAGE plpgsql;
