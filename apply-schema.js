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

async function applyDatabaseSchema() {
  console.log('\n========================================');
  console.log('📦 CREATING DATABASE SCHEMA');
  console.log('========================================\n');

  try {
    // Read the database.sql file
    const dbSqlPath = path.join(__dirname, 'database.sql');
    if (!fs.existsSync(dbSqlPath)) {
      console.log('❌ database.sql not found!');
      process.exit(1);
    }

    console.log('📖 Reading database.sql...\n');
    const sqlContent = fs.readFileSync(dbSqlPath, 'utf-8');

    // Split by semicolon and filter out empty statements
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements\n`);

    // For Supabase JS client, we need to use a workaround since we can't execute raw SQL directly
    // We'll try using the exec RPC or just inform the user

    // Create minimal required tables using the client
    console.log('🔨 Creating tables...\n');

    // 1. Create profiles table
    console.log('1. Creating profiles table...');
    const { error: profilesError } = await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.profiles (
          id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
          email text NOT NULL,
          phone text,
          country_code text,
          invitation_code text,
          referred_by uuid REFERENCES public.profiles(id),
          referral_bonus numeric(12,2) DEFAULT 0,
          invited_count integer DEFAULT 0,
          full_name text,
          address text,
          avatar_url text,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `
    });

    if (profilesError && profilesError.code === 'PGRST204') {
      console.log('   ℹ️  exec RPC not available - trying alternative method');
    } else if (!profilesError) {
      console.log('   ✅ Profiles table created');
    } else {
      console.log(`   ⚠️  ${profilesError.message}`);
    }

    // Try to enable RLS
    console.log('\n2. Setting up profiles table...');
    await supabase.rpc('exec', { sql: 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;' }).catch(() => {});

    // 2. Create admin_users table
    console.log('\n3. Creating admin_users table...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.admin_users (
          user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
          is_active boolean DEFAULT true,
          created_at timestamptz DEFAULT now()
        );
      `
    }).catch(() => {});

    console.log('\n========================================');
    console.log('⚠️  NOTE');
    console.log('========================================\n');
    console.log('The Supabase JavaScript client cannot execute raw SQL.');
    console.log('\n✅ SOLUTION: Run migrations manually\n');
    console.log('Option 1: Use Supabase CLI');
    console.log('  $ supabase db push\n');
    console.log('Option 2: Use Supabase Dashboard');
    console.log('  1. Go to https://app.supabase.com');
    console.log('  2. Select your project');
    console.log('  3. Go to SQL Editor');
    console.log('  4. Create a new query');
    console.log('  5. Copy & paste content from database.sql');
    console.log('  6. Click "Run"\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

applyDatabaseSchema();
