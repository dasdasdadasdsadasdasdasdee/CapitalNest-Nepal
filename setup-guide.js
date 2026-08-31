#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const fs = require('fs');
const path = require('path');

console.log('\n========================================');
console.log('🚀 CAPITALNEST DATABASE SETUP');
console.log('========================================\n');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing Supabase credentials');
  console.log('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}

console.log('📊 SUPABASE PROJECT INFO:');
console.log(`   URL: ${supabaseUrl.split('/')[2]}`);
console.log(`   Key: ${supabaseKey.substring(0, 15)}...`);
console.log('\n✨ DATABASE SCHEMA STATUS:');
console.log('   ❌ Tables not created yet\n');

console.log('========================================');
console.log('📋 HOW TO COMPLETE SETUP');
console.log('========================================\n');

console.log('⚙️  METHOD 1: Using Supabase Dashboard (EASIEST)\n');
console.log('Step 1: Go to Supabase Dashboard');
console.log('   → https://app.supabase.com');
console.log('\nStep 2: Select your project');
console.log(`   → ${supabaseUrl.split('/')[2]}`);
console.log('\nStep 3: Go to SQL Editor (left sidebar)');
console.log('\nStep 4: Click "New Query"');
console.log('\nStep 5: Copy the SQL from database.sql');
console.log(`   → File location: database.sql in project root`);
console.log('\nStep 6: Paste into the query editor');
console.log('\nStep 7: Click "Run" button (top right)');
console.log('\nStep 8: Wait for confirmation ✅\n');

console.log('========================================');
console.log('⚙️  METHOD 2: Using Supabase CLI\n');
console.log('Step 1: Install Supabase CLI');
console.log('   $ npm install -g supabase');
console.log('\nStep 2: Link to your project');
console.log(`   $ supabase link --project-ref YOUR_PROJECT_ID`);
console.log('\nStep 3: Push migrations');
console.log('   $ supabase db push\n');

console.log('========================================');
console.log('⚙️  METHOD 3: Using curl (If schema.sql exists)\n');
const databaseSqlPath = path.join(__dirname, 'database.sql');
if (fs.existsSync(databaseSqlPath)) {
  const sqlContent = fs.readFileSync(databaseSqlPath, 'utf-8');
  // Extract project ID from URL
  const projectMatch = supabaseUrl.match(/\/\/([^.]+)\./);
  const projectId = projectMatch ? projectMatch[1] : 'YOUR_PROJECT_ID';
  
  console.log('#!/bin/bash');
  console.log(`curl -X POST \\`);
  console.log(`  "https://${projectId}.supabase.co/rest/v1/rpc/exec_sql" \\`);
  console.log(`  -H "Authorization: Bearer ${supabaseKey.substring(0, 20)}..." \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"sql": "...database.sql content..."}'\n`);
} else {
  console.log('(database.sql file not found)\n');
}

console.log('========================================');
console.log('✅ WHAT HAPPENS AFTER SETUP');
console.log('========================================\n');

console.log('Once the tables are created:');
console.log('  1. User registration will work');
console.log('  2. Admin dashboard will load');
console.log('  3. Deposits and investments will be tracked');
console.log('  4. All data will persist correctly\n');

console.log('========================================');
console.log('🔗 QUICK LINKS');
console.log('========================================\n');

console.log(`Dashboard:    https://app.supabase.com`);
console.log(`SQL Editor:   https://app.supabase.com/project/${supabaseUrl.split('/')[2].split('.')[0]}/sql/new`);
console.log(`Local Site:   http://localhost:3000`);
console.log(`Admin Panel:  http://localhost:3000/admin/loginadmin.html\n`);

console.log('========================================');
console.log('💡 TEST AFTER SETUP');
console.log('========================================\n');

console.log('1. Try registering new user');
console.log('   → http://localhost:3000/register.html');
console.log('\n2. Login with admin credentials');
console.log('   → Email: capitalnestnepal@gmail.com');
console.log('   → Password: Admin@12345');
console.log('   → URL: http://localhost:3000/admin/loginadmin.html\n');

console.log('========================================\n');

process.exit(0);
