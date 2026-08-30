-- CapitalNest Database Setup for Supabase
-- Run this in Supabase SQL Editor to create all necessary tables

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) PROFILES TABLE - User account information
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text,
  country_code text,
  invitation_code text,
  referred_by uuid REFERENCES public.profiles(id),
  referral_bonus numeric(12,2) NOT NULL DEFAULT 0,
  invited_count integer NOT NULL DEFAULT 0,
  full_name text,
  address text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create unique index for invitation codes
CREATE UNIQUE INDEX IF NOT EXISTS profiles_invitation_code_unique
  ON public.profiles (lower(invitation_code))
  WHERE invitation_code IS NOT NULL;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own profile
CREATE POLICY IF NOT EXISTS "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow users to update their own profile  
CREATE POLICY IF NOT EXISTS "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow inserting own profile during signup
CREATE POLICY IF NOT EXISTS "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow admin to see all profiles
CREATE POLICY IF NOT EXISTS "Admin can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 2) ADMIN_USERS TABLE - Tracks which users are admins
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only admins can view admin records
CREATE POLICY IF NOT EXISTS "Only admins can view admin records"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR auth.uid() IN (SELECT user_id FROM public.admin_users WHERE is_active = true)
  );

-- Only service role can insert/update admin records
CREATE POLICY IF NOT EXISTS "Service role can manage admins"
  ON public.admin_users FOR ALL
  USING (auth.role() = 'service_role');

-- 3) TRANSACTIONS TABLE - Wallet transaction history
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Admins can view all transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 4) DEPOSITS TABLE - Track deposits
CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  payment_method text,
  status text DEFAULT 'pending',
  proof_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own deposits"
  ON public.deposits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Admins can view all deposits"
  ON public.deposits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 5) WITHDRAWALS TABLE - Track withdrawals
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  bank_account text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own withdrawals"
  ON public.withdrawals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Admins can view all withdrawals"
  ON public.withdrawals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 6) INVESTMENTS TABLE - Track investments
CREATE TABLE IF NOT EXISTS public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  amount numeric(12,2) NOT NULL,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own investments"
  ON public.investments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Admins can view all investments"
  ON public.investments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- 7) WALLET_TRANSACTIONS TABLE - Detailed wallet ledger
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  status text DEFAULT 'completed',
  reference_id text,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Admins can view all wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- ✅ DATABASE SETUP COMPLETE
-- Now the system can:
-- 1. Register new users
-- 2. Track admin access
-- 3. Record all transactions
-- 4. Manage deposits, withdrawals, and investments
