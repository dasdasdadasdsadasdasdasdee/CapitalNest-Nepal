create extension if not exists pgcrypto;

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null default 0 check (amount > 0),
  payment_method text not null default 'ESEWA',
  reference_id text,
  payment_proof_path text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deposits_user_id on public.deposits(user_id);
create index if not exists idx_deposits_status on public.deposits(status);
create index if not exists idx_deposits_created_at on public.deposits(created_at desc);
create index if not exists idx_deposits_user_status on public.deposits(user_id, status);

alter table public.deposits enable row level security;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists deposits_updated_at on public.deposits;
create trigger deposits_updated_at
before update on public.deposits
for each row
execute function public.set_updated_at();

drop policy if exists "Users can insert their own deposits" on public.deposits;
create policy "Users can insert their own deposits"
on public.deposits for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own deposits" on public.deposits;
create policy "Users can view their own deposits"
on public.deposits for select
using (auth.uid() = user_id);

drop policy if exists "Admins can manage all deposits" on public.deposits;
create policy "Admins can manage all deposits"
on public.deposits for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

drop policy if exists "Admins can view all deposits" on public.deposits;
create policy "Admins can view all deposits"
on public.deposits for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

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
    'DEPOSIT',
    v_deposit.amount,
    'APPROVED',
    v_deposit.payment_method,
    'Deposit approved',
    v_deposit.id::text,
    now()
  );

  v_balance_after := v_balance_before + v_deposit.amount;

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

create or replace function public.reject_deposit(p_deposit_id uuid, p_admin_id uuid, p_rejection_reason text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_deposit public.deposits%rowtype;
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

  update public.deposits
  set status = 'REJECTED',
      approved_by = p_admin_id,
      rejection_reason = coalesce(p_rejection_reason, 'Payment proof could not be verified.'),
      updated_at = now()
  where id = p_deposit_id;

  return jsonb_build_object(
    'deposit_id', v_deposit.id,
    'user_id', v_deposit.user_id,
    'status', 'REJECTED',
    'rejection_reason', coalesce(p_rejection_reason, 'Payment proof could not be verified.')
  );
end;
$$;

create index if not exists wallet_transactions_user_reference_idx on public.wallet_transactions(user_id, reference_id);
