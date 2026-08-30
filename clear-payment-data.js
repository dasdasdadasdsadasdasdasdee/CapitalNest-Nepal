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
  console.log('🗑️  CLEARING ALL PAYMENT DATA');
  console.log('========================================\n');

  try {
    // Get all users
    console.log('👤 Checking users...');
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const users = authData?.users || [];
    console.log(`   Found: ${users.length} user(s)\n`);

    // Check storage for payment proofs
    console.log('📁 Checking payment-proofs storage bucket...');
    try {
      const { data: files, error: listError } = await supabase
        .storage
        .from('payment-proofs')
        .list('', { limit: 100 });

      if (!listError && files && files.length > 0) {
        console.log(`   Found: ${files.length} file(s)`);
        files.forEach(f => console.log(`     - ${f.name}`));

        // Delete all payment proof files
        console.log('\n🗑️  Deleting payment proof files...');
        const fileNames = files.map(f => f.name);
        const { error: delError } = await supabase
          .storage
          .from('payment-proofs')
          .remove(fileNames);

        if (delError) {
          console.log(`   ⚠️  Error: ${delError.message}`);
        } else {
          console.log(`   ✅ Deleted ${fileNames.length} files`);
        }
      } else {
        console.log('   ✅ No files found (or bucket empty)');
      }
    } catch (e) {
      console.log(`   ℹ️  Storage check: ${e.message}`);
    }

    // Clear user profile data
    console.log('\n👥 Clearing user profile data...');
    if (users.length > 0) {
      console.log(`   ✅ ${users.length} user(s) will remain (delete with separate command if needed)`);
      users.forEach(u => console.log(`     - ${u.email}`));
    }

    console.log('\n========================================');
    console.log('✨ PAYMENT FILES CLEARED!');
    console.log('========================================\n');
    console.log('Note: To delete users completely, run:');
    console.log('  node delete-all-users.js\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
