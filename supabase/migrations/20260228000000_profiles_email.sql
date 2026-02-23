-- Optional email on profiles (synced from auth on profile update) for club contact display.
alter table public.profiles
	add column if not exists email text;

comment on column public.profiles.email is 'User email, synced from auth when they update profile. Used for club contact.';
