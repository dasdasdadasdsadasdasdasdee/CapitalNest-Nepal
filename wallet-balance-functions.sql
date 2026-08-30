-- Function to calculate user's current wallet balance
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id uuid)
RETURNS numeric(12,2)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(SUM(CASE 
    WHEN type IN ('deposit', 'referral_bonus', 'welcome_bonus') THEN amount
    WHEN type IN ('withdrawal', 'investment') THEN -amount
    ELSE 0
  END), 0)
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND status = 'completed';
$$;

-- Function to calculate available balance (deposits + bonuses - withdrawals)
CREATE OR REPLACE FUNCTION public.get_available_balance(p_user_id uuid)
RETURNS numeric(12,2)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(SUM(CASE 
    WHEN type IN ('deposit', 'referral_bonus', 'welcome_bonus') THEN amount
    WHEN type = 'withdrawal' THEN -amount
    ELSE 0
  END), 0)
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND status = 'completed';
$$;

-- Function to get referral bonuses only
CREATE OR REPLACE FUNCTION public.get_referral_bonus_balance(p_user_id uuid)
RETURNS numeric(12,2)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.wallet_transactions
  WHERE user_id = p_user_id 
    AND type IN ('referral_bonus', 'welcome_bonus')
    AND status = 'completed';
$$;
