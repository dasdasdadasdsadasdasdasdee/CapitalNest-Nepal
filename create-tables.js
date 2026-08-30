#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function createEssentialTables() {
  console.log('\n========================================');
  console.log('🔨 CREATING ESSENTIAL TABLES');
  console.log('========================================\n');

  const tables = [
    {
      name: 'profiles',
      sql: `
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
        
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY IF NOT EXISTS "Users can view own profile" ON public.profiles
          FOR SELECT TO authenticated USING (auth.uid() = id);
          
        CREATE POLICY IF NOT EXISTS "Users can insert own profile" ON public.profiles
          FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
      `
    },
    {
      name: 'admin_users',
      sql: `
        CREATE TABLE IF NOT EXISTS public.admin_users (
          user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
          is_active boolean DEFAULT true,
          created_at timestamptz DEFAULT now()
        );
        
        ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
      `
    },
    {
      name: 'transactions',
      sql: `
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
      `
    },
    {
      name: 'wallet_transactions',
      sql: `
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
      `
    }
  ];

  for (const table of tables) {
    console.log(`📝 Checking ${table.name}...`);
    
    try {
      const { data, error } = await supabase
        .from(table.name)
        .select('*')
        .limit(1);

      if (!error) {
        console.log(`   ✅ Already exists\n`);
        continue;
      }

      // Table doesn't exist, try to create it
      console.log(`   Creating...`);

      // The JS client can't execute raw SQL, so we need to use an HTTP request
      const createReq = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ sql: table.sql })
      });

      if (createReq.ok) {
        console.log(`   ✅ Created\n`);
      } else {
        const errorText = await createReq.text();
        console.log(`   ⚠️  ${createReq.status}: ${errorText.substring(0, 100)}\n`);
      }
    } catch (e) {
      console.log(`   ℹ️  ${e.message}\n`);
    }
  }

  console.log('========================================');
  console.log('🎯 NEXT STEP');
  console.log('========================================\n');

  console.log('If tables still don\'t work, you must run SQL manually:\n');
  console.log('1. Go to: https://app.supabase.com');
  console.log('2. Click "SQL Editor"');
  console.log('3. Create New Query');
  console.log('4. Copy content from: SETUP_DATABASE.sql');
  console.log('5. Paste into editor and click Run\n');

  process.exit(0);
}

createEssentialTables();
