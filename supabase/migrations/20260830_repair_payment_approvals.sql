-- Repair or create the payment approval table used by checkout and admin approval flows.
-- This migration is idempotent and preserves existing investment/payment data.

CREATE TABLE IF NOT EXISTS public.payment_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  notes text,
  customer_name text,
  phone_number text,
  payment_proof_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_approvals
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS transaction_id uuid,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill missing required values for existing rows without changing unrelated data.
UPDATE public.payment_approvals
SET
  user_id = user_id,
  amount = COALESCE(amount, 0),
  payment_method = COALESCE(payment_method, 'bank_transfer'),
  status = COALESCE(status, 'pending'),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now())
WHERE id IS NOT NULL;

-- Ensure the relationship and required constraints exist for the current checkout flow.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.payment_approvals'::regclass
      AND conname = 'payment_approvals_user_id_fkey'
  ) THEN
    ALTER TABLE public.payment_approvals
      ADD CONSTRAINT payment_approvals_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.payment_approvals'::regclass
      AND conname = 'payment_approvals_transaction_id_fkey'
  ) THEN
    ALTER TABLE public.payment_approvals
      ADD CONSTRAINT payment_approvals_transaction_id_fkey
      FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.payment_approvals'::regclass
      AND conname = 'payment_approvals_approved_by_fkey'
  ) THEN
    ALTER TABLE public.payment_approvals
      ADD CONSTRAINT payment_approvals_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES public.profiles(id);
  END IF;
END $$;

ALTER TABLE public.payment_approvals
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN payment_method SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.payment_approvals
  ALTER COLUMN amount SET DEFAULT 0,
  ALTER COLUMN payment_method SET DEFAULT 'bank_transfer',
  ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_payment_approvals_user_id
  ON public.payment_approvals (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_status
  ON public.payment_approvals (status);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_created_at
  ON public.payment_approvals (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_transaction_id
  ON public.payment_approvals (transaction_id);

CREATE INDEX IF NOT EXISTS idx_payment_approvals_user_status
  ON public.payment_approvals (user_id, status);

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
CREATE POLICY "Authenticated users can view all payment approvals"
ON public.payment_approvals FOR SELECT
USING (
  auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Admins can update payment approvals" ON public.payment_approvals;
CREATE POLICY "Authenticated users can update payment approvals"
ON public.payment_approvals FOR UPDATE
USING (
  auth.uid() IS NOT NULL
);