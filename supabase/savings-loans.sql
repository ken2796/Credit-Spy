-- Credit Spy: borrowing from your own savings (run once, after savings.sql).
-- A "borrow" takes money out of a goal as a loan you owe back; "repay"
-- entries point at the borrow they pay back.

alter table public.savings_entries
  add column if not exists kind text not null default 'deposit' check (kind in ('deposit', 'withdraw', 'borrow', 'repay')),
  add column if not exists note text check (char_length(note) between 1 and 120),
  add column if not exists due_on date,
  add column if not exists loan_id uuid references public.savings_entries (id) on delete cascade;

update public.savings_entries set kind = 'withdraw' where amount < 0 and kind = 'deposit';

alter table public.savings_entries
  add constraint savings_entries_sign check (
    (kind in ('deposit', 'repay') and amount > 0) or (kind in ('withdraw', 'borrow') and amount < 0)
  ),
  add constraint savings_entries_repay_loan check ((kind = 'repay') = (loan_id is not null));

create index if not exists savings_entries_loan_idx on public.savings_entries (loan_id);

-- A pay-back must point at a borrow from the same goal.
drop policy if exists "Spy members add" on public.savings_entries;
create policy "Spy members add" on public.savings_entries for insert to authenticated
  with check (
    public.is_spy_member(spy_id)
    and exists (select 1 from public.savings_goals g where g.id = goal_id and g.spy_id = savings_entries.spy_id)
    and (
      loan_id is null
      or exists (
        select 1 from public.savings_entries l
        where l.id = savings_entries.loan_id and l.goal_id = savings_entries.goal_id and l.kind = 'borrow'
      )
    )
  );
