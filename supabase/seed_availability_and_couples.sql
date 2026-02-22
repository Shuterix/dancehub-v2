-- =============================================================================
-- Set availability for club members and pair into couples
-- Club: 0afc9cb2-2e32-4327-8052-3b7787371acb
-- Run in Supabase SQL Editor.
-- Wide window 08:00–21:00 Mon–Fri so "Big week" and "Evening week" can place lessons.
-- =============================================================================

-- Wide availability 08:00–21:00 (Mon–Fri) so all timetables have slots
UPDATE public.profiles
SET availability = '[
  {"day": "monday", "start": "08:00", "end": "21:00"},
  {"day": "tuesday", "start": "08:00", "end": "21:00"},
  {"day": "wednesday", "start": "08:00", "end": "21:00"},
  {"day": "thursday", "start": "08:00", "end": "21:00"},
  {"day": "friday", "start": "08:00", "end": "21:00"}
]'::jsonb,
updated_at = now()
WHERE club_id = '0afc9cb2-2e32-4327-8052-3b7787371acb'
  AND id IN (
    '25b67f34-cbdd-40ea-ba8d-0181cdef7c6e',  -- Marek Topolsky
    '2800b8c5-cac7-4df2-ab75-d61c2e0968e8',  -- Jupik 100 (trainer)
    '579f1722-16a5-419f-a90d-92a6340f998b',  -- Test acc
    '5bca37d2-356f-4902-acc8-b5b9854afc2e',  -- Matúš Lupták (student)
    '6bf38b0d-9b88-4cd8-90a3-2c10e3f47a88',  -- Alina (trainer)
    '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c',  -- Alice Smith
    '9365b4b1-8132-436b-9725-cfb7f7ba5a49',  -- Papanica TV
    'a4704f91-55b8-4e15-8d05-5eaf9a913a84',  -- Dave Brown
    'af2730ff-3c00-4849-bec7-cc2223760e7b',  -- Bob Jones
    'af2c716a-a329-4e6e-8b0d-df80a3471129',  -- Carol White
    'e54cd6d9-494c-40ea-965c-3de284c8975a',  -- Lukáš Eliaš
    'fc642e02-dc97-4c75-80b3-dedd79ce8360'   -- Matúš Lupták (Matúš) (trainer)
  );

-- Couples: same wide window 08:00–21:00 (Mon–Fri)
UPDATE public.couples
SET availability = '[
  {"day": "monday", "start": "08:00", "end": "21:00"},
  {"day": "tuesday", "start": "08:00", "end": "21:00"},
  {"day": "wednesday", "start": "08:00", "end": "21:00"},
  {"day": "thursday", "start": "08:00", "end": "21:00"},
  {"day": "friday", "start": "08:00", "end": "21:00"}
]'::jsonb
WHERE club_id = '0afc9cb2-2e32-4327-8052-3b7787371acb'
  AND (
    (partner1_user_id = '71d7f0be-1b31-4dc4-a5a5-ba0091b00c0c' AND partner2_user_id = 'af2730ff-3c00-4849-bec7-cc2223760e7b')
    OR (partner1_user_id = 'af2c716a-a329-4e6e-8b0d-df80a3471129' AND partner2_user_id = 'a4704f91-55b8-4e15-8d05-5eaf9a913a84')
  );

-- New couples: Marek Topolsky & Test acc, Papanica TV & Lukáš Eliaš (insert only if not exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.couples WHERE club_id = '0afc9cb2-2e32-4327-8052-3b7787371acb' AND name = 'Marek & Test acc') THEN
    INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id, availability)
    VALUES (
      '0afc9cb2-2e32-4327-8052-3b7787371acb',
      'Marek & Test acc',
      '25b67f34-cbdd-40ea-ba8d-0181cdef7c6e',
      '579f1722-16a5-419f-a90d-92a6340f998b',
      '[{"day": "monday", "start": "08:00", "end": "21:00"}, {"day": "tuesday", "start": "08:00", "end": "21:00"}, {"day": "wednesday", "start": "08:00", "end": "21:00"}, {"day": "thursday", "start": "08:00", "end": "21:00"}, {"day": "friday", "start": "08:00", "end": "21:00"}]'::jsonb
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.couples WHERE club_id = '0afc9cb2-2e32-4327-8052-3b7787371acb' AND name = 'Papanica TV & Lukáš') THEN
    INSERT INTO public.couples (club_id, name, partner1_user_id, partner2_user_id, availability)
    VALUES (
      '0afc9cb2-2e32-4327-8052-3b7787371acb',
      'Papanica TV & Lukáš',
      '9365b4b1-8132-436b-9725-cfb7f7ba5a49',
      'e54cd6d9-494c-40ea-965c-3de284c8975a',
      '[{"day": "monday", "start": "08:00", "end": "21:00"}, {"day": "tuesday", "start": "08:00", "end": "21:00"}, {"day": "wednesday", "start": "08:00", "end": "21:00"}, {"day": "thursday", "start": "08:00", "end": "21:00"}, {"day": "friday", "start": "08:00", "end": "21:00"}]'::jsonb
    );
  END IF;
END $$;
