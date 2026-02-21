# Supabase

## Running migrations

Run migrations in order (oldest first).

**Option A – Supabase Dashboard**  
1. Open your project → **SQL Editor**.  
2. Copy the contents of each migration file in order (e.g. `20260220000000_create_profiles_table.sql`, `20260220120000_add_profiles_availability.sql`, `20260220200000_add_rank_standard_and_rank_latin.sql`, `20260220300000_onboarding_clubs.sql`).  
3. Run each once.

**Option B – Supabase CLI**  
From the project root: `supabase db push` (or `supabase migration up`), if you use the CLI.

## Adding columns to `profiles`

You can add new columns anytime. In **SQL Editor** run for example:

```sql
ALTER TABLE public.profiles ADD COLUMN your_column text;
-- or
ALTER TABLE public.profiles ADD COLUMN birth_date date;
```

Then use the new field in your app (e.g. in the profile form and any API that reads/writes profiles).
