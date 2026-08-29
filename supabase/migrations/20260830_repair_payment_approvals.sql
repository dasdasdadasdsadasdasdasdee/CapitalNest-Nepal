-- Repair the payment approval table and its authenticated-user insert policy.
-- Run this in the live Supabase SQL Editor if payment approval creation fails.

CREATE TABLE IF NOT EXISTS public.payment_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  telegram_message_id integer,
  notes text,
  customer_name text,
  phone_number text,
  payment_proof_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS amount numeric(12,2);
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS telegram_message_id integer;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS payment_proof_url text;
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payment_approvals ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.payment_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own payment approvals" ON public.payment_approvals;
CREATE POLICY "Users can insert their own payment approvals"
ON public.payment_approvals FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own payment approvals" ON public.payment_approvals;
CREATE POLICY "Users can view their own payment approvals"
ON public.payment_approvals FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all payment approvals" ON public.payment_approvals;
CREATE POLICY "Admins can view all payment approvals"
ON public.payment_approvals FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

DROP POLICY IF EXISTS "Admins can update payment approvals" ON public.payment_approvals;
CREATE POLICY "Admins can update payment approvals"
ON public.payment_approvals FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);