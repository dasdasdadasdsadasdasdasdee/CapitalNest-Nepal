-- Prevent duplicate package rows from being inserted for the same approved investment.
-- This closes the root cause: the same deposit could be added through multiple approval/data paths.

create unique index if not exists user_investments_user_reference_unique
  on public.user_investments (user_id, reference_id)
  where reference_id is not null;

-- Clean up any existing duplicates, keeping the earliest record per user + reference.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, reference_id
      order by created_at asc, id asc
    ) as rn
  from public.user_investments
  where reference_id is not null
)
delete from public.user_investments ui
where ui.id in (
  select ranked.id from ranked where ranked.rn > 1
);

-- Also remove orphan duplicate active rows that do not map to a real approved deposit.
delete from public.user_investments ui
where ui.reference_id is null
  and ui.status = 'active'
  and ui.created_at < now() - interval '1 hour';
