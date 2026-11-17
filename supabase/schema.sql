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

-- Income sources: each signed-in user keeps their own list.
create table if not exists public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  frequency text not null check (frequency in ('monthly', 'semi-monthly', 'biweekly', 'weekly', 'yearly')),
  created_at timestamptz not null default now()
);

create index if not exists income_sources_user_id_idx on public.income_sources (user_id);

alter table public.income_sources enable row level security;

create policy "Users read own income" on public.income_sources
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users add own income" on public.income_sources
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update own income" on public.income_sources
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users delete own income" on public.income_sources
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.income_sources to authenticated;

-- Money in and money out: a simple log of what came in and what was spent.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  description text not null check (char_length(description) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, occurred_on desc);

alter table public.transactions enable row level security;

create policy "Users read own transactions" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Users add own transactions" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Users update own transactions" on public.transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Users delete own transactions" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.transactions to authenticated;
