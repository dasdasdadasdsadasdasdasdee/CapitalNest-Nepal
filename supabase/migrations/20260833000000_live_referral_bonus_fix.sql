-- Live referral bonus fix for production Supabase
-- This script ensures the referral code, matching bonus logic, and 50-point welcome bonus are stored in the real database.
-- Run this in Supabase SQL Editor against the live project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  phone text,
  country_code text,
  invitation_code text,
  referred_by uuid references public.profiles(id),
  referral_bonus numeric(12,2) not null default 0,
  invited_count integer not null default 0,
  full_name text,
  address text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_invitation_code_unique
  on public.profiles (lower(invitation_code))
  where invitation_code is not null;

create table if not exists public.user_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_name text not null,
  amount numeric(12,2) not null default 0,
  duration_days integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  amount numeric(12,2) not null default 0,
  payment_method text,
  status text not null default 'pending',
  note text,
  referral_history_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_history (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  bonus_amount numeric(12,2) not null default 0,
  bonus_transaction_id uuid,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  unique (invited_user_id)
);

alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);
alter table public.profiles add column if not exists referral_bonus numeric(12,2) not null default 0;
alter table public.profiles add column if not exists invited_count integer not null default 0;
alter table public.transactions add column if not exists referral_history_id uuid references public.referral_history(id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists user_investments_updated_at on public.user_investments;
create trigger user_investments_updated_at
before update on public.user_investments
for each row
execute function public.set_updated_at();

create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    v_code := upper('CN' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.profiles where lower(invitation_code) = lower(v_code)
    );
  end loop;

  return v_code;
end;
$$;

create or replace function public.validate_invitation_code(p_invitation_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_invitation_code is null or trim(p_invitation_code) = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where lower(invitation_code) = lower(trim(p_invitation_code))
  );
end;
$$;

grant execute on function public.validate_invitation_code(text) to anon, authenticated;

drop function if exists public.process_referral(uuid, text);
create or replace function public.process_referral(p_user_id uuid, p_invitation_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inviter_id uuid;
  v_bonus_amount numeric(12,2) := 50;
  v_history_id uuid;
  v_inviter_bonus_tx_id uuid;
  v_invitee_bonus_tx_id uuid;
begin
  if p_user_id is null or p_invitation_code is null or trim(p_invitation_code) = '' then
    return;
  end if;

  if exists (
    select 1 from public.referral_history where invited_user_id = p_user_id
  ) then
    return;
  end if;

  if exists (
    select 1 from public.profiles where id = p_user_id and referred_by is not null
  ) then
    return;
  end if;

  select id
    into v_inviter_id
  from public.profiles
  where lower(invitation_code) = lower(trim(p_invitation_code))
  limit 1;

  if v_inviter_id is null or v_inviter_id = p_user_id then
    return;
  end if;

  update public.profiles
  set referred_by = v_inviter_id,
      updated_at = now()
  where id = p_user_id and referred_by is null;

  insert into public.referral_history (
    inviter_id,
    invited_user_id,
    referral_code,
    bonus_amount,
    status
  )
  values (
    v_inviter_id,
    p_user_id,
    trim(p_invitation_code),
    v_bonus_amount,
    'completed'
  )
  on conflict (invited_user_id) do nothing
  returning id into v_history_id;

  if v_history_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.transactions
    where user_id = v_inviter_id
      and referral_history_id = v_history_id
      and type = 'welcome_bonus'
  ) then
    insert into public.transactions (
      user_id,
      type,
      amount,
      payment_method,
      status,
      note,
      referral_history_id
    )
    values (
      v_inviter_id,
      'welcome_bonus',
      v_bonus_amount,
      'referral',
      'completed',
      'Welcome bonus for successful referral',
      v_history_id
    )
    returning id into v_inviter_bonus_tx_id;
  end if;

  if not exists (
    select 1
    from public.transactions
    where user_id = p_user_id
      and referral_history_id = v_history_id
      and type = 'welcome_bonus'
  ) then
    insert into public.transactions (
      user_id,
      type,
      amount,
      payment_method,
      status,
      note,
      referral_history_id
    )
    values (
      p_user_id,
      'welcome_bonus',
      v_bonus_amount,
      'referral',
      'completed',
      'Welcome bonus for joining through referral link',
      v_history_id
    )
    returning id into v_invitee_bonus_tx_id;
  end if;

  update public.referral_history
  set bonus_amount = v_bonus_amount,
      bonus_transaction_id = coalesce(bonus_transaction_id, v_inviter_bonus_tx_id)
  where id = v_history_id;

  update public.profiles
  set invited_count = (
      select count(*)
      from public.referral_history
      where inviter_id = v_inviter_id and status = 'completed'
    ),
      referral_bonus = (
      select coalesce(sum(bonus_amount), 0)
      from public.referral_history
      where inviter_id = v_inviter_id and status = 'completed'
    ),
      updated_at = now()
  where id = v_inviter_id;

  update public.profiles
  set referral_bonus = (
      select coalesce(sum(amount), 0)
      from public.transactions
      where user_id = p_user_id and type = 'welcome_bonus'
    ),
      updated_at = now()
  where id = p_user_id;
end;
$$;

grant execute on function public.process_referral(uuid, text) to anon, authenticated;

drop function if exists public.handle_new_user();
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referral_code text;
  v_user_invitation_code text;
begin
  v_referral_code := nullif(trim(new.raw_user_meta_data->>'invitation_code'), '');
  v_user_invitation_code := public.generate_referral_code();

  insert into public.profiles (
    id,
    email,
    phone,
    country_code,
    invitation_code,
    referred_by,
    full_name,
    address
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'country_code',
    v_user_invitation_code,
    null,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'address'
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = excluded.phone,
    country_code = excluded.country_code,
    invitation_code = coalesce(excluded.invitation_code, public.profiles.invitation_code, public.generate_referral_code()),
    full_name = excluded.full_name,
    address = excluded.address,
    updated_at = now();

  perform public.process_referral(new.id, v_referral_code);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_investments enable row level security;
alter table public.transactions enable row level security;
alter table public.referral_history enable row level security;

create policy if not exists "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy if not exists "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy if not exists "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy if not exists "Users can view own investments"
  on public.user_investments for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert own investments"
  on public.user_investments for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can update own investments"
  on public.user_investments for update
  using (auth.uid() = user_id);

create policy if not exists "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can view own referral history"
  on public.referral_history for select
  using (auth.uid() = inviter_id or auth.uid() = invited_user_id);

-- Quick verification queries
-- select * from public.referral_history;
-- select * from public.transactions where type = 'welcome_bonus';
-- select * from public.profiles where invitation_code is not null;
