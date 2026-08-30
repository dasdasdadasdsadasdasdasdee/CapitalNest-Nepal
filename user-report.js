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
  console.log('👥 USER ACCOUNTS & INVESTMENTS REPORT');
  console.log('========================================\n');

  try {
    // Get all auth users
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const users = authData?.users || [];

    if (users.length === 0) {
      console.log('❌ No users found in database\n');
      process.exit(0);
    }

    console.log(`Total Users: ${users.length}\n`);

    let totalAvailable = 0;
    let totalDeposited = 0;
    let totalInvested = 0;
    let totalEarned = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${i + 1}. ${user.email}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`   User ID: ${user.id}`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        console.log(`   Full Name: ${profile.full_name || 'N/A'}`);
        console.log(`   Phone: ${profile.phone || 'N/A'}`);
        console.log(`   Country: ${profile.country_code || 'N/A'}`);
        console.log(`   Referral Code: ${profile.invitation_code || 'N/A'}`);
        console.log(`   Referral Bonus: Rs.${(profile.referral_bonus || 0).toLocaleString()}`);
      }

      // Get deposits
      const { data: deposits } = await supabase
        .from('deposits')
        .select('amount, status')
        .eq('user_id', user.id);

      const approvedDeposits = deposits?.filter(d => d.status === 'approved') || [];
      const depositAmount = approvedDeposits.reduce((sum, d) => sum + (d.amount || 0), 0);

      console.log(`\n   💳 DEPOSITS:`);
      console.log(`      Total Deposits: ${deposits?.length || 0}`);
      console.log(`      Approved Amount: Rs.${depositAmount.toLocaleString()}`);

      // Get investments
      const { data: investments } = await supabase
        .from('user_investments')
        .select('amount, status, plan_name, created_at')
        .eq('user_id', user.id);

      const activeInvestments = investments?.filter(i => i.status === 'active') || [];
      const investedAmount = investments?.reduce((sum, i) => sum + (i.amount || 0), 0) || 0;

      console.log(`\n   📈 INVESTMENTS:`);
      console.log(`      Total Investments: ${investments?.length || 0}`);
      console.log(`      Total Invested: Rs.${investedAmount.toLocaleString()}`);
      console.log(`      Active: ${activeInvestments.length}`);

      if (investments && investments.length > 0) {
        investments.forEach((inv, idx) => {
          console.log(`        ${idx + 1}. ${inv.plan_name || 'Investment'} - Rs.${(inv.amount || 0).toLocaleString()} (${inv.status})`);
        });
      }

      // Get wallet transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('type, amount, status')
        .eq('user_id', user.id);

      const earned = transactions
        ?.filter(t => t.type === 'interest' || t.type === 'return' || t.type === 'bonus')
        ?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

      console.log(`\n   💰 FINANCIAL SUMMARY:`);
      console.log(`      Deposited: Rs.${depositAmount.toLocaleString()}`);
      console.log(`      Invested: Rs.${investedAmount.toLocaleString()}`);
      console.log(`      Earned: Rs.${earned.toLocaleString()}`);

      const available = depositAmount - investedAmount;
      console.log(`      Available: Rs.${Math.max(0, available).toLocaleString()}`);

      // Accumulate totals
      totalAvailable += Math.max(0, available);
      totalDeposited += depositAmount;
      totalInvested += investedAmount;
      totalEarned += earned;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 TOTAL SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`   Total Users: ${users.length}`);
    console.log(`   Total Available: Rs.${totalAvailable.toLocaleString()}`);
    console.log(`   Total Deposited: Rs.${totalDeposited.toLocaleString()}`);
    console.log(`   Total Invested: Rs.${totalInvested.toLocaleString()}`);
    console.log(`   Total Earned: Rs.${totalEarned.toLocaleString()}`);
    console.log(`${'='.repeat(60)}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
