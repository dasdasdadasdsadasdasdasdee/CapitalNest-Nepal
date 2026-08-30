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
begin
  if p_user_id is null or p_invitation_code is null or trim(p_invitation_code) = '' then
    return;
  end if;

  if exists (select 1 from public.referral_history where invited_user_id = p_user_id) then
    return;
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and referred_by is not null) then
    return;
  end if;

  select id into v_inviter_id
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
    upper(trim(p_invitation_code)),
    v_bonus_amount,
    'completed'
  )
  on conflict (invited_user_id) do nothing
  returning id into v_history_id;

  if v_history_id is null then
    return;
  end if;

  insert into public.wallet_transactions (user_id, type, amount, status, payment_method, note, reference_id)
  values (
    v_inviter_id,
    'REFERRAL_BONUS',
    v_bonus_amount,
    'completed',
    'referral',
    'Referral bonus for successful referral',
    v_history_id::text
  )
  on conflict do nothing;

  insert into public.wallet_transactions (user_id, type, amount, status, payment_method, note, reference_id)
  values (
    p_user_id,
    'WELCOME_BONUS',
    v_bonus_amount,
    'completed',
    'referral',
    'Welcome bonus from referral link',
    v_history_id::text
  )
  on conflict do nothing;

  update public.profiles
  set invited_count = (
      select count(*) from public.referral_history where inviter_id = v_inviter_id and status = 'completed'
    ),
      referral_bonus = (
      select coalesce(sum(bonus_amount), 0) from public.referral_history where inviter_id = v_inviter_id and status = 'completed'
    ),
      updated_at = now()
  where id = v_inviter_id;

  update public.profiles
  set referral_bonus = (
      select coalesce(sum(amount), 0)
      from public.wallet_transactions
      where user_id = p_user_id
        and type in ('WELCOME_BONUS', 'REFERRAL_BONUS')
        and status = 'completed'
    ),
      updated_at = now()
  where id = p_user_id;
end;
$$;

DROP POLICY IF EXISTS "Users can insert their own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "System can insert wallet transaction from referral flow"
  ON public.wallet_transactions
  FOR INSERT TO public
  WITH CHECK (true);
