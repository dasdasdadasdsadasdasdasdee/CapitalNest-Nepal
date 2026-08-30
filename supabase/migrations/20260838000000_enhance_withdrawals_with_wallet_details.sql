-- Add wallet_name and wallet_number columns to withdrawals table
-- This ensures proper tracking of withdrawal destination details

ALTER TABLE public.withdrawals 
ADD COLUMN IF NOT EXISTS wallet_name text,
ADD COLUMN IF NOT EXISTS wallet_number text,
ADD COLUMN IF NOT EXISTS verified_by uuid references public.profiles(id),
ADD COLUMN IF NOT EXISTS verification_status text not null default 'PENDING',
ADD COLUMN IF NOT EXISTS verification_notes text,
ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Create index for faster queries on withdrawal status and verification
CREATE INDEX IF NOT EXISTS withdrawals_verification_status_idx 
ON public.withdrawals(verification_status, created_at desc);

-- Create index for wallet-related queries
CREATE INDEX IF NOT EXISTS withdrawals_wallet_method_idx 
ON public.withdrawals(method, user_id);

-- Update trigger to set updated_at on verification status changes
CREATE OR REPLACE FUNCTION public.update_withdrawal_verification()
RETURNS trigger as $$
BEGIN
  IF NEW.verification_status != OLD.verification_status THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ language plpgsql;

DROP TRIGGER IF EXISTS withdrawals_verification_update ON public.withdrawals;
CREATE TRIGGER withdrawals_verification_update
BEFORE UPDATE ON public.withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.update_withdrawal_verification();

-- Add constraint to ensure wallet_name and wallet_number are provided for all non-QR methods
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.withdrawals'::regclass
      AND conname = 'check_wallet_details'
  ) THEN
    ALTER TABLE public.withdrawals
    ADD CONSTRAINT check_wallet_details
    CHECK (
      (method IN ('ESEWA', 'KHALTI') AND wallet_name IS NOT NULL AND wallet_number IS NOT NULL) OR
      (method NOT IN ('ESEWA', 'KHALTI'))
    );
  END IF;
END $$;

-- Create a function to validate wallet details format
CREATE OR REPLACE FUNCTION public.validate_wallet_details(
  p_method text,
  p_wallet_name text,
  p_wallet_number text
)
RETURNS TABLE(is_valid boolean, error_message text) as $$
BEGIN
  -- Validate wallet name
  IF p_wallet_name IS NULL OR trim(p_wallet_name) = '' THEN
    RETURN QUERY SELECT false, 'Wallet name is required'::text;
    RETURN;
  END IF;

  IF length(trim(p_wallet_name)) < 2 THEN
    RETURN QUERY SELECT false, 'Wallet name must be at least 2 characters'::text;
    RETURN;
  END IF;

  IF length(trim(p_wallet_name)) > 50 THEN
    RETURN QUERY SELECT false, 'Wallet name must not exceed 50 characters'::text;
    RETURN;
  END IF;

  -- Validate wallet number based on method
  IF p_wallet_number IS NULL OR trim(p_wallet_number) = '' THEN
    RETURN QUERY SELECT false, 'Wallet number/account is required'::text;
    RETURN;
  END IF;

  IF p_method = 'ESEWA' THEN
    -- eSewa should be 10 digits
    IF NOT (p_wallet_number ~ '^\d{10}$') THEN
      RETURN QUERY SELECT false, 'eSewa account must be 10 digits'::text;
      RETURN;
    END IF;
  ELSIF p_method = 'KHALTI' THEN
    -- Khalti can be 10 digits or email format
    IF NOT (p_wallet_number ~ '^\d{10}$' OR p_wallet_number ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$') THEN
      RETURN QUERY SELECT false, 'Khalti account must be 10 digits or valid email'::text;
      RETURN;
    END IF;
  END IF;

  -- All validations passed
  RETURN QUERY SELECT true, ''::text;
END;
$$ language plpgsql;

-- Log for audit purposes
COMMENT ON COLUMN public.withdrawals.wallet_name IS 'Name on the wallet/account (e.g., account holder name)';
COMMENT ON COLUMN public.withdrawals.wallet_number IS 'Wallet/account identifier (e.g., phone number for eSewa, phone/email for Khalti)';
COMMENT ON COLUMN public.withdrawals.verification_status IS 'Status of wallet details verification: PENDING, VERIFIED, REJECTED';
