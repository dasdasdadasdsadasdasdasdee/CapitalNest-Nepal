# CapitalNest Database Setup - Critical Issue & Solution

## 🔴 THE PROBLEM

When you tried to register a user or access the admin dashboard, you got errors like:
- "Database error saving new user"
- "Failed to load dashboard data. Auth session missing!"

**Root Cause:** The database tables don't exist yet in your Supabase project.

When we cleared the data earlier, we may have accidentally removed the schema. The tables need to be recreated.

---

## ✅ THE SOLUTION (Takes 2 minutes)

### STEP 1: Go to Supabase Dashboard
Open: **https://app.supabase.com**

### STEP 2: Select Your Project  
Click on your CapitalNest project (kwsvyazdmkbqgtrgeskb.supabase.co)

### STEP 3: Open SQL Editor
- Click on **"SQL Editor"** in the left sidebar
- Click **"New Query"** button at the top

### STEP 4: Copy & Paste the Setup SQL
Open the file: **SETUP_DATABASE.sql** (in your project root)

Copy ALL the content and paste it into the SQL Editor

### STEP 5: Run the Query
Click the **"Run"** button (top right of the query editor)

### STEP 6: Verify Success
You should see a message like:
```
✅ DATABASE SETUP COMPLETE
```

If you see any errors, they'll appear in red. Most errors are "already exists" which is fine - it means the table is ready.

---

## 🧪 TESTING AFTER SETUP

### Test 1: User Registration
1. Go to: http://localhost:3000/register.html
2. Fill in the form:
   - Email: `testuser@example.com`
   - Phone: `9841234567`
   - Password: `Test@12345`
   - Captcha: Enter the number shown
3. Click "Registration"
4. You should see: "Registration successful"

### Test 2: Admin Dashboard
1. Go to: http://localhost:3000/admin/loginadmin.html
2. Login with admin credentials:
   - Email: `chiranboss@gmail.com`
   - Password: `Admin@12345`
3. You should see the admin dashboard with:
   - Users & Balances tab
   - Deposits & Proofs tab
   - Withdrawals tab
   - Investments tab
   - Transactions tab

---

## 📂 FILES PROVIDED

| File | Purpose |
|------|---------|
| `SETUP_DATABASE.sql` | Main setup script - run this in Supabase SQL Editor |
| `database.sql` | Complete schema with all tables and triggers |
| `supabase_init.sql` | Minimal setup (just profiles and admin_users) |

---

## 🚀 NEXT STEPS AFTER DATABASE IS READY

1. **Create test users** - Register through the form at /register.html
2. **Test deposits** - Add deposit records in admin panel
3. **Test investments** - Create investment accounts
4. **Telegram integration** - Check if bot notifications work

---

## ⚠️ TROUBLESHOOTING

### Error: "Could not find the table 'public.profiles' in the schema cache"
→ This means the SQL hasn't been run yet. Follow the setup steps above.

### Error: "duplicate key value violates unique constraint"
→ This is normal if running setup multiple times. You can ignore it.

### Error: "permission denied for schema public"
→ Make sure you're using the **Service Role Key** (SECRET), not the anon key.

### Registration still doesn't work
→ Check if there's a trigger issue by running: `SELECT * FROM information_schema.triggers WHERE trigger_schema = 'public';`

---

## 💾 DATABASE SCHEMA

The tables created are:
- **profiles** - User account data
- **admin_users** - Tracks who is an admin
- **deposits** - Deposit records
- **withdrawals** - Withdrawal records
- **investments** - Investment accounts
- **transactions** - Transaction history
- **wallet_transactions** - Detailed wallet ledger

Each table has Row Level Security (RLS) policies to ensure:
- Users can only see their own data
- Admins can see all data
- Service role can manage all data

---

## 📞 IF STUCK

1. Check the Supabase logs: Dashboard → Logs → SQL
2. Try running queries one table at a time (comment out parts)
3. Make sure you're in the SQL Editor (not the query builder)
4. Refresh the page after running SQL

---

**Status:** Ready to proceed once SQL is executed in Supabase ✅
