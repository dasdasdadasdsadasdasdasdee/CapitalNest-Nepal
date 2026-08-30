#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function fixDatabaseIssue() {
  console.log('\n========================================');
  console.log('🔧 FIX DATABASE ISSUE');
  console.log('========================================\n');

  try {
    // Get the admin user
    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const adminUser = authUsers?.users?.[0];

    if (!adminUser) {
      console.log('❌ No users found');
      process.exit(0);
    }

    console.log(`Working with user: ${adminUser.email}\n`);

    // Try different approaches to access profiles table
    console.log('1️⃣  Trying direct select...');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);

      if (error) {
        console.log(`   ❌ ${error.message}`);
      } else {
        console.log(`   ✅ Can select from profiles (${data?.length || 0} rows)`);
      }
    } catch (e) {
      console.log(`   ❌ ${e.message}`);
    }

    // Try inserting a profile
    console.log('\n2️⃣  Trying to insert profile...');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: adminUser.id,
            email: adminUser.email,
            full_name: 'Admin',
            country_code: '+977'
          },
          { onConflict: 'id' }
        )
        .select();

      if (error) {
        console.log(`   ❌ ${error.message}`);
        console.log(`   Error code: ${error.code}`);
      } else {
        console.log(`   ✅ Profile inserted/updated successfully`);
      }
    } catch (e) {
      console.log(`   ❌ ${e.message}`);
    }

    // Try admin_users table
    console.log('\n3️⃣  Trying admin_users table...');
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .upsert(
          { user_id: adminUser.id, is_active: true },
          { onConflict: 'user_id' }
        )
        .select();

      if (error) {
        console.log(`   ❌ ${error.message}`);
        console.log(`   Note: Table might not exist yet`);
        console.log(`   Solution: Check Supabase SQL Editor and run migrations manually`);
      } else {
        console.log(`   ✅ Admin record ready`);
      }
    } catch (e) {
      console.log(`   ❌ ${e.message}`);
    }

    console.log('\n========================================');
    console.log('✨ DIAGNOSIS COMPLETE');
    console.log('========================================\n');
    
    console.log('💡 SOLUTION:');
    console.log('   The "Database error saving new user" usually means:');
    console.log('   1. The trigger that creates user profiles is failing');
    console.log('   2. RLS policies might be blocking inserts');
    console.log('   3. Tables might need to be created manually\n');

    console.log('📋 NEXT STEPS:');
    console.log('   1. Go to: https://app.supabase.com');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Run the content of database.sql');
    console.log('   4. Then try registering again\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixDatabaseIssue();
