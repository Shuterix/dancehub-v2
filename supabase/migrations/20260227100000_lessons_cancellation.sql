-- Allow cancelling a lesson with a note (student or teacher).
alter table public.lessons
	add column if not exists cancelled_at timestamptz,
	add column if not exists cancelled_by uuid references auth.users (id) on delete set null,
	add column if not exists cancellation_note text;

comment on column public.lessons.cancelled_at is 'When set, the lesson is cancelled.';
comment on column public.lessons.cancelled_by is 'User who cancelled (student or trainer).';
comment on column public.lessons.cancellation_note is 'Reason for cancellation.';

create index if not exists idx_lessons_cancelled_at on public.lessons (cancelled_at) where cancelled_at is null;
