# Database seeds (demo data)

Use these in **Supabase Dashboard → SQL Editor** (or `psql` with your DB URL). Run in order.

## 1. Prerequisites

- **One club**  
  Create it in the app (Onboarding → Create club) or insert in SQL. Note the `id`.
- **Four auth users**  
  In Supabase: **Auth → Users → Add user** (or sign up in the app).  
  Use emails like `alice@test.local`, `bob@test.local`, etc. Note each user `id` (UUID).

## 2. Seed students and couples

**File:** `seed_test_students_and_couples.sql`

- Replace `0afc9cb2-2e32-4327-8052-3b7787371acb` with your **club id** (in the INSERT for `profiles` and `club_members`/`couples`).
- Replace the four profile/club_member UUIDs with your **4 user ids** (Alice, Bob, Carol, Dave).
- Run the script.

This creates: 4 profiles (with availability), 4 club members (students), 2 couples (Alice & Bob, Carol & Dave).

## 3. Seed timetable demo

**File:** `seed_timetable_demo.sql`

- In the `DO $$ ... END $$` block at the top, set `v_club_id` and `v_alice`, `v_bob`, `v_carol`, `v_dave` to the **same** club id and 4 user ids as in step 2.
- Run the script.

This will:

- Set **Alice and Bob** as **trainers** (Carol and Dave stay students).
- Set **couple availability** (intersection of partners) for both couples.
- Create **2 rooms**: "Main studio", "Small room" (and link trainers to them).
- Create **2 timetables**:
  - **Spring 2026** – window 09:00–18:00, targets: Carol (2), Dave (2), Carol & Dave (2), trainer limits 6/day.
  - **Evening week** – window 15:00–20:00, targets: Carol (1), Dave (1), Carol & Dave (2), trainer limits 8/day.

After that you can open the app, go to **Timetables**, open either timetable, and use **Generate** to create lessons for a week. Availability is set so lessons fall in the right windows (e.g. Carol/Dave on Tue/Thu evening, couple Carol&Dave same).

## 4. (Optional) Big timetable – more slots, more lessons

**File:** `seed_big_timetable.sql`

Run after `seed_availability_and_couples.sql`. Creates:

- **4 rooms:** Studio A, B, C, D (with all 3 trainers assigned).
- **1 timetable "Big week":** 08:00–21:00, 45 min lessons, 3 trainers (Jupik, Alina, Matúš) with 12 lessons/day each.
- **Many targets:** all 9 students (4–5 lessons each) and all 4 couples (4 lessons each) → ~50+ lessons per week when you hit Generate.

Use **Timetables → Big week → Generate** to fill the grid.

## More students / trainers / timetables

- Add more users in Auth, then add matching rows in `profiles` and `club_members` (and optionally `couples`), and set `availability` in `profiles` (and `couples` if needed).
- You can run the timetable seed again with the same config; it will create **extra** timetables with the same names (or change the names in the script to avoid duplicates).
