# ⚡ Quick Start Reference

## 🚀 5-Minute Setup

```bash
# 1. Run the database migration (in Supabase SQL Editor)
# Copy/paste: supabase/migrations/20260830_add_telegram_payment_approvals.sql

# 2. Install bot dependencies
cd bot
npm install

# 3. Create .env file
echo "TELEGRAM_BOT_TOKEN=YOUR_TOKEN_HERE" > .env

# 4. Start the bot
npm start

# 5. Mark a user as admin
# In Supabase: UPDATE profiles SET is_admin=true WHERE id='user-id'

# 6. Regenerate bot token & update .env
# Message @BotFather: /mybots → Select bot → API Token → /regeneratetoken
```

## 🎯 Key Points

| What | Where | How It Works |
|------|-------|-------------|
| **Deposit Form** | `/user/wallet.html` | Creates `payment_approval` record |
| **Bot Approval** | Telegram | Updates `payment_approvals.status` → `approved` |
| **Auto Balance** | Supabase Trigger | Updates `user_balances` table |
| **Live Sync** | `realtime-balance-sync.js` | Frontend listens & updates all pages |
| **Admin Panel** | `/admin/payment-approvals.html` | See all approvals in real-time |

## 📱 Test It

1. Go to: http://localhost:8000/user/wallet.html
2. Fill "Fund Wallet" form
3. Check Telegram for bot message
4. Click "Approve" in Telegram
5. Watch dashboard balance update **instantly**! ✨

## 🔧 Core Components

```javascript
// Real-time subscription (runs on wallet.html & dashboard)
import RealtimeBalanceSync from '../assets/js/realtime-balance-sync.js';
const balanceSync = new RealtimeBalanceSync(url, key);
balanceSync.on('balance-updated', (newBalance) => {
    // Update UI automatically
});

// Payment approval flow
1. User submits → Creates payment_approval (pending)
2. Bot notified → Sends Telegram button
3. Admin approves → Updates status to "approved"
4. Trigger fires → Updates user_balances
5. Frontend subscribes → UI updates instantly
```

## ⚠️ Security Checklist

- [ ] Generated new Telegram bot token (the old one is public)
- [ ] Bot token stored in `.env` (not in code)
- [ ] `.env` added to `.gitignore`
- [ ] Admin user marked with `is_admin = true`
- [ ] Admin's `telegram_id` set in database
- [ ] Database triggers verified in Supabase

## 📊 Database Tables

```sql
-- Check these exist after migration:
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('payment_approvals', 'user_balances');

-- Should return 2 rows
```

## 🐛 If Something Breaks

```javascript
// 1. Check bot is running
// Terminal should show: ✅ Bot is listening for commands

// 2. Check real-time subscription
// Browser console should show: ✅ Real-time sync initialized for user: ...

// 3. Check database trigger
// Query: SELECT * FROM user_balances WHERE user_id = 'your-id'

// 4. Check Telegram connection
// Run: npm start (in bot directory)
// Message /start to your bot
// Should see terminal log with your Telegram ID
```

## 🎯 To Add New Payment Methods

Edit `/user/wallet.html`:

```html
<!-- Find this section: -->
<select class="form-control" id="paymenttype" required="">
    <optgroup label="Supported Payment Types">
        <option value="Bank Transfer" selected="">Bank Transfer</option>
        <option value="eSewa">eSewa</option>
        <option value="IME Pay">IME Pay</option>
        <option value="Khalti">Khalti</option>
        <option value="YOUR_NEW_METHOD">Your New Method</option>
    </optgroup>
</select>
```

## 📞 Support Commands

```bash
# Restart bot
npm start

# Check logs
npm start 2>&1 | grep -E "✅|❌|💰"

# Regenerate Telegram token
# Message @BotFather /mybots → Select bot → /regeneratetoken

# Force database refresh
# Go to Supabase Dashboard → SQL Editor
# Run: SELECT * FROM payment_approvals LIMIT 5;
```

---

**Everything is set up and ready to go!** 🎉
