-- Date of birth for profiles (used to display age on club page).

alter table public.profiles
	add column if not exists date_of_birth date;
