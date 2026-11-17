-- Credit Spy: shared spies (run once in the Supabase SQL Editor, after schema.sql).
-- A spy is a shared money space. Its owner can invite people with a link;
-- everyone who joins can add and edit the spy's income, credit items and
-- money in & out.

create table if not exists public.spies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.spy_members (
  spy_id uuid not null references public.spies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (spy_id, user_id)
);

create index if not exists spy_members_user_idx on public.spy_members (user_id);

create table if not exists public.spy_invites (
  id uuid primary key default gen_random_uuid(),
  spy_id uuid not null references public.spies (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);

create index if not exists spy_invites_spy_idx on public.spy_invites (spy_id);

-- Membership checks used by the row level security policies below.

create or replace function public.is_spy_member(p_spy uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spy_members m where m.spy_id = p_spy and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_spy_owner(p_spy uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.spy_members m
    where m.spy_id = p_spy and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Money data now belongs to a spy instead of a single person.

alter table public.credit_items add column if not exists spy_id uuid references public.spies (id) on delete cascade;
alter table public.income_sources add column if not exists spy_id uuid references public.spies (id) on delete cascade;
alter table public.transactions add column if not exists spy_id uuid references public.spies (id) on delete cascade;

create index if not exists credit_items_spy_idx on public.credit_items (spy_id);
create index if not exists income_sources_spy_idx on public.income_sources (spy_id);
create index if not exists transactions_spy_idx on public.transactions (spy_id, occurred_on desc);

drop policy if exists "Users read own items" on public.credit_items;
drop policy if exists "Users add own items" on public.credit_items;
drop policy if exists "Users update own items" on public.credit_items;
drop policy if exists "Users delete own items" on public.credit_items;
drop policy if exists "Users read own income" on public.income_sources;
drop policy if exists "Users add own income" on public.income_sources;
drop policy if exists "Users update own income" on public.income_sources;
drop policy if exists "Users delete own income" on public.income_sources;
drop policy if exists "Users read own transactions" on public.transactions;
drop policy if exists "Users add own transactions" on public.transactions;
drop policy if exists "Users update own transactions" on public.transactions;
drop policy if exists "Users delete own transactions" on public.transactions;

create policy "Spy members read" on public.credit_items for select to authenticated using (public.is_spy_member(spy_id));
create policy "Spy members add" on public.credit_items for insert to authenticated with check (public.is_spy_member(spy_id));
create policy "Spy members edit" on public.credit_items for update to authenticated using (public.is_spy_member(spy_id)) with check (public.is_spy_member(spy_id));
create policy "Spy members delete" on public.credit_items for delete to authenticated using (public.is_spy_member(spy_id));

create policy "Spy members read" on public.income_sources for select to authenticated using (public.is_spy_member(spy_id));
create policy "Spy members add" on public.income_sources for insert to authenticated with check (public.is_spy_member(spy_id));
create policy "Spy members edit" on public.income_sources for update to authenticated using (public.is_spy_member(spy_id)) with check (public.is_spy_member(spy_id));
create policy "Spy members delete" on public.income_sources for delete to authenticated using (public.is_spy_member(spy_id));

create policy "Spy members read" on public.transactions for select to authenticated using (public.is_spy_member(spy_id));
create policy "Spy members add" on public.transactions for insert to authenticated with check (public.is_spy_member(spy_id));
create policy "Spy members edit" on public.transactions for update to authenticated using (public.is_spy_member(spy_id)) with check (public.is_spy_member(spy_id));
create policy "Spy members delete" on public.transactions for delete to authenticated using (public.is_spy_member(spy_id));

-- Spies, members and invites are read through these policies and changed
-- only through the functions below.

alter table public.spies enable row level security;
alter table public.spy_members enable row level security;
alter table public.spy_invites enable row level security;

drop policy if exists "Spy members read spy" on public.spies;
drop policy if exists "Spy members read members" on public.spy_members;
drop policy if exists "Spy owner reads invites" on public.spy_invites;
drop policy if exists "Spy owner deletes invites" on public.spy_invites;

create policy "Spy members read spy" on public.spies for select to authenticated using (public.is_spy_member(id));
create policy "Spy members read members" on public.spy_members for select to authenticated using (public.is_spy_member(spy_id));
create policy "Spy owner reads invites" on public.spy_invites for select to authenticated using (public.is_spy_owner(spy_id));
create policy "Spy owner deletes invites" on public.spy_invites for delete to authenticated using (public.is_spy_owner(spy_id));

grant select on public.spies to authenticated;
grant select on public.spy_members to authenticated;
grant select, delete on public.spy_invites to authenticated;

-- Gives a signed-in person their own spy the first time, moving any money
-- data they saved before spies existed into it. Returns their main spy.
create or replace function public.ensure_my_spy()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_spy uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select m.spy_id into v_spy
  from public.spy_members m
  where m.user_id = auth.uid()
  order by (m.role = 'owner') desc, m.joined_at
  limit 1;

  if v_spy is not null then
    return v_spy;
  end if;

  select coalesce(nullif(split_part(u.raw_user_meta_data ->> 'full_name', ' ', 1), ''), split_part(u.email, '@', 1))
  into v_name
  from auth.users u
  where u.id = auth.uid();

  insert into public.spies (owner_id, name)
  values (auth.uid(), left(coalesce(v_name, 'My') || '''s Spy', 80))
  returning id into v_spy;

  insert into public.spy_members (spy_id, user_id, role) values (v_spy, auth.uid(), 'owner');

  update public.credit_items set spy_id = v_spy where user_id = auth.uid() and spy_id is null;
  update public.income_sources set spy_id = v_spy where user_id = auth.uid() and spy_id is null;
  update public.transactions set spy_id = v_spy where user_id = auth.uid() and spy_id is null;

  return v_spy;
end;
$$;

-- Every spy the signed-in person belongs to.
create or replace function public.my_spies()
returns table (id uuid, name text, role text, member_count integer)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, m.role,
    (select count(*)::integer from public.spy_members x where x.spy_id = s.id)
  from public.spy_members m
  join public.spies s on s.id = m.spy_id
  where m.user_id = auth.uid()
  order by (m.role = 'owner') desc, m.joined_at;
$$;

-- Owner only: makes a one-time invite code that lasts 7 days.
create or replace function public.create_spy_invite(p_spy uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_spy_owner(p_spy) then
    raise exception 'Only the owner can invite people to this spy';
  end if;

  insert into public.spy_invites (spy_id, code, created_by)
  values (p_spy, replace(gen_random_uuid()::text, '-', ''), auth.uid())
  returning code into v_code;

  return v_code;
end;
$$;

-- What an invite is for, so the person can decide before accepting.
create or replace function public.get_spy_invite(p_code text)
returns table (spy_name text, invited_by text, status text)
language sql stable security definer set search_path = ''
as $$
  select s.name,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
    case
      when i.accepted_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      when exists (select 1 from public.spy_members m where m.spy_id = i.spy_id and m.user_id = auth.uid()) then 'member'
      else 'open'
    end
  from public.spy_invites i
  join public.spies s on s.id = i.spy_id
  left join auth.users u on u.id = i.created_by
  where i.code = p_code and auth.uid() is not null;
$$;

create or replace function public.accept_spy_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_invite public.spy_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  select * into v_invite from public.spy_invites where code = p_code for update;

  if not found then
    raise exception 'This invite link is not valid';
  end if;

  if exists (select 1 from public.spy_members m where m.spy_id = v_invite.spy_id and m.user_id = auth.uid()) then
    return v_invite.spy_id;
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'This invite link was already used. Ask for a new one.';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'This invite link has expired. Ask for a new one.';
  end if;

  insert into public.spy_members (spy_id, user_id, role) values (v_invite.spy_id, auth.uid(), 'member');
  update public.spy_invites set accepted_by = auth.uid(), accepted_at = now() where id = v_invite.id;

  return v_invite.spy_id;
end;
$$;

-- People in a spy, for its members.
create or replace function public.list_spy_members(p_spy uuid)
returns table (user_id uuid, name text, email text, role text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
    u.email,
    m.role
  from public.spy_members m
  join auth.users u on u.id = m.user_id
  where m.spy_id = p_spy and public.is_spy_member(p_spy)
  order by (m.role = 'owner') desc, m.joined_at;
$$;

-- The owner removes someone, or a member leaves. The owner cannot leave.
create or replace function public.remove_spy_member(p_spy uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user = auth.uid() then
    if public.is_spy_owner(p_spy) then
      raise exception 'The owner cannot leave their own spy';
    end if;
  elsif not public.is_spy_owner(p_spy) then
    raise exception 'Only the owner can remove people from this spy';
  end if;

  delete from public.spy_members where spy_id = p_spy and user_id = p_user and role <> 'owner';
end;
$$;

revoke execute on function public.is_spy_member(uuid) from public, anon;
revoke execute on function public.is_spy_owner(uuid) from public, anon;
revoke execute on function public.ensure_my_spy() from public, anon;
revoke execute on function public.my_spies() from public, anon;
revoke execute on function public.create_spy_invite(uuid) from public, anon;
revoke execute on function public.get_spy_invite(text) from public, anon;
revoke execute on function public.accept_spy_invite(text) from public, anon;
revoke execute on function public.list_spy_members(uuid) from public, anon;
revoke execute on function public.remove_spy_member(uuid, uuid) from public, anon;

grant execute on function public.is_spy_member(uuid) to authenticated;
grant execute on function public.is_spy_owner(uuid) to authenticated;
grant execute on function public.ensure_my_spy() to authenticated;
grant execute on function public.my_spies() to authenticated;
grant execute on function public.create_spy_invite(uuid) to authenticated;
grant execute on function public.get_spy_invite(text) to authenticated;
grant execute on function public.accept_spy_invite(text) to authenticated;
grant execute on function public.list_spy_members(uuid) to authenticated;
grant execute on function public.remove_spy_member(uuid, uuid) to authenticated;
