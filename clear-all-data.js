#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function showExistingData() {
  console.log('\n========================================');
  console.log('📊 CHECKING EXISTING DATA IN SUPABASE');
  console.log('========================================\n');

  try {
    // Count auth users
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authError) throw authError;
    const userCount = authUsers?.users?.length || 0;
    console.log(`👤 Auth Users: ${userCount}`);
    if (userCount > 0) {
      authUsers.users.forEach((u, i) => {
        console.log(`   ${i + 1}. ${u.email} (${u.id})`);
      });
    }

    console.log('\n========================================\n');
    return { userCount };
  } catch (error) {
    console.error('❌ Error reading data:', error.message);
    throw error;
  }
}

async function clearAllData() {
  console.log('\n========================================');
  console.log('🗑️  CLEARING ALL DATA');
  console.log('========================================\n');

  try {
    // Delete auth users
    console.log('🔐 Deleting Auth Users...');
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw listError;
    
    if (authUsers?.users && authUsers.users.length > 0) {
      for (const user of authUsers.users) {
        const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
        if (delError) {
          console.log(`⚠️  Failed to delete ${user.email}: ${delError.message}`);
        } else {
          console.log(`✅ Deleted ${user.email}`);
        }
      }
    } else {
      console.log('✅ No auth users to delete');
    }

    console.log('\n========================================');
    console.log('✨ ALL DATA CLEARED SUCCESSFULLY!');
    console.log('========================================\n');
    console.log('Database is now clean and ready for new users.');
  } catch (error) {
    console.error('❌ Error clearing data:', error.message);
    throw error;
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Show existing data
    await showExistingData();

    // Ask for confirmation
    rl.question('Do you want to CLEAR ALL DATA? (type "yes" to confirm): ', async (answer) => {
      if (answer.toLowerCase() === 'yes') {
        await clearAllData();
        rl.close();
        process.exit(0);
      } else {
        console.log('❌ Data clear cancelled.');
        rl.close();
        process.exit(1);
      }
    });
  } catch (error) {
    console.error('Fatal error:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
