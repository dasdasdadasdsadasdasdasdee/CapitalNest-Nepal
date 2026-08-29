-- Add telegram_id to profiles for admin users who will approve payments
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean default false;

-- Create payment_approvals table to track pending payments
CREATE TABLE IF NOT EXISTS public.payment_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method text not null,
  status text not null default 'pending', -- pending, approved, rejected
  approved_by uuid references public.profiles(id), -- admin who approved
  approved_at timestamptz,
  telegram_message_id integer,
  notes text,
  customer_name text,
  phone_number text,
  payment_proof_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.user_investments ADD COLUMN IF NOT EXISTS approval_id uuid references public.payment_approvals(id);

-- Create user_balances table for real-time balance tracking
CREATE TABLE IF NOT EXISTS public.user_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  total_balance numeric(12,2) not null default 0,
  available_balance numeric(12,2) not null default 0,
  invested_balance numeric(12,2) not null default 0,
  last_updated timestamptz not null default now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_approvals_user_id 
  ON public.payment_approvals(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_approvals_status 
  ON public.payment_approvals(status);
CREATE INDEX IF NOT EXISTS idx_payment_approvals_created_at 
  ON public.payment_approvals(created_at DESC);

-- Update transactions table to link to payment approvals
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS approval_id uuid references public.payment_approvals(id);

-- Enable RLS on new tables
ALTER TABLE public.payment_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_approvals
CREATE POLICY "Users can insert their own payment approvals"
  ON public.payment_approvals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own payment approvals"
  ON public.payment_approvals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all payment approvals"
  ON public.payment_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Admins can update payment approvals"
  ON public.payment_approvals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- RLS Policies for user_balances
CREATE POLICY "Users can view their own balance"
  ON public.user_balances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can update balances"
  ON public.user_balances FOR UPDATE
  USING (true);

-- Function to update payment approval timestamp
CREATE OR REPLACE FUNCTION public.update_payment_approval_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment_approvals updated_at
DROP TRIGGER IF EXISTS payment_approvals_updated_at ON public.payment_approvals;
CREATE TRIGGER payment_approvals_updated_at
BEFORE UPDATE ON public.payment_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_payment_approval_timestamp();

-- Function to sync balance when transaction is approved
CREATE OR REPLACE FUNCTION public.sync_balance_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Update user_balances when payment is approved
    INSERT INTO public.user_balances (user_id, total_balance, available_balance, last_updated)
    VALUES (NEW.user_id, NEW.amount, NEW.amount, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      available_balance = user_balances.available_balance + NEW.amount,
      total_balance = user_balances.total_balance + NEW.amount,
      last_updated = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync balance on approval
DROP TRIGGER IF EXISTS sync_balance_on_approval ON public.payment_approvals;
CREATE TRIGGER sync_balance_on_approval
AFTER UPDATE ON public.payment_approvals
FOR EACH ROW
EXECUTE FUNCTION public.sync_balance_on_approval();
