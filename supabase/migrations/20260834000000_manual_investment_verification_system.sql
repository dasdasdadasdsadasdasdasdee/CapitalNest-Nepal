create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists is_admin boolean,
  add column if not exists email text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.profiles
set
  is_admin = coalesce(is_admin, false),
  email = coalesce(email, (select au.email from auth.users au where au.id = public.profiles.id)),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where id is not null;

alter table public.profiles
  alter column is_admin set default false,
  alter column is_admin set not null,
  alter column created_at set default now(),
  alter column updated_at set default now();

create table if not exists public.investment_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  min_amount numeric(12,2) not null default 0,
  duration_days integer not null default 0,
  description text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  investment_plan text not null default 'Investment',
  amount numeric(12,2) not null default 0 check (amount > 0),
  payment_proof_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- compatibility columns for the current frontend/admin workflow
  user_email text,
  plan_name text,
  investment_amount numeric(12,2),
  payment_proof_path text,
  admin_note text,
  approved_by text,
  rejected_by text,
  transaction_ref text
);

alter table public.investments
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists investment_plan text,
  add column if not exists amount numeric(12,2),
  add column if not exists payment_proof_url text,
  add column if not exists status text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists user_email text,
  add column if not exists plan_name text,
  add column if not exists investment_amount numeric(12,2),
  add column if not exists payment_proof_path text,
  add column if not exists admin_note text,
  add column if not exists approved_by text,
  add column if not exists rejected_by text,
  add column if not exists transaction_ref text;

update public.investments
set
  email = coalesce(email, user_email, (select au.email from auth.users au where au.id = public.investments.user_id), 'unknown@example.com'),
  investment_plan = coalesce(investment_plan, plan_name, 'Investment'),
  amount = coalesce(amount, investment_amount, 0),
  payment_proof_url = coalesce(payment_proof_url, payment_proof_path, 'pending'),
  status = coalesce(status, 'pending'),
  user_email = coalesce(user_email, email),
  plan_name = coalesce(plan_name, investment_plan, 'Investment'),
  investment_amount = coalesce(investment_amount, amount),
  payment_proof_path = coalesce(payment_proof_path, payment_proof_url),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where id is not null;

alter table public.investments
  alter column email set not null,
  alter column investment_plan set default 'Investment',
  alter column amount set default 0,
  alter column payment_proof_url set not null,
  alter column status set default 'pending',
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column status set not null;

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null default 'investment_submission' check (type in ('investment_submission','approval','rejection','manual_adjustment')),
  amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reference_id text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments(id) on delete cascade,
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('APPROVED','REJECTED','STATUS_CHANGED','PAYMENT_PROOF_VIEWED')),
  previous_status text,
  new_status text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_investments_user_id on public.investments(user_id);
create index if not exists idx_investments_status on public.investments(status);
create index if not exists idx_investments_created_at on public.investments(created_at desc);
create index if not exists idx_investments_user_status on public.investments(user_id, status);
create index if not exists idx_investments_email on public.investments(email);
create index if not exists idx_investment_transactions_investment_id on public.investment_transactions(investment_id);
create index if not exists idx_admin_actions_investment_id on public.admin_actions(investment_id);

create or replace function public.is_admin_user()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((
    select is_admin
    from public.profiles
    where id = auth.uid()
    limit 1
  ), false);
$$;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists investments_set_updated_at on public.investments;
create trigger investments_set_updated_at
before update on public.investments
for each row
execute function public.set_updated_at();

drop trigger if exists investment_plans_set_updated_at on public.investment_plans;
create trigger investment_plans_set_updated_at
before update on public.investment_plans
for each row
execute function public.set_updated_at();

alter table public.investment_plans enable row level security;
alter table public.investments enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.admin_actions enable row level security;

drop policy if exists "Public can view investment plans" on public.investment_plans;
create policy "Public can view investment plans"
on public.investment_plans for select
using (status = 'active');

drop policy if exists "Users can view own investments" on public.investments;
create policy "Users can view own investments"
on public.investments for select
using (auth.uid() = user_id or public.is_admin_user());

drop policy if exists "Users can insert their own investments" on public.investments;
create policy "Users can insert their own investments"
on public.investments for insert
with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users cannot change investment status" on public.investments;
create policy "Users cannot change investment status"
on public.investments for update
using (auth.uid() = user_id)
with check (false);

drop policy if exists "Admins can manage all investments" on public.investments;
create policy "Admins can manage all investments"
on public.investments for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Users can view own transactions" on public.investment_transactions;
create policy "Users can view own transactions"
on public.investment_transactions for select
using (auth.uid() = user_id or public.is_admin_user());

drop policy if exists "Users can insert their own transactions" on public.investment_transactions;
create policy "Users can insert their own transactions"
on public.investment_transactions for insert
with check (auth.uid() = user_id);

drop policy if exists "Admins can manage investment transactions" on public.investment_transactions;
create policy "Admins can manage investment transactions"
on public.investment_transactions for all
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Admins can view audit logs" on public.admin_actions;
create policy "Admins can view audit logs"
on public.admin_actions for select
using (public.is_admin_user());

drop policy if exists "Admins can insert audit logs" on public.admin_actions;
create policy "Admins can insert audit logs"
on public.admin_actions for insert
with check (public.is_admin_user());

drop policy if exists "Users cannot modify audit logs" on public.admin_actions;
create policy "Users cannot modify audit logs"
on public.admin_actions for update
using (false)
with check (false);

drop policy if exists "Users cannot delete audit logs" on public.admin_actions;
create policy "Users cannot delete audit logs"
on public.admin_actions for delete
using (false);

insert into public.investment_plans (name, code, min_amount, duration_days, description, status)
values
  ('Starter', 'starter', 5000, 7, 'Short-term investment plan', 'active'),
  ('Growth', 'growth', 15000, 30, 'Balanced medium-term investment plan', 'active'),
  ('Premium', 'premium', 25000, 45, 'Premium investment option', 'active'),
  ('Elite', 'elite', 35000, 60, 'Elite option for established investors', 'active'),
  ('Diamond', 'diamond', 50000, 70, 'High-value investment plan', 'active'),
  ('Platinum', 'platinum', 95000, 85, 'Professional investment plan', 'active')
on conflict (code) do nothing;

drop policy if exists "Users can upload their own proof files" on storage.objects;
create policy "Users can upload their own proof files"
on storage.objects for insert
with check (
  bucket_id = 'payment-proofs'
  and auth.uid() = owner
);

drop policy if exists "Users can view their own proof files" on storage.objects;
create policy "Users can view their own proof files"
on storage.objects for select
using (
  bucket_id = 'payment-proofs'
  and (auth.uid() = owner or public.is_admin_user())
);

drop policy if exists "Users cannot delete proof files directly" on storage.objects;
create policy "Users cannot delete proof files directly"
on storage.objects for delete
using (false);

drop policy if exists "Admins can manage all proof files" on storage.objects;
create policy "Admins can manage all proof files"
on storage.objects for update
using (bucket_id = 'payment-proofs' and public.is_admin_user())
with check (bucket_id = 'payment-proofs' and public.is_admin_user());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/jpg','image/avif'])
on conflict (id) do nothing;
