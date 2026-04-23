-- =============================================================================
-- One timetable guaranteed to show shortfall: orange "Targets not fully met" +
-- amber "Fewer lessons than requested" on the detail page, as long as this
-- timetable has NO lessons in the count window (weekly = that ISO week).
--
-- Prereq: your DB has the Dansovia club + couples/trainers from
--   supabase/seed_showcase_timetables.sql
--   (same UUIDs below). If your club/couple ids differ, replace the DECLARE block.
--
-- How to use:
--   1) Run this script once.
--   2) In the app, open: Club → Timetables → "SQL demo — unmet target (2 desired, 0 actual)"
--   3) Set the week picker to any Monday whose week has zero lessons in DB for
--      this timetable (after a fresh insert, *every* week is empty = shortfall).
--   4) You should see green (no conflicts, if you have no overlapping mess),
--      then orange strip, then amber card. "Jump to details" scrolls to the card.
--
-- Re-run: safe (deletes and recreates the same id).
-- =============================================================================

DO $$
DECLARE
  v_club_id  uuid := '0afc9cb2-2e32-4327-8052-3b7787371acb';
  v_couple   uuid := '8a75e008-a2d7-4a44-81fd-33cca06a3ffa';  -- Alice & Bob
  v_jakub    uuid := '07a0f840-c115-45f2-b7b6-c878daa45096';
  v_maxim    uuid := '679802c1-dfa0-4dba-832f-2f7c0fa70b7f';
  v_monday   date := (date_trunc('week', (current_date AT TIME ZONE 'UTC')::date))::date;
  v_tt       uuid := 'a0000ff0-0000-0000-0000-00000000ff01';
BEGIN
  DELETE FROM public.lessons                 WHERE timetable_id = v_tt;
  DELETE FROM public.timetable_group_targets WHERE timetable_id = v_tt;
  DELETE FROM public.timetable_targets       WHERE timetable_id = v_tt;
  DELETE FROM public.timetable_trainer_limits WHERE timetable_id = v_tt;
  DELETE FROM public.timetable_preferences   WHERE timetable_id = v_tt;
  DELETE FROM public.timetables              WHERE id = v_tt;

  INSERT INTO public.timetables (id, club_id, name, recurrence, valid_from, valid_until, is_active, day_start, day_end)
  VALUES (
    v_tt,
    v_club_id,
    'SQL demo — unmet target (2 desired, 0 actual)',
    'weekly',
    v_monday,
    NULL,
    true,
    '08:00',
    '22:00'
  );

  INSERT INTO public.timetable_preferences (timetable_id, individual_lesson_duration_minutes, distribution, max_consecutive_minutes_per_trainer, min_break_minutes_after_consecutive, buffer_between_lessons_minutes)
  VALUES (v_tt, 45, 'same', 120, 15, 0);

  INSERT INTO public.timetable_trainer_limits (timetable_id, user_id, max_lessons_per_day) VALUES
    (v_tt, v_jakub, 6),
    (v_tt, v_maxim, 6);

  -- Only one target: 2 lessons desired, none inserted → shortfall of 2 in every empty week
  INSERT INTO public.timetable_targets (timetable_id, student_id, couple_id, desired_lessons_count, priority, preferred_trainer_id) VALUES
    (v_tt, NULL, v_couple, 2, 'high', v_jakub);

  RAISE NOTICE 'Timetable % created. Open in app: timetables/%', v_tt, v_tt;
END $$;
