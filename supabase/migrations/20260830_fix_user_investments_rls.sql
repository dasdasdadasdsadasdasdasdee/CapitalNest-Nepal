-- =========================================================
-- Fix user_investments RLS for authenticated users
-- =========================================================

-- Ensure the table exists before creating policies
CREATE TABLE IF NOT EXISTS public.user_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_name text not null,
  amount numeric(12,2) not null default 0,
  duration_days integer not null default 0,
  status text not null default 'pending',
  approval_id uuid references public.payment_approvals(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.user_investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own investments" ON public.user_investments;
CREATE POLICY "Users can view own investments"
ON public.user_investments FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own investments" ON public.user_investments;
CREATE POLICY "Users can insert own investments"
ON public.user_investments FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own investments" ON public.user_investments;
CREATE POLICY "Users can update own investments"
ON public.user_investments FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
