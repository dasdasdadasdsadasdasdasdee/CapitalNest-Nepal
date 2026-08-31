create table if not exists public.payment_qr_settings (
  method text primary key,
  label text not null default '',
  account_number text default '',
  image_url text default '',
  storage_path text default '',
  instruction text default '',
  updated_at timestamptz not null default now(),
  constraint payment_qr_settings_method_check
    check (method in ('ESEWA', 'KHALTI', 'FONEPAY'))
);

alter table public.payment_qr_settings enable row level security;

drop policy if exists "payment_qr_settings_are_publicly_readable" on public.payment_qr_settings;
create policy "payment_qr_settings_are_publicly_readable"
  on public.payment_qr_settings for select
  using (true);

drop policy if exists "admins_can_insert_qr_settings" on public.payment_qr_settings;
create policy "admins_can_insert_qr_settings"
  on public.payment_qr_settings for insert
  with check (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
        and is_active = true
    )
  );

drop policy if exists "admins_can_update_qr_settings" on public.payment_qr_settings;
create policy "admins_can_update_qr_settings"
  on public.payment_qr_settings for update
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
        and is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
        and is_active = true
    )
  );

drop policy if exists "admins_can_delete_qr_settings" on public.payment_qr_settings;
create policy "admins_can_delete_qr_settings"
  on public.payment_qr_settings for delete
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
        and is_active = true
    )
  );
