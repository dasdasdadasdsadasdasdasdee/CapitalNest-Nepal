#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const fs = require('fs');
const path = require('path');
const https = require('https');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing Supabase credentials');
  process.exit(1);
}

function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${supabaseUrl}/rest/v1/`);
    const projectId = supabaseUrl.split('//')[1].split('.')[0];
    
    // Use the direct database connection via query endpoint
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/rest/v1/',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'X-Client-Info': 'setup-db',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    // This won't work - we need to use GraphQL or another approach
    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

async function main() {
  console.log('\n========================================');
  console.log('📦 INITIALIZING DATABASE SCHEMA');
  console.log('========================================\n');

  // Read database.sql
  const dbSqlPath = path.join(__dirname, 'database.sql');
  if (!fs.existsSync(dbSqlPath)) {
    console.log('❌ database.sql not found');
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(dbSqlPath, 'utf-8');

  console.log('✅ Found database.sql\n');
  console.log('📊 SQL Statistics:');
  console.log(`   Lines: ${sqlContent.split('\n').length}`);
  console.log(`   Size: ${(sqlContent.length / 1024).toFixed(2)} KB\n`);

  // Show instructions
  console.log('========================================');
  console.log('🔧 AUTOMATIC SETUP');
  console.log('========================================\n');

  console.log('NOTE: The Supabase JS client cannot execute raw SQL directly.');
  console.log('We need to use the Supabase Dashboard instead.\n');

  console.log('✅ OPTION A: Run SQL from Dashboard (1 minute)\n');
  console.log('  Step 1: Open https://app.supabase.com');
  console.log('  Step 2: Select your project');
  console.log('  Step 3: Go to SQL Editor');
  console.log('  Step 4: Click "New Query"');
  console.log('  Step 5: Copy this and paste it:\n');

  // Show first 1000 chars of SQL
  const preview = sqlContent.substring(0, 500);
  console.log('  ' + preview.split('\n').slice(0, 10).join('\n  '));
  console.log('  ... [see database.sql for full content]\n');

  console.log('  Step 6: Click Run\n');

  console.log('✅ OPTION B: Create Tables via Node Script\n');

  // Create tables one by one
  const createProfilesSQL = `
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

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
`;

  const createAdminUsersSQL = `
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view admin records"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admin_users WHERE is_active = true));
`;

  // Write a simpler setup file
  fs.writeFileSync('supabase_init.sql', createProfilesSQL + '\n\n' + createAdminUsersSQL, 'utf-8');

  console.log('  Created: supabase_init.sql');
  console.log('  Go to Supabase Dashboard > SQL Editor');
  console.log('  Copy content from supabase_init.sql and run it\n');

  console.log('========================================');
  console.log('📝 WHAT YOU NEED TO DO:');
  console.log('========================================\n');

  console.log('1. Go to: https://app.supabase.com');
  console.log('2. Open your project');
  console.log('3. Click "SQL Editor" in sidebar');
  console.log('4. Create New Query');
  console.log('5. Run this command:\n');

  const sqlPreview = `
-- Create profiles table
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
  `;

  console.log(sqlPreview);
  console.log('\n   (and continue with rest of database.sql...)\n');

  console.log('6. Click "Run" button');
  console.log('7. Wait for success ✅');
  console.log('8. Then try registering a user\n');

  console.log('========================================');
  console.log('💾 SAVED FILES:');
  console.log('========================================\n');
  console.log('  • database.sql - Complete schema');
  console.log('  • supabase_init.sql - Minimal setup\n');

  process.exit(0);
}

main();
