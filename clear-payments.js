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
  console.log('💳 PAYMENT DATA MANAGEMENT');
  console.log('========================================\n');

  try {
    // List all tables to see what exists
    console.log('🔍 Checking available tables...\n');
    
    // Try to query payment_approvals
    const { data: payments, error: payError } = await supabase
      .from('payment_approvals')
      .select('*');
    
    if (!payError) {
      console.log(`📊 Payment Approvals Found: ${payments?.length || 0}`);
      if (payments && payments.length > 0) {
        payments.forEach((p, i) => {
          console.log(`   ${i + 1}. Amount: ${p.amount}, Status: ${p.status}, User: ${p.user_id}`);
        });
        
        // Delete all payment approvals
        console.log('\n🗑️  Deleting all payment approvals...');
        const { error: delError } = await supabase
          .from('payment_approvals')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (delError) {
          console.log(`❌ Error: ${delError.message}`);
        } else {
          console.log(`✅ All ${payments.length} payment approvals deleted!`);
        }
      } else {
        console.log('✅ No payment approvals to delete');
      }
    } else {
      console.log(`ℹ️  Payment Approvals table: ${payError.message}`);
    }

    // Try wallet_transactions
    console.log('\n---');
    const { data: walletTx, error: walletError } = await supabase
      .from('wallet_transactions')
      .select('*');
    
    if (!walletError) {
      console.log(`📊 Wallet Transactions Found: ${walletTx?.length || 0}`);
      if (walletTx && walletTx.length > 0) {
        walletTx.slice(0, 3).forEach((t, i) => {
          console.log(`   ${i + 1}. Type: ${t.type}, Amount: ${t.amount}`);
        });
        if (walletTx.length > 3) console.log(`   ... and ${walletTx.length - 3} more`);
        
        // Delete all wallet transactions
        console.log('\n🗑️  Deleting all wallet transactions...');
        const { error: delError } = await supabase
          .from('wallet_transactions')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (delError) {
          console.log(`❌ Error: ${delError.message}`);
        } else {
          console.log(`✅ All ${walletTx.length} wallet transactions deleted!`);
        }
      }
    }

    // Try transactions
    console.log('\n---');
    const { data: trans, error: transError } = await supabase
      .from('transactions')
      .select('*');
    
    if (!transError) {
      console.log(`📊 Transactions Found: ${trans?.length || 0}`);
      if (trans && trans.length > 0) {
        trans.slice(0, 3).forEach((t, i) => {
          console.log(`   ${i + 1}. Type: ${t.type}, Amount: ${t.amount}, Status: ${t.status}`);
        });
        if (trans.length > 3) console.log(`   ... and ${trans.length - 3} more`);
        
        // Delete all transactions
        console.log('\n🗑️  Deleting all transactions...');
        const { error: delError } = await supabase
          .from('transactions')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (delError) {
          console.log(`❌ Error: ${delError.message}`);
        } else {
          console.log(`✅ All ${trans.length} transactions deleted!`);
        }
      }
    }

    console.log('\n========================================');
    console.log('✨ PAYMENT DATA CLEARED SUCCESSFULLY!');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
