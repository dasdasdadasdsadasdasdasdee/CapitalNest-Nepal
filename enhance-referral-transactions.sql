-- Enhanced process_referral function to create wallet transactions and update balances
CREATE OR REPLACE FUNCTION public.process_referral(p_user_id uuid, p_invitation_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_inviter_id uuid;
  v_bonus_amount numeric(12,2) := 50;
  v_history_id uuid;
  v_inviter_tx_id uuid;
  v_invitee_tx_id uuid;
  v_code text;
begin
  if p_user_id is null or p_invitation_code is null or trim(p_invitation_code) = '' then
    return;
  end if;

  -- Check if this user was already referred
  if exists (
    select 1 from public.referral_history where invited_user_id = p_user_id
  ) then
    return;
  end if;

  -- Check if user already has a referrer
  if exists (
    select 1 from public.profiles where id = p_user_id and referred_by is not null
  ) then
    return;
  end if;

  -- Normalize the code for lookup
  v_code := upper(trim(p_invitation_code));

  -- Find the inviter by their invitation code
  select id
    into v_inviter_id
  from public.profiles
  where upper(trim(invitation_code)) = v_code
    and invitation_code is not null
  limit 1;

  -- Validate: inviter exists and is not the user themselves
  if v_inviter_id is null or v_inviter_id = p_user_id then
    return;
  end if;

  -- Update the user's referred_by field
  update public.profiles
  set referred_by = v_inviter_id,
      referral_bonus = referral_bonus + v_bonus_amount,
      updated_at = now()
  where id = p_user_id and referred_by is null;

  -- Record the referral in history
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
    v_code,
    v_bonus_amount,
    'pending'
  )
  on conflict (invited_user_id) do nothing
  returning id into v_history_id;

  if v_history_id is null then
    return;
  end if;

  -- Create wallet transaction for INVITER (referrer gets 50 Rs)
  insert into public.wallet_transactions (
    user_id,
    type,
    amount,
    status,
    reference_id,
    description
  )
  values (
    v_inviter_id,
    'referral_bonus',
    v_bonus_amount,
    'completed',
    v_history_id::text,
    'Referral bonus: ' || p_user_id::text
  )
  on conflict do nothing
  returning id into v_inviter_tx_id;

  -- Create wallet transaction for INVITEE (new user gets 50 Rs)
  insert into public.wallet_transactions (
    user_id,
    type,
    amount,
    status,
    reference_id,
    description
  )
  values (
    p_user_id,
    'welcome_bonus',
    v_bonus_amount,
    'completed',
    v_history_id::text,
    'Welcome bonus from referral'
  )
  on conflict do nothing
  returning id into v_invitee_tx_id;

end;
$$;
