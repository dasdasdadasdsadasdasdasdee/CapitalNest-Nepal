-- Repair the wallet ledger dependency required by deposit approval.
create extension if not exists pgcrypto;

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'PENDING',
  payment_method text,
  note text,
  reference_id text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions(user_id, created_at desc);

alter table public.wallet_transactions enable row level security;
grant select, insert on table public.wallet_transactions to authenticated;

drop policy if exists "Users can view their own wallet transactions" on public.wallet_transactions;
create policy "Users can view their own wallet transactions"
on public.wallet_transactions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own wallet transactions" on public.wallet_transactions;
create policy "Users can insert their own wallet transactions"
on public.wallet_transactions for insert
to authenticated
with check ((select auth.uid()) = user_id);
