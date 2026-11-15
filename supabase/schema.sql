-- Credit Spy: run once in the Supabase SQL Editor.

create table if not exists public.credit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  total numeric(14, 2) not null check (total > 0),
  term_months integer not null check (term_months >= 1),
  months_paid integer not null default 0 check (months_paid >= 0 and months_paid <= term_months),
  created_at timestamptz not null default now()
);

create index if not exists credit_items_user_id_idx on public.credit_items (user_id);

alter table public.credit_items enable row level security;

-- Each signed-in user can only see and change their own items.
create policy "Users read own items" on public.credit_items
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users add own items" on public.credit_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update own items" on public.credit_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users delete own items" on public.credit_items
  for delete to authenticated using ((select auth.uid()) = user_id);
