create extension if not exists pgcrypto;

create table if not exists public.payment_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  payment_method text not null default 'bank_transfer',
  status text not null default 'pending',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  notes text,
  customer_name text,
  phone_number text,
  payment_proof_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_approvals enable row level security;

create index if not exists idx_payment_approvals_user_id
  on public.payment_approvals (user_id);

create index if not exists idx_payment_approvals_status
  on public.payment_approvals (status);

create index if not exists idx_payment_approvals_created_at
  on public.payment_approvals (created_at desc);

create index if not exists idx_payment_approvals_transaction_id
  on public.payment_approvals (transaction_id);

create index if not exists idx_payment_approvals_user_status
  on public.payment_approvals (user_id, status);

-- Users can insert their own payment approval records; the checkout flow does this.
drop policy if exists "Users can insert their own payment approvals" on public.payment_approvals;
create policy "Users can insert their own payment approvals"
on public.payment_approvals for insert
with check (auth.uid() = user_id);

-- Users can read only their own approval records.
drop policy if exists "Users can view their own payment approvals" on public.payment_approvals;
create policy "Users can view their own payment approvals"
on public.payment_approvals for select
using (auth.uid() = user_id);

-- Authenticated users can read and update approval records for the approval workflow.
drop policy if exists "Admins can view all payment approvals" on public.payment_approvals;
create policy "Authenticated users can view all payment approvals"
on public.payment_approvals for select
using (
  auth.uid() is not null
);

drop policy if exists "Admins can update payment approvals" on public.payment_approvals;
create policy "Authenticated users can update payment approvals"
on public.payment_approvals for update
using (
  auth.uid() is not null
);

-- Keep updated_at current when admins approve/reject records.
create or replace function public.update_payment_approval_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_approvals_updated_at on public.payment_approvals;
create trigger payment_approvals_updated_at
before update on public.payment_approvals
for each row
execute function public.update_payment_approval_updated_at();
