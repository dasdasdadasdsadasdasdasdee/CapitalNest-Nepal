-- Activate approved package purchases and make them visible in investment/history views.
alter table public.user_investments
  add column if not exists reference_id text;

create or replace function public.approve_deposit(p_deposit_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_deposit public.deposits%rowtype;
  v_plan_name text;
  v_duration_days integer;
begin
  select * into v_deposit
  from public.deposits
  where id = p_deposit_id
  for update;

  if not found then
    raise exception 'Deposit not found';
  end if;

  if v_deposit.status <> 'PENDING' then
    raise exception 'Deposit is not pending';
  end if;

  v_plan_name := coalesce(nullif(split_part(v_deposit.reference_id, '-', 1), ''), 'Investment');
  v_duration_days := case lower(v_plan_name)
    when 'starter' then 7
    when 'growth' then 30
    when 'premium' then 45
    when 'elite' then 60
    when 'diamond' then 70
    when 'platinum' then 85
    when 'gold premium' then 100
    else 30
  end;

  update public.deposits
  set status = 'APPROVED',
      approved_by = p_admin_id,
      approved_at = now(),
      updated_at = now()
  where id = p_deposit_id;

  insert into public.user_investments (user_id, plan_name, amount, duration_days, status, reference_id, created_at, updated_at)
  values (v_deposit.user_id, v_plan_name, v_deposit.amount, v_duration_days, 'active', v_deposit.id::text, now(), now());

  insert into public.wallet_transactions (
    user_id, type, amount, status, payment_method, note, reference_id, created_at
  )
  values (
    v_deposit.user_id, 'INVESTMENT', v_deposit.amount, 'APPROVED',
    v_deposit.payment_method, 'Investment approved', v_deposit.id::text, now()
  );

  insert into public.transactions (user_id, type, amount, payment_method, status, note, created_at)
  values (
    v_deposit.user_id, 'investment', v_deposit.amount, v_deposit.payment_method,
    'approved', 'Investment approved: ' || v_deposit.id::text, now()
  );

  return jsonb_build_object(
    'deposit_id', v_deposit.id,
    'user_id', v_deposit.user_id,
    'amount', v_deposit.amount,
    'plan_name', v_plan_name,
    'duration_days', v_duration_days,
    'status', 'APPROVED'
  );
end;
$$;

-- Backfill packages approved before the activation function was installed.
insert into public.user_investments (user_id, plan_name, amount, duration_days, status, reference_id, created_at, updated_at)
select
  d.user_id,
  coalesce(nullif(split_part(d.reference_id, '-', 1), ''), 'Investment'),
  d.amount,
  case lower(coalesce(nullif(split_part(d.reference_id, '-', 1), ''), 'Investment'))
    when 'starter' then 7
    when 'growth' then 30
    when 'premium' then 45
    when 'elite' then 60
    when 'diamond' then 70
    when 'platinum' then 85
    when 'gold premium' then 100
    else 30
  end,
  'active',
  d.id::text,
  coalesce(d.approved_at, d.created_at),
  coalesce(d.approved_at, d.created_at)
from public.deposits d
where d.status = 'APPROVED'
  and not exists (
    select 1 from public.user_investments ui
    where ui.user_id = d.user_id
      and ui.reference_id = d.id::text
  );

insert into public.transactions (user_id, type, amount, payment_method, status, note, created_at)
select d.user_id, 'investment', d.amount, d.payment_method, 'approved', 'Investment approved: ' || d.id::text, coalesce(d.approved_at, d.created_at)
from public.deposits d
where d.status = 'APPROVED'
  and not exists (
    select 1 from public.transactions t
    where t.user_id = d.user_id
      and t.note = 'Investment approved: ' || d.id::text
  );
