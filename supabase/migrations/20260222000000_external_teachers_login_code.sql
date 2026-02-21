-- External teachers: login by generated code only.
-- login_code: unique code shown to the trainer when they create an external teacher; the external teacher uses it to sign in.
-- external_login_email: internal auth.users email we generate so we can sign them in with code as password.

alter table public.profiles
	add column if not exists login_code text unique,
	add column if not exists external_login_email text;

comment on column public.profiles.login_code is 'For external teachers only: unique code used to sign in (no email/password).';
comment on column public.profiles.external_login_email is 'For external teachers only: internal auth email so we can sign in with code as password.';
