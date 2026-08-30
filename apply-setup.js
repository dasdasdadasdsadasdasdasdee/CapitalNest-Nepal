#!/usr/bin/env node

require('dotenv').config({ path: 'server/.env' });
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function main() {
  console.log('\n========================================');
  console.log('⚡ APPLYING DATABASE SCHEMA');
  console.log('========================================\n');

  try {
    // Read SETUP_DATABASE.sql
    const setupPath = path.join(__dirname, 'SETUP_DATABASE.sql');
    if (!fs.existsSync(setupPath)) {
      console.log('❌ SETUP_DATABASE.sql not found');
      process.exit(1);
    }

    const sqlContent = fs.readFileSync(setupPath, 'utf-8');
    console.log(`📄 Read SETUP_DATABASE.sql (${(sqlContent.length / 1024).toFixed(2)} KB)\n`);

    // Try using supabase db execute
    console.log('📝 Applying schema via Supabase CLI...\n');

    // Create a temp SQL file
    const tempFile = path.join(__dirname, '.temp-setup.sql');
    fs.writeFileSync(tempFile, sqlContent, 'utf-8');

    try {
      // Try supabase db execute (if available)
      const { stdout, stderr } = await execAsync(`supabase db execute -f "${tempFile}"`, {
        cwd: __dirname,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000
      });

      console.log('✅ SETUP EXECUTED\n');
      if (stdout) console.log(stdout);
      if (stderr) console.log('Warnings:', stderr);

      // Cleanup
      fs.unlinkSync(tempFile);

      console.log('\n========================================');
      console.log('✨ DATABASE SCHEMA READY');
      console.log('========================================\n');

      console.log('✅ Now try registering a user:');
      console.log('   → http://localhost:3000/register.html\n');

      process.exit(0);
    } catch (execError) {
      console.log('⚠️  CLI execute not available, trying alternative...\n');

      // Alternative: Use psql if available
      const psqlCmd = `psql "postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD || 'password'}@${process.env.SUPABASE_URL.split('://')[1].split('.')[0]}.supabase.co:5432/postgres" -f "${tempFile}"`;

      try {
        const { stdout: psqlOut } = await execAsync(psqlCmd, { maxBuffer: 10 * 1024 * 1024 });
        console.log('✅ Schema applied via psql');
        console.log(psqlOut);
        fs.unlinkSync(tempFile);
      } catch (psqlError) {
        console.log('⚠️  psql also not available');
        console.log('\n========================================');
        console.log('🔧 MANUAL SETUP REQUIRED');
        console.log('========================================\n');

        console.log('1. Go to: https://app.supabase.com');
        console.log('2. Select your project');
        console.log('3. Click "SQL Editor"');
        console.log('4. Create New Query');
        console.log('5. Open: SETUP_DATABASE.sql');
        console.log('6. Copy all content and paste into the editor');
        console.log('7. Click "Run"\n');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
