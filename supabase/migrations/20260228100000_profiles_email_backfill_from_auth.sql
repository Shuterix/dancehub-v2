-- Backfill profiles.email from auth.users (login emails) for all existing users.
-- Keeps profiles in sync with auth so club contact and display use the same email.

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is distinct from u.email or p.email is null)
  and u.email is not null;

-- Optional: keep profiles.email in sync when auth.users email changes (e.g. user updates in dashboard).
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = coalesce(new.email, email)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email_from_auth();
