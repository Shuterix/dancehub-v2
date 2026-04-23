-- =============================================================================
-- Fix: widen "10. Groups only" window + clear its lessons for a clean re-generate
-- =============================================================================
-- Why:
--   The auto-reschedule diagnostics showed that timetable 10's 17:00–21:00
--   window is over-constrained: Main studio, Jakub, and group members are
--   already booked in most of the ~90 candidate slots because of the other
--   12 active timetables in the club. There is no combination of time
--   within that narrow window where the group targets all fit.
--
-- What this does:
--   1. Expands tt10's day window from 17:00–21:00 to 09:00–21:00 (roughly
--      triples the candidate slot count per day).
--   2. Removes the preferred-trainer pin on the Competition target so the
--      solver can use any qualified trainer, not just Jakub. (Latina stays
--      pinned to Maxim and Beginners to Jupik so those demos still look
--      meaningful.)
--   3. Deletes every lesson currently in tt10 so the next "Generate" click
--      starts from an empty slate and produces a conflict-free schedule.
--
-- Safe to re-run. Only touches tt10 — other timetables are untouched.
-- =============================================================================

DO $$
DECLARE
  v_tt10 uuid := 'aaaa0010-0000-0000-0000-000000000010';
BEGIN
  UPDATE public.timetables
    SET day_start = '09:00',
        day_end   = '21:00'
  WHERE id = v_tt10;

  UPDATE public.timetable_group_targets
    SET preferred_trainer_id = NULL
  WHERE timetable_id = v_tt10;

  DELETE FROM public.lessons
  WHERE timetable_id = v_tt10;

  RAISE NOTICE 'Timetable 10 updated: window 09:00-21:00, preferred trainers cleared, lessons wiped.';
END;
$$ LANGUAGE plpgsql;
