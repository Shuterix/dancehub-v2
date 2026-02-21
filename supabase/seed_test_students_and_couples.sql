-- =============================================================================
-- Seed: test students and couples
-- =============================================================================
-- BEFORE RUNNING:
-- 1. Create one club (e.g. via app: Onboarding > Create club) and note its id.
-- 2. Create 4 test users in Supabase: Auth > Users > Add user (or Register in app).
--    Each must exist in auth.users. Get IDs:  SELECT id, email FROM auth.users;
-- 3. Replace the UUIDs below with your club_id and the 4 user ids (see script).
--
-- IMPORTANT: Run in Supabase Dashboard > SQL Editor. It uses the service role
-- so profiles can be inserted for any user. If you run elsewhere and get
-- "permission denied" or 0 rows, RLS is blocking (you can only insert your own profile).
-- =============================================================================

-- ---------- Profiles: create or update (inserts if no profile exists yet) ----------
-- Each id must exist in auth.users. Run as a user with permission to insert into profiles
-- (e.g. service role, or disable RLS for this script).
INSERT INTO public.profiles (
  id,
  full_name,
  phone,
  dance_partner,
  category,
  rank_standard,
  rank_latin,
  date_of_birth,
  availability,
  onboarding_completed,
  role,
  club_id
)
VALUES
  (
    '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c'::uuid,
    'Alice Smith',
    '+1 555 111 0001',
    'Bob Jones',
    'B',
    'B',
    'A',
    '2002-03-15',
    '[{"day": "monday", "start": "09:00", "end": "12:00"}, {"day": "wednesday", "start": "14:00", "end": "18:00"}]'::jsonb,
    true,
    'student',
    '0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid
  ),
  (
    'af2730ff-3c00-4849-bec7-cc2223760e7b'::uuid,
    'Bob Jones',
    '+1 555 111 0002',
    'Alice Smith',
    'B',
    'A',
    'B',
    '2001-07-22',
    '[{"day": "monday", "start": "10:00", "end": "13:00"}, {"day": "wednesday", "start": "14:00", "end": "17:00"}]'::jsonb,
    true,
    'student',
    '0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid
  ),
  (
    'af2c716a-a329-4e6e-8b0d-df80a3471129'::uuid,
    'Carol White',
    '+1 555 111 0003',
    'Dave Brown',
    'C',
    'C',
    'C',
    '2003-11-08',
    '[{"day": "tuesday", "start": "16:00", "end": "20:00"}, {"day": "thursday", "start": "16:00", "end": "20:00"}]'::jsonb,
    true,
    'student',
    '0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid
  ),
  (
    'a4704f91-55b8-4e15-8d05-5eaf9a913a84'::uuid,
    'Dave Brown',
    '+1 555 111 0004',
    'Carol White',
    'C',
    'D',
    'C',
    '2000-01-30',
    '[{"day": "tuesday", "start": "15:00", "end": "19:00"}, {"day": "thursday", "start": "17:00", "end": "21:00"}]'::jsonb,
    true,
    'student',
    '0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid
  )
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  phone = EXCLUDED.phone,
  dance_partner = EXCLUDED.dance_partner,
  category = EXCLUDED.category,
  rank_standard = EXCLUDED.rank_standard,
  rank_latin = EXCLUDED.rank_latin,
  date_of_birth = EXCLUDED.date_of_birth,
  availability = EXCLUDED.availability,
  onboarding_completed = EXCLUDED.onboarding_completed,
  role = EXCLUDED.role,
  club_id = EXCLUDED.club_id,
  updated_at = now();

-- ---------- Club members: add all 4 as students in the club ----------
INSERT INTO public.club_members (club_id, user_id, role)
VALUES
  ('0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid, '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c'::uuid, 'student'),
  ('0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid, 'af2730ff-3c00-4849-bec7-cc2223760e7b'::uuid, 'student'),
  ('0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid, 'af2c716a-a329-4e6e-8b0d-df80a3471129'::uuid, 'student'),
  ('0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid, 'a4704f91-55b8-4e15-8d05-5eaf9a913a84'::uuid, 'student')
ON CONFLICT (club_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- ---------- Couples: Alice & Bob, Carol & Dave ----------
INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id)
VALUES
  ('0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid, 'Alice & Bob', '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c'::uuid, 'af2730ff-3c00-4849-bec7-cc2223760e7b'::uuid),
  ('0afc9cb2-2e32-4327-8052-3b7787371acb'::uuid, 'Carol & Dave', 'af2c716a-a329-4e6e-8b0d-df80a3471129'::uuid, 'a4704f91-55b8-4e15-8d05-5eaf9a913a84'::uuid);
