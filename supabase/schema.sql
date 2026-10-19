-- Being WISE — Questions schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 3 and 500),
  name        text check (name is null or char_length(name) <= 60),
  created_at  timestamptz not null default now()
);

create table if not exists public.votes (
  question_id uuid not null references public.questions(id) on delete cascade,
  voter_id    uuid not null,
  created_at  timestamptz not null default now(),
  primary key (question_id, voter_id)  -- one vote per browser per question
);

alter table public.questions enable row level security;
alter table public.votes     enable row level security;

-- Anyone can read and add; nobody can edit or delete from the website.
create policy "Anyone can read questions" on public.questions for select to anon, authenticated using (true);
create policy "Anyone can ask"            on public.questions for insert to anon, authenticated with check (true);
create policy "Anyone can read votes"     on public.votes     for select to anon, authenticated using (true);
create policy "Anyone can vote"           on public.votes     for insert to anon, authenticated with check (true);

grant select, insert on public.questions, public.votes to anon, authenticated;
