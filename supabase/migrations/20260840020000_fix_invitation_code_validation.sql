-- Fix and improve invitation code validation
-- Ensures the validate_invitation_code function properly checks the database for matching codes

-- Drop existing function if it exists to recreate it fresh
drop function if exists public.validate_invitation_code(text) cascade;

-- Recreate the validation function with proper error handling
create or replace function public.validate_invitation_code(p_invitation_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_found boolean;
begin
  -- Validate input
  if p_invitation_code is null or trim(p_invitation_code) = '' then
    return false;
  end if;

  -- Normalize the code for comparison
  v_code := upper(trim(p_invitation_code));

  -- Check if code exists in profiles table (case-insensitive)
  select exists (
    select 1
    from public.profiles
    where upper(trim(invitation_code)) = v_code
      and invitation_code is not null
  ) into v_found;

  return v_found;
end;
$$;

-- Grant permissions to all users
grant execute on function public.validate_invitation_code(text) to anon, authenticated;

-- Also ensure the process_referral function uses the updated validation logic
drop function if exists public.process_referral(uuid, text) cascade;

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
  on conflict (inviter_id, invited_user_id) do nothing;

end;
$$;

-- Grant permissions to the process_referral function
grant execute on function public.process_referral(uuid, text) to anon, authenticated;
