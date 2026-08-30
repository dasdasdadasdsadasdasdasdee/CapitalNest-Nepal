#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  console.log('\n========================================');
  console.log('📋 DATABASE SCHEMA CHECK');
  console.log('========================================\n');

  try {
    // Get all tables from information_schema
    const { data: tables, error: tablesError } = await supabase.rpc('get_tables', {});
    
    if (tablesError) {
      console.log('ℹ️  RPC not available, trying direct approach...\n');
      
      // Try each table individually
      const tableNames = [
        'payment_approvals',
        'profiles',
        'user_investments',
        'transactions',
        'referral_history',
        'wallet_transactions',
        'withdrawal_requests',
        'payment_proofs'
      ];

      console.log('🔍 Checking tables:\n');
      
      for (const tableName of tableNames) {
        try {
          const { data, error } = await supabase
            .from(tableName)
            .select('*', { count: 'exact' })
            .limit(1);
          
          if (!error) {
            console.log(`✅ ${tableName}: EXISTS (${data?.length || 0} rows)`);
            
            // Get actual count
            const { count } = await supabase
              .from(tableName)
              .select('*', { count: 'exact', head: true });
            
            console.log(`   Total rows: ${count || 0}\n`);
          }
        } catch (e) {
          // Silent fail, table doesn't exist
        }
      }
    } else {
      console.log('Available tables:');
      console.log(tables);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

main();
