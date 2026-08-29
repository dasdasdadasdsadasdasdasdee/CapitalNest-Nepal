# 🚀 Complete Setup Guide: Telegram Payment Approvals & Real-Time Balance Sync

## 📋 Overview

This system enables:
- ✅ Users submit wallet deposits through the website
- ✅ Admins receive payment requests via Telegram bot
- ✅ Admins approve/reject via Telegram buttons
- ✅ User balance updates in **real-time** across dashboard, wallet, and all pages
- ✅ Supabase triggers automatically sync balances when approved

---

## 🔧 Step 1: Database Setup

### Run the Migration
1. Go to Supabase Dashboard → SQL Editor
2. Copy the contents of: `supabase/migrations/20260830_add_telegram_payment_approvals.sql`
3. Run the SQL script
4. This creates:
   - `payment_approvals` table
   - `user_balances` table  
   - `telegram_id` & `is_admin` fields on profiles
   - Automatic triggers for balance syncing

---

## 🤖 Step 2: Telegram Bot Setup

### Get Your Bot Token

1. **Message BotFather on Telegram**
   - Search for `@BotFather`
   - Send `/start`
   - Follow prompts to create a new bot
   - Save your token: `8872765794:AAFWA9zoUjU0dXPMm9jUc_UvQ8A996kKQBs`

⚠️ **SECURITY ALERT**: This token is now public! Regenerate it:
- Message BotFather → `/mybots` → Select your bot → API Token → `/regeneratetoken`
- Use the new token in your `.env` file

### Install Bot Dependencies

```bash
cd bot
npm install
```

### Configure Bot

1. Create `.env` file in `bot/` directory:
   ```env
   TELEGRAM_BOT_TOKEN=YOUR_NEW_BOT_TOKEN_HERE
   ```

2. Copy from `.env.example` if needed:
   ```bash
   cp .env.example .env
   ```

### Start the Bot

```bash
cd bot
npm start
```

You should see: `✅ Bot is listening for commands and payments...`

---

## 👤 Step 3: Create Admin User

### Option A: Via Supabase Dashboard

1. Go to Supabase → Authentication → Users
2. Create/find the admin user
3. Go to `profiles` table
4. Update the admin's row:
   - `is_admin` = `true`
   - `telegram_id` = leave blank for now

### Option B: SQL Query

```sql
UPDATE public.profiles
SET is_admin = true
WHERE email = 'admin@example.com';
```

### Get Your Telegram ID

1. Message the bot: `/start`
2. Check terminal logs for your Telegram ID
3. Update the profile:

```sql
UPDATE public.profiles
SET telegram_id = '123456789'
WHERE email = 'admin@example.com';
```

---

## 💻 Step 4: Frontend Setup

### Already Configured:

✅ **wallet.html**
- Imports real-time sync module
- Listens for balance updates
- Auto-refreshes on payment approval
- Submits payment requests to `payment_approvals` table

✅ **user/index.html (Dashboard)**
- Real-time balance display
- Auto-refreshes on approvals
- Shows live updates

✅ **admin/payment-approvals.html** (NEW)
- View all payment approval requests
- Approve/reject directly from web
- Real-time sync with Telegram bot actions

### No Additional Code Needed!

The subscription system is already integrated. Just make sure:
1. Supabase config is loaded: ✅ `supabase-config.js`
2. Realtime sync script is loaded: ✅ `assets/js/realtime-balance-sync.js`

---

## 🔄 How It All Works Together

```
┌─────────────────┐
│  User Deposits  │  wallet.html form → Creates payment_approval
└────────┬────────┘
         │
         ↓
┌─────────────────────────────┐
│ payment_approvals table     │  Supabase detects INSERT
│ status = "pending"          │  Triggers bot notification
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│  Telegram Bot Notifies      │  Sends message to admin
│  Admin with Buttons         │  "Approve" / "Reject"
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│  Admin Clicks in Telegram   │  Updates payment_approvals
│  Payment status → approved  │  status = "approved"
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│  Supabase Trigger Fires     │  Detects status change
│  Updates user_balances      │  Adds amount to available_balance
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│  Real-Time Subscription     │  All subscribed pages notified
│  Across Frontend            │  Dashboard, wallet, admin panel
└────────┬────────────────────┘
         │
         ↓
┌─────────────────────────────┐
│  Balance Updates Live       │  User sees ✅ balance updated
│  Everywhere at Once         │  No page refresh needed!
└─────────────────────────────┘
```

---

## 🧪 Testing the System

### Test Flow:

1. **Open wallet page:** `http://localhost:8000/user/wallet.html`
2. **Submit deposit request:** Click "Fund Wallet" button
   - Select payment method
   - Enter amount (e.g., 1000)
   - Click "Confirm Deposit"
3. **Check Telegram:** Bot sends approval request to admin
4. **Approve in Telegram:** Click "✅ Approve" button
5. **Watch dashboard:** Balance updates **instantly** in real-time
6. **Check admin panel:** `http://localhost:8000/admin/payment-approvals.html`
   - See approval status changed
   - Real-time updates reflected

---

## 🔍 Monitoring & Debugging

### Bot Logs

While bot is running:
```
✅ Real-time sync initialized for user: <user-id>
💰 Balance updated: {available_balance: 1000, total_balance: 1000}
✅ Payment approved: <approval-id>
```

### Browser Console

Open DevTools (F12) on dashboard/wallet:
```javascript
// You'll see:
💰 Balance updated in real-time: {available_balance: 1000}
✅ Payment approved: {id: "...", amount: 1000}
```

### Database Check

Check if balance was created/updated:

```sql
SELECT * FROM public.user_balances 
WHERE user_id = 'USER_ID';
```

Expected output:
```
user_id        | available_balance | total_balance | last_updated
<user-id>      | 1000              | 1000          | 2026-08-30...
```

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| **Bot not responding** | Check `.env` has correct token, restart bot (`npm start`) |
| **Telegram: "Couldn't connect"** | Generate new token via BotFather, update `.env` |
| **Balance not updating** | Check Supabase triggers are active, verify subscription in browser console |
| **Admin not receiving messages** | Ensure `is_admin=true` and `telegram_id` is set in profiles table |
| **"User not linked to profile"** | Run `/start` in Telegram to get your ID, update profile table |
| **Real-time sync not working** | Clear browser cache, check browser console for errors |

---

## 📱 Admin Telegram Commands

Send these to the bot:

| Command | Result |
|---------|--------|
| `/start` | Show main menu with options |
| `View Pending` | See all pending approvals with buttons |
| `My Profile` | See your admin profile details |
| **Approve** (button) | Approve payment → updates balance |
| **Reject** (button) | Reject payment → notifies user |

---

## 🔐 Security Notes

### Protect Your Tokens
- ✅ Never commit `.env` to git
- ✅ Add `bot/.env` to `.gitignore`
- ✅ Keep tokens in environment variables only
- ✅ Regenerate compromised tokens immediately

### Database Security
- ✅ Row Level Security (RLS) enabled on all tables
- ✅ Users can only see their own records
- ✅ Admins have special policies for approvals
- ✅ Triggers prevent manual balance manipulation

---

## 📊 Key Files Created/Modified

| File | Purpose |
|------|---------|
| `supabase/migrations/20260830_add_telegram_payment_approvals.sql` | Database schema |
| `bot/bot-server.js` | Telegram bot server (Node.js) |
| `bot/package.json` | Bot dependencies |
| `bot/README.md` | Bot setup guide |
| `assets/js/realtime-balance-sync.js` | Real-time subscription module |
| `user/wallet.html` | Updated with real-time sync |
| `user/index.html` | Dashboard with real-time sync |
| `admin/payment-approvals.html` | Admin approval interface |

---

## 🎉 You're All Set!

Your system is now:
- ✅ Accepting deposits through web forms
- ✅ Notifying admins via Telegram instantly
- ✅ Updating balances in real-time across all pages
- ✅ Syncing payment approvals automatically

Start the bot, create test deposits, and watch the magic happen! 🚀
