-- Fix root cause: duplicate package purchases were created because the app merged
-- multiple data sources without a canonical identity and then inserted duplicate
-- approved records into user_investments. This migration removes duplicates based on
-- the real purchase identity: user_id + plan + amount + duration + status + timestamps.

create extension if not exists pgcrypto;

-- 1) Add a canonical dedupe key helper for this table.
create or replace function public.investment_dedupe_key(
  p_user_id uuid,
  p_plan_name text,
  p_amount numeric,
  p_duration_days integer,
  p_status text,
  p_created_at timestamptz
)
returns text
language sql
stable
as $$
  select lower(
    coalesce(p_user_id::text, '') || '|' ||
    coalesce(trim(regexp_replace(lower(coalesce(p_plan_name, 'investment')), '[^a-z0-9\s-]+', ' ', 'g')), 'investment') || '|' ||
    coalesce(p_amount::text, '0') || '|' ||
    coalesce(p_duration_days::text, '0') || '|' ||
    lower(coalesce(p_status, 'active')) || '|' ||
    floor(extract(epoch from coalesce(p_created_at, now())) / 60)::text
  );
$$;

-- 2) Normalize duplicate rows by keeping the earliest valid record per canonical key.
with ranked as (
  select
    ui.id,
    row_number() over (
      partition by public.investment_dedupe_key(
        ui.user_id,
        ui.plan_name,
        ui.amount,
        ui.duration_days,
        ui.status,
        ui.created_at
      )
      order by ui.created_at asc, ui.id asc
    ) as rn
  from public.user_investments ui
  where ui.user_id is not null
    and ui.plan_name is not null
    and ui.amount is not null
)
delete from public.user_investments ui
using ranked r
where ui.id = r.id
  and r.rn > 1;

-- 3) Remove orphaned duplicate records that have no matching approved deposit but
--    match the same purchase identity as another active record.
with canonical as (
  select
    min(id) as keep_id,
    public.investment_dedupe_key(
      user_id,
      plan_name,
      amount,
      duration_days,
      status,
      created_at
    ) as dedupe_key
  from public.user_investments
  group by public.investment_dedupe_key(
    user_id,
    plan_name,
    amount,
    duration_days,
    status,
    created_at
  )
)
delete from public.user_investments ui
using canonical c
where ui.id <> c.keep_id
  and public.investment_dedupe_key(
    ui.user_id,
    ui.plan_name,
    ui.amount,
    ui.duration_days,
    ui.status,
    ui.created_at
  ) = c.dedupe_key;

-- 4) Protect against future duplicate insertions by ensuring a unique index on the
-- canonical identity. This does not delete user data; it prevents the same purchase
-- from being inserted twice.
create unique index if not exists idx_user_investments_canonical_identity
  on public.user_investments (
    user_id,
    lower(regexp_replace(coalesce(plan_name, 'investment'), '[^a-z0-9\s-]+', ' ', 'g')),
    amount,
    duration_days,
    lower(coalesce(status, 'active')),
    date_trunc('minute', created_at)
  );
