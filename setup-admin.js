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
  console.log('🔧 SETUP ADMIN USER');
  console.log('========================================\n');

  try {
    const adminEmail = 'chiranboss@gmail.com';
    const adminPassword = 'Admin@12345'; // Default password

    // Check if admin already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const adminUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === adminEmail.toLowerCase());

    if (adminUser) {
      console.log(`✅ Admin user already exists: ${adminEmail}`);
      console.log(`   ID: ${adminUser.id}`);
      
      // Ensure admin_users record exists
      const { data: adminRecord } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', adminUser.id)
        .single();

      if (!adminRecord) {
        console.log('\n📝 Creating admin_users record...');
        const { error: insertError } = await supabase
          .from('admin_users')
          .insert([{
            user_id: adminUser.id,
            is_active: true
          }]);

        if (insertError) {
          console.log(`⚠️  ${insertError.message}`);
        } else {
          console.log('✅ Admin record created');
        }
      } else {
        console.log('✅ Admin record exists');
      }

      // Ensure profile exists
      const { data: profileRecord } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', adminUser.id)
        .single();

      if (!profileRecord) {
        console.log('\n📝 Creating profile record...');
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{
            id: adminUser.id,
            email: adminEmail,
            full_name: 'Admin User',
            country_code: '+977'
          }]);

        if (profileError) {
          console.log(`⚠️  ${profileError.message}`);
        } else {
          console.log('✅ Profile created');
        }
      } else {
        console.log('✅ Profile exists');
      }

    } else {
      console.log(`📝 Creating new admin user: ${adminEmail}`);
      const { data: newUser, error: signUpError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true
      });

      if (signUpError) {
        throw signUpError;
      }

      console.log(`✅ Auth user created: ${newUser.user.id}`);

      // Create admin_users record
      console.log('📝 Creating admin_users record...');
      const { error: adminError } = await supabase
        .from('admin_users')
        .insert([{
          user_id: newUser.user.id,
          is_active: true
        }]);

      if (adminError) {
        console.log(`⚠️  Admin record error: ${adminError.message}`);
      } else {
        console.log('✅ Admin record created');
      }

      // Create profile record
      console.log('📝 Creating profile record...');
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: newUser.user.id,
          email: adminEmail,
          full_name: 'Admin User',
          country_code: '+977'
        }]);

      if (profileError) {
        console.log(`⚠️  Profile error: ${profileError.message}`);
      } else {
        console.log('✅ Profile created');
      }
    }

    console.log('\n========================================');
    console.log('✨ ADMIN SETUP COMPLETE');
    console.log('========================================');
    console.log('\nAdmin credentials:');
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`\nAccess dashboard at:`);
    console.log(`  http://localhost:3000/admin/loginadmin.html\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
