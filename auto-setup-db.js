#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing credentials');
  process.exit(1);
}

const essentialSQL = `
-- Create extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Profiles table
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

CREATE UNIQUE INDEX IF NOT EXISTS profiles_invitation_code_unique
  ON public.profiles (lower(invitation_code))
  WHERE invitation_code IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Admin users table
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Transactions table
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

CREATE POLICY IF NOT EXISTS "Users can view own transactions" ON public.transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Wallet transactions table
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

CREATE POLICY IF NOT EXISTS "Users can view own wallet transactions" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Deposits table
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

CREATE POLICY IF NOT EXISTS "Users can view own deposits" ON public.deposits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Withdrawals table
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

CREATE POLICY IF NOT EXISTS "Users can view own withdrawals" ON public.withdrawals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Investments table
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

CREATE POLICY IF NOT EXISTS "Users can view own investments" ON public.investments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
`;

async function setupDatabase() {
  console.log('\n========================================');
  console.log('⚡ AUTO-SETUP DATABASE');
  console.log('========================================\n');

  try {
    const projectId = supabaseUrl.split('//')[1].split('.')[0];
    const dbHost = `db.${projectId}.supabase.co`;

    console.log('🔌 Connecting to database...\n');

    // Try to execute SQL via REST API with exec
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        function_name: 'exec_sql',
        args: { sql: essentialSQL }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 404 || errorText.includes('not found')) {
        console.log('ℹ️  Direct SQL execution not available via API\n');
        console.log('========================================');
        console.log('📋 ALTERNATIVE SETUP');
        console.log('========================================\n');

        // Write SQL to file
        const sqlFile = path.join(__dirname, '.setup.sql');
        fs.writeFileSync(sqlFile, essentialSQL, 'utf-8');
        console.log(`✅ Created: ${sqlFile}\n`);

        console.log('Run this command in your terminal:\n');
        console.log(`  supabase db execute -f "${sqlFile}"\n`);

        console.log('OR manually in Supabase Dashboard:\n');
        console.log('1. Go to: https://app.supabase.com');
        console.log('2. Select your project');
        console.log('3. Click: SQL Editor → New Query');
        console.log('4. Copy content from: .setup.sql');
        console.log('5. Click: Run\n');

        process.exit(0);
      }

      console.log('⚠️  Response:', response.status, response.statusText);
      console.log(errorText.substring(0, 200));
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ DATABASE SETUP COMPLETE\n');
    console.log('Result:', result);

    console.log('\n========================================');
    console.log('✨ NEXT STEP');
    console.log('========================================\n');

    console.log('Try registering a new user:');
    console.log('  → http://localhost:3000/register.html\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\n========================================');
    console.log('🔧 MANUAL SETUP');
    console.log('========================================\n');

    // Write SQL to file for manual setup
    const sqlFile = path.join(__dirname, '.setup.sql');
    fs.writeFileSync(sqlFile, essentialSQL, 'utf-8');

    console.log('📋 SQL has been written to: .setup.sql\n');
    console.log('To finish setup, do ONE of these:\n');

    console.log('OPTION A: Use Supabase CLI');
    console.log('  $ supabase db execute -f .setup.sql\n');

    console.log('OPTION B: Supabase Dashboard');
    console.log('  1. Go to: https://app.supabase.com');
    console.log('  2. SQL Editor → New Query');
    console.log('  3. Copy from .setup.sql');
    console.log('  4. Click Run\n');

    console.log('OPTION C: Use setup-helper.html');
    console.log('  → File contains copy-paste SQL\n');

    process.exit(1);
  }
}

setupDatabase();
