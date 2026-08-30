-- Fix deduplication by linking old user_investments records to their deposits.
-- This migration updates user_investments records that don't have reference_id
-- by matching them to approved deposits using user_id, amount, plan_name, and created_at proximity.

-- First, update old records to set reference_id based on matching approved deposits
update public.user_investments ui
set reference_id = d.id::text
from public.deposits d
where ui.user_id = d.user_id
  and ui.reference_id is null
  and ui.amount = d.amount
  and lower(coalesce(nullif(split_part(d.reference_id, '-', 1), ''), 'Investment')) = lower(ui.plan_name)
  and d.status = 'APPROVED'
  and ui.created_at between d.approved_at - interval '5 minutes' and d.approved_at + interval '5 minutes';

-- Delete duplicate user_investments records where the same deposit has been linked multiple times
-- Keep only the first (oldest) record for each user + reference_id combination
delete from public.user_investments
where id in (
  select id from (
    select id, row_number() over (partition by user_id, reference_id order by created_at asc) as rn
    from public.user_investments
    where reference_id is not null
  ) t
  where rn > 1
);

-- Also delete any user_investments records that don't have a matching approved deposit
-- and were created more than 1 minute after being linked to a deposit
-- (these are likely orphaned or duplicate records)
delete from public.user_investments
where reference_id is null
  and created_at < now() - interval '1 hour'
  and status = 'active'
  and not exists (
    select 1 from public.deposits d
    where d.id::text = user_investments.reference_id
      and d.user_id = user_investments.user_id
      and d.status = 'APPROVED'
  );
