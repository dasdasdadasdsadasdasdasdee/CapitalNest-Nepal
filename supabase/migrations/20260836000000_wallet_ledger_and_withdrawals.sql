create extension if not exists pgcrypto;

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'PENDING',
  payment_method text,
  note text,
  reference_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  method text not null,
  account_details text,
  qr_image_path text,
  status text not null default 'PENDING',
  request_reference text,
  rejection_reason text,
  admin_notes text,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id),
  rejected_by uuid references public.profiles(id),
  processed_by uuid references public.profiles(id),
  paid_by uuid references public.profiles(id),
  transaction_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  referred_by uuid references public.profiles(id),
  referral_code text not null,
  status text not null default 'PENDING',
  reward_amount numeric(12,2) not null default 0,
  reward_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referrals_unique_user unique (user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'INFO',
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_status text,
  new_status text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions(user_id, created_at desc);
create index if not exists withdrawals_user_status_idx on public.withdrawals(user_id, status, created_at desc);
create index if not exists referrals_user_status_idx on public.referrals(user_id, status);
create index if not exists notifications_user_read_idx on public.notifications(user_id, is_read, created_at desc);

alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger if not exists withdrawals_updated_at
before update on public.withdrawals
for each row
execute function public.set_updated_at();

create trigger if not exists referrals_updated_at
before update on public.referrals
for each row
execute function public.set_updated_at();

alter table public.wallet_transactions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.referrals enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy if not exists "Users can view their own wallet transactions"
  on public.wallet_transactions for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their own wallet transactions"
  on public.wallet_transactions for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can view their own withdrawals"
  on public.withdrawals for select
  using (auth.uid() = user_id);

create policy if not exists "Users can insert their own withdrawals"
  on public.withdrawals for insert
  with check (auth.uid() = user_id);

create policy if not exists "Admins can manage all withdrawals"
  on public.withdrawals for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy if not exists "Users can view their own referrals"
  on public.referrals for select
  using (auth.uid() = user_id or auth.uid() = referred_by);

create policy if not exists "Users can view their own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy if not exists "Users can update their own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy if not exists "Admins can view audit logs"
  on public.admin_audit_logs for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
