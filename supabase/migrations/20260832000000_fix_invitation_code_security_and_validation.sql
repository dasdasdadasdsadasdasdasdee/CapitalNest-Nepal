-- Fix invitation-code validation and hardened security-definer behavior for signup/referral processing.
-- This is a corrective migration for the live Supabase project and does not rewrite earlier production migrations.

create or replace function public.validate_invitation_code(p_invitation_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_invitation_code is null or trim(p_invitation_code) = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles
    where lower(invitation_code) = lower(trim(p_invitation_code))
  );
end;
$$;

grant execute on function public.validate_invitation_code(text) to anon, authenticated;

create or replace function public.process_referral(p_user_id uuid, p_invitation_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inviter_id uuid;
  v_bonus_amount numeric(12,2) := 50;
  v_history_id uuid;
  v_inviter_bonus_tx_id uuid;
  v_invitee_bonus_tx_id uuid;
begin
  if p_user_id is null or p_invitation_code is null or trim(p_invitation_code) = '' then
    return;
  end if;

  if exists (
    select 1 from public.referral_history where invited_user_id = p_user_id
  ) then
    return;
  end if;

  if exists (
    select 1 from public.profiles where id = p_user_id and referred_by is not null
  ) then
    return;
  end if;

  select id
    into v_inviter_id
  from public.profiles
  where lower(invitation_code) = lower(trim(p_invitation_code))
  limit 1;

  if v_inviter_id is null or v_inviter_id = p_user_id then
    return;
  end if;

  update public.profiles
  set referred_by = v_inviter_id,
      updated_at = now()
  where id = p_user_id and referred_by is null;

  insert into public.referral_history (
    inviter_id,
    invited_user_id,
    referral_code,
    bonus_amount,
    status
  )
  values (
    v_inviter_id,
    p_user_id,
    trim(p_invitation_code),
    v_bonus_amount,
    'completed'
  )
  on conflict (invited_user_id) do nothing
  returning id into v_history_id;

  if v_history_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.transactions
    where user_id = v_inviter_id
      and referral_history_id = v_history_id
      and type = 'welcome_bonus'
  ) then
    insert into public.transactions (
      user_id,
      type,
      amount,
      payment_method,
      status,
      note,
      referral_history_id
    )
    values (
      v_inviter_id,
      'welcome_bonus',
      v_bonus_amount,
      'referral',
      'completed',
      'Welcome bonus for successful referral',
      v_history_id
    )
    returning id into v_inviter_bonus_tx_id;
  end if;

  if not exists (
    select 1
    from public.transactions
    where user_id = p_user_id
      and referral_history_id = v_history_id
      and type = 'welcome_bonus'
  ) then
    insert into public.transactions (
      user_id,
      type,
      amount,
      payment_method,
      status,
      note,
      referral_history_id
    )
    values (
      p_user_id,
      'welcome_bonus',
      v_bonus_amount,
      'referral',
      'completed',
      'Welcome bonus for joining through referral link',
      v_history_id
    )
    returning id into v_invitee_bonus_tx_id;
  end if;

  update public.referral_history
  set bonus_amount = v_bonus_amount,
      bonus_transaction_id = coalesce(bonus_transaction_id, v_inviter_bonus_tx_id)
  where id = v_history_id;

  update public.profiles
  set invited_count = (
      select count(*)
      from public.referral_history
      where inviter_id = v_inviter_id and status = 'completed'
    ),
      referral_bonus = (
      select coalesce(sum(bonus_amount), 0)
      from public.referral_history
      where inviter_id = v_inviter_id and status = 'completed'
    ),
      updated_at = now()
  where id = v_inviter_id;

  update public.profiles
  set referral_bonus = (
      select coalesce(sum(amount), 0)
      from public.transactions
      where user_id = p_user_id and type = 'welcome_bonus'
    ),
      updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referral_code text;
  v_user_invitation_code text;
begin
  v_referral_code := nullif(trim(new.raw_user_meta_data->>'invitation_code'), '');
  v_user_invitation_code := public.generate_referral_code();

  insert into public.profiles (
    id,
    email,
    phone,
    country_code,
    invitation_code,
    referred_by,
    full_name,
    address
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'country_code',
    v_user_invitation_code,
    null,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'address'
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = excluded.phone,
    country_code = excluded.country_code,
    invitation_code = coalesce(excluded.invitation_code, public.profiles.invitation_code, public.generate_referral_code()),
    full_name = excluded.full_name,
    address = excluded.address,
    updated_at = now();

  perform public.process_referral(new.id, v_referral_code);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
