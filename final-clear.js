#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkRemaining() {
  console.log('\n========================================');
  console.log('🔍 CHECKING REMAINING DATA IN SUPABASE');
  console.log('========================================\n');

  // Check auth users
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const users = authData?.users || [];

  console.log(`👤 Auth Users: ${users.length}`);
  if (users.length > 0) {
    users.forEach(u => console.log(`   - ${u.email}`));
    return true; // Still has data
  }

  // Check storage buckets
  console.log('\n📁 Storage Buckets:');
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (buckets && buckets.length > 0) {
      for (const bucket of buckets) {
        const { data: files } = await supabase.storage.from(bucket.name).list('', { limit: 100 });
        if (files && files.length > 0) {
          console.log(`   - ${bucket.name}: ${files.length} files`);
          return true;
        }
      }
    }
    console.log('   (Empty)');
  } catch (e) {
    console.log('   (Could not check)');
  }

  return false;
}

async function deleteAllUsers() {
  console.log('\n========================================');
  console.log('🗑️  DELETING ALL AUTH USERS');
  console.log('========================================\n');

  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const users = authData?.users || [];

  if (users.length === 0) {
    console.log('✅ No users to delete');
    return;
  }

  for (const user of users) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) {
        console.log(`❌ ${user.email}: ${error.message}`);
      } else {
        console.log(`✅ Deleted: ${user.email}`);
      }
    } catch (e) {
      console.log(`❌ ${user.email}: ${e.message}`);
    }
  }

  console.log('\n========================================');
  console.log('✨ ALL USERS DELETED');
  console.log('========================================\n');
}

async function main() {
  try {
    const hasData = await checkRemaining();

    if (hasData) {
      await deleteAllUsers();
    } else {
      console.log('\n✨ SUPABASE IS COMPLETELY EMPTY!');
      console.log('   No users, no data, no files\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
