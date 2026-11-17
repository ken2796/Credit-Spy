-- Credit Spy: each member's credit items (run once in the Supabase SQL Editor, after spies.sql).
-- A credit item belongs to one member of the spy (credit_items.user_id).
-- Any member may add or edit an item for any other member of the same spy,
-- but never for someone outside it.

create or replace function public.is_member_of(p_spy uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spy_members m where m.spy_id = p_spy and m.user_id = p_user
  );
$$;

drop policy if exists "Spy members add" on public.credit_items;
drop policy if exists "Spy members edit" on public.credit_items;

create policy "Spy members add" on public.credit_items for insert to authenticated
  with check (public.is_spy_member(spy_id) and public.is_member_of(spy_id, user_id));

create policy "Spy members edit" on public.credit_items for update to authenticated
  using (public.is_spy_member(spy_id))
  with check (public.is_spy_member(spy_id) and public.is_member_of(spy_id, user_id));
