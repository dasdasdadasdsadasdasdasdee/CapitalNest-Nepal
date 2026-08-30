-- Keep administrator membership separate from regular user profiles.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_users_email_unique
  on public.admin_users (lower(email));

alter table public.admin_users enable row level security;

drop policy if exists "Admins can view their own admin membership" on public.admin_users;
create policy "Admins can view their own admin membership"
on public.admin_users for select
to authenticated
using (auth.uid() = user_id);
