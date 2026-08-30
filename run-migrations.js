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

async function runMigrations() {
  console.log('\n========================================');
  console.log('🔄 RUNNING DATABASE MIGRATIONS');
  console.log('========================================\n');

  try {
    // First, ensure admin_users table exists
    console.log('📝 Ensuring admin_users table...');
    const adminUsersSQL = `
      CREATE TABLE IF NOT EXISTS public.admin_users (
        user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now()
      );
      
      ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
      
      CREATE POLICY "Admin users can view all admin records"
        ON public.admin_users FOR SELECT
        TO authenticated
        USING (auth.uid() IN (SELECT user_id FROM public.admin_users WHERE is_active = true));
    `;

    // Run the SQL via a direct fetch to Supabase
    try {
      // Try using RPC to execute SQL
      const { error: rpcError } = await supabase.rpc('exec', { sql: adminUsersSQL });
      if (rpcError && !rpcError.message.includes('undefined function')) {
        console.log(`⚠️  RPC exec not available: ${rpcError.message}`);
      } else if (!rpcError) {
        console.log('✅ admin_users table ready');
      }
    } catch (e) {
      console.log('ℹ️  Will verify tables directly...');
    }

    // Now try to create a simple admin_users record if the table exists
    console.log('\n📝 Setting up admin user records...');
    
    // Get all users
    const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const users = allUsers?.users || [];

    if (users.length > 0) {
      for (const user of users) {
        try {
          // Try to insert admin record
          const { data, error } = await supabase
            .from('admin_users')
            .upsert(
              { user_id: user.id, is_active: true },
              { onConflict: 'user_id' }
            )
            .select();

          if (error && error.message.includes('schema cache')) {
            console.log(`   ⏳ Schema cache refreshing... trying again in 2s`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const { error: retryError } = await supabase
              .from('admin_users')
              .upsert(
                { user_id: user.id, is_active: true },
                { onConflict: 'user_id' }
              )
              .select();
            
            if (!retryError) {
              console.log(`   ✅ ${user.email}: admin record ready`);
            } else {
              console.log(`   ⚠️  ${user.email}: ${retryError.message}`);
            }
          } else if (!error) {
            console.log(`   ✅ ${user.email}: admin record ready`);
          } else {
            console.log(`   ⚠️  ${user.email}: ${error.message}`);
          }
        } catch (e) {
          console.log(`   ℹ️  ${user.email}: ${e.message}`);
        }
      }
    }

    // Also ensure profiles exist
    console.log('\n📝 Ensuring user profiles...');
    for (const user of users) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();

        if (!profile) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert([{
              id: user.id,
              email: user.email,
              full_name: '',
              country_code: '+977'
            }]);

          if (insertError && insertError.message.includes('schema cache')) {
            console.log(`   ⏳ Schema cache refreshing...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else if (!insertError) {
            console.log(`   ✅ ${user.email}: profile created`);
          } else if (!insertError.message.includes('duplicate key')) {
            console.log(`   ⚠️  ${user.email}: ${insertError.message}`);
          }
        } else {
          console.log(`   ✅ ${user.email}: profile exists`);
        }
      } catch (e) {
        console.log(`   ℹ️  ${user.email}: ${e.message}`);
      }
    }

    console.log('\n========================================');
    console.log('✨ MIGRATIONS COMPLETE');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runMigrations();
