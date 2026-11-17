-- Credit Spy: savings goals (run once in the Supabase SQL Editor, after spies.sql).
-- Each goal belongs to a spy; deposits and withdrawals are kept as entries,
-- so the saved amount is their sum.

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  spy_id uuid not null references public.spies (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  target numeric(14, 2) not null check (target > 0),
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_entries (
  id uuid primary key default gen_random_uuid(),
  spy_id uuid not null references public.spies (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  amount numeric(14, 2) not null check (amount <> 0),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists savings_goals_spy_idx on public.savings_goals (spy_id);
create index if not exists savings_entries_goal_idx on public.savings_entries (goal_id, occurred_on desc);
create index if not exists savings_entries_spy_idx on public.savings_entries (spy_id);

alter table public.savings_goals enable row level security;
alter table public.savings_entries enable row level security;

create policy "Spy members read" on public.savings_goals for select to authenticated using (public.is_spy_member(spy_id));
create policy "Spy members add" on public.savings_goals for insert to authenticated with check (public.is_spy_member(spy_id));
create policy "Spy members edit" on public.savings_goals for update to authenticated using (public.is_spy_member(spy_id)) with check (public.is_spy_member(spy_id));
create policy "Spy members delete" on public.savings_goals for delete to authenticated using (public.is_spy_member(spy_id));

-- An entry must point at a goal in the same spy.
create policy "Spy members read" on public.savings_entries for select to authenticated using (public.is_spy_member(spy_id));
create policy "Spy members add" on public.savings_entries for insert to authenticated
  with check (
    public.is_spy_member(spy_id)
    and exists (select 1 from public.savings_goals g where g.id = goal_id and g.spy_id = savings_entries.spy_id)
  );
create policy "Spy members delete" on public.savings_entries for delete to authenticated using (public.is_spy_member(spy_id));

grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, delete on public.savings_entries to authenticated;
