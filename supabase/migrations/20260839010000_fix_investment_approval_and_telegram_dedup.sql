-- Approved package payments are investments, not spendable wallet deposits.
alter table public.deposits
  add column if not exists telegram_notified_at timestamptz;

alter table public.investments
  add column if not exists telegram_notified_at timestamptz;

update public.wallet_transactions wt
set type = 'INVESTMENT'
from public.deposits d
where wt.reference_id = d.id::text
  and d.status = 'APPROVED'
  and wt.type = 'DEPOSIT';

create or replace function public.approve_deposit(p_deposit_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_deposit public.deposits%rowtype;
  v_balance_before numeric(12,2);
  v_balance_after numeric(12,2);
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

  select coalesce(sum(case
      when type in ('DEPOSIT', 'REFERRAL_REWARD', 'REFUND', 'ADJUSTMENT') then amount
      when type in ('INVESTMENT', 'WITHDRAWAL_REQUEST', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_PAID') then -amount
      else 0
    end), 0)
  into v_balance_before
  from public.wallet_transactions
  where user_id = v_deposit.user_id;

  update public.deposits
  set status = 'APPROVED',
      approved_by = p_admin_id,
      approved_at = now(),
      updated_at = now()
  where id = p_deposit_id;

  insert into public.wallet_transactions (
    user_id,
    type,
    amount,
    status,
    payment_method,
    note,
    reference_id,
    created_at
  )
  values (
    v_deposit.user_id,
    'INVESTMENT',
    v_deposit.amount,
    'APPROVED',
    v_deposit.payment_method,
    'Investment approved',
    v_deposit.id::text,
    now()
  );

  v_balance_after := v_balance_before;

  return jsonb_build_object(
    'deposit_id', v_deposit.id,
    'user_id', v_deposit.user_id,
    'amount', v_deposit.amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'status', 'APPROVED'
  );
end;
$$;
