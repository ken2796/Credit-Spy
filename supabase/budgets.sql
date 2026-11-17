-- Credit Spy: monthly budgets (run once in the Supabase SQL Editor, after spies.sql).
-- A budget is a spending category with a monthly limit. Money-out entries can
-- be tagged with a category, and spending is counted against its limit.

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  spy_id uuid not null references public.spies (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  monthly_limit numeric(14, 2) not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  unique (spy_id, name)
);

create index if not exists budgets_spy_idx on public.budgets (spy_id);

alter table public.transactions add column if not exists category text check (char_length(category) between 1 and 60);

alter table public.budgets enable row level security;

create policy "Spy members read" on public.budgets for select to authenticated using (public.is_spy_member(spy_id));
create policy "Spy members add" on public.budgets for insert to authenticated with check (public.is_spy_member(spy_id));
create policy "Spy members edit" on public.budgets for update to authenticated using (public.is_spy_member(spy_id)) with check (public.is_spy_member(spy_id));
create policy "Spy members delete" on public.budgets for delete to authenticated using (public.is_spy_member(spy_id));

grant select, insert, update, delete on public.budgets to authenticated;
