#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  console.log('\n========================================');
  console.log('⚠️  DELETE ALL USERS');
  console.log('========================================\n');

  try {
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const users = authData?.users || [];

    console.log(`👤 Found ${users.length} user(s):\n`);
    users.forEach((u, i) => {
      console.log(`   ${i + 1}. ${u.email} (${u.id})`);
    });

    if (users.length === 0) {
      console.log('✅ No users to delete');
      process.exit(0);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('\n⚠️  Type "DELETE ALL USERS" to confirm: ', async (answer) => {
      if (answer === 'DELETE ALL USERS') {
        console.log('\n🗑️  Deleting users...\n');

        for (const user of users) {
          try {
            const { error } = await supabase.auth.admin.deleteUser(user.id);
            if (error) {
              console.log(`   ❌ ${user.email}: ${error.message}`);
            } else {
              console.log(`   ✅ ${user.email}`);
            }
          } catch (e) {
            console.log(`   ❌ ${user.email}: ${e.message}`);
          }
        }

        console.log('\n========================================');
        console.log('✨ ALL USERS DELETED!');
        console.log('========================================\n');
      } else {
        console.log('\n❌ Deletion cancelled.');
      }
      rl.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
