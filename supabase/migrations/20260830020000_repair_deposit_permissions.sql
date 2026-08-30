-- Repair the deposit API contract without bypassing authentication or RLS.
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

alter table public.deposits
  add column if not exists user_id uuid,
  add column if not exists amount numeric(12,2),
  add column if not exists payment_method text,
  add column if not exists reference_id text,
  add column if not exists payment_proof_path text,
  add column if not exists status text,
  add column if not exists rejection_reason text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.deposits
  alter column amount set default 0,
  alter column payment_method set default 'ESEWA',
  alter column status set default 'PENDING',
  alter column created_at set default now(),
  alter column updated_at set default now();

create index if not exists idx_deposits_user_id on public.deposits(user_id);
create index if not exists idx_deposits_status on public.deposits(status);
create index if not exists idx_deposits_created_at on public.deposits(created_at desc);

alter table public.deposits enable row level security;

-- PostgREST needs table privileges in addition to the RLS policies.
grant select, insert on table public.deposits to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "Users can insert their own deposits" on public.deposits;
create policy "Users can insert their own deposits"
on public.deposits for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own deposits" on public.deposits;
create policy "Users can view their own deposits"
on public.deposits for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Admins can view all deposits" on public.deposits;
create policy "Admins can view all deposits"
on public.deposits for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin = true
  )
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deposits_updated_at on public.deposits;
create trigger deposits_updated_at
before update on public.deposits
for each row
execute function public.set_updated_at();
