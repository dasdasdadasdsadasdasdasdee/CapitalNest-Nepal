#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Table order matters - delete child tables first (due to foreign keys)
const tablesToClear = [
  'admin_actions',
  'admin_audit_logs',
  'referral_history',
  'referrals',
  'wallet_transactions',
  'withdrawals',
  'investment_transactions',
  'transactions',
  'deposits',
  'payment_approvals',
  'user_investments',
  'investments',
  'investment_plans',
  'notifications',
  'admin_users',
  'profiles'
];

async function clearAllData() {
  console.log('\n========================================');
  console.log('🗑️  CLEARING ALL DATA FROM TABLES');
  console.log('========================================\n');

  let totalDeleted = 0;

  for (const table of tablesToClear) {
    try {
      // Get count before delete
      const { count: countBefore } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (countBefore > 0) {
        // Delete all data
        const { error } = await supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) {
          console.log(`⚠️  ${table}: ${error.message}`);
        } else {
          console.log(`✅ ${table}: Deleted ${countBefore} rows`);
          totalDeleted += countBefore;
        }
      } else {
        console.log(`✅ ${table}: Empty (0 rows)`);
      }
    } catch (e) {
      // Table might not exist, skip
      console.log(`⏭️  ${table}: ${e.message.split('\n')[0]}`);
    }
  }

  console.log('\n========================================');
  console.log('✨ DATA CLEARED!');
  console.log(`Total rows deleted: ${totalDeleted}`);
  console.log('========================================\n');

  // Show auth users
  console.log('👤 Auth Users Still in Database:\n');
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const users = authData?.users || [];
  
  if (users.length > 0) {
    users.forEach((u, i) => {
      console.log(`   ${i + 1}. ${u.email} (${u.id})`);
    });
    console.log('\nTo delete users: node delete-all-users.js\n');
  } else {
    console.log('   No users found\n');
  }
}

async function main() {
  try {
    await clearAllData();
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
