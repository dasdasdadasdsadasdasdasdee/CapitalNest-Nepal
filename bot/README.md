# Telegram Bot Setup Guide

## ⚙️ Environment Variables

Create a `.env` file in the `bot/` directory with:

```env
# Telegram Bot Token (from BotFather)
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE

# Supabase Connection (already configured in bot-server.js)
SUPABASE_URL=https://mohigobcssqzywmhndml.supabase.co
SUPABASE_KEY=sb_publishable_MRVoyKc48ERptjd1G9l08g_3YTAleje
```

## 🚀 Installation & Running

1. **Install Dependencies**
   ```bash
   cd bot
   npm install
   ```

2. **Start the Bot**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

3. **Bot will be running** and listening for:
   - Payment approval requests
   - Admin commands
   - Real-time updates from Supabase

## 📱 Bot Commands

### Admin Commands
- `/start` - Get started and see options
- **View Pending** - Button to see all pending approvals
- **My Profile** - View your admin profile

### Payment Approval Flow

1. **User submits deposit** → wallet form
2. **Payment approval created** → Database triggers webhook
3. **Telegram bot notified** → Sends approval button to admin
4. **Admin clicks button** → Approves/Rejects via Telegram
5. **Supabase trigger fires** → Updates user balance
6. **Real-time sync** → Dashboard & wallet refresh automatically
7. **User notified** → Telegram message confirmation

## 🔧 Configuration

### Adding Admins
To make a user an admin who can approve payments:

```sql
-- Run in Supabase SQL Editor
UPDATE public.profiles
SET is_admin = true, telegram_id = 'YOUR_TELEGRAM_ID'
WHERE id = 'USER_ID';
```

To find your Telegram ID, send `/start` to the bot and check the logs.

### Payment Methods Supported
- Bank Transfer
- eSewa
- IME Pay
- Khalti

(Add more in wallet.html paymenttype select)

## 🗄️ Database Tables

### payment_approvals
- Tracks all payment approval requests
- Auto-updates user_balances on approval
- Linked to transactions

### user_balances
- Real-time balance tracking
- Updated automatically via Supabase triggers
- Synced to all frontend pages via subscriptions

## 🔔 Real-Time Sync Architecture

```
User Deposits → Creates payment_approval → Telegram Bot Notifies Admin
                                                        ↓
Admin Approves via Telegram Buttons → Supabase Updates payment_approvals.status
                                                        ↓
Supabase Trigger Fires → Updates user_balances table
                                                        ↓
Frontend Listens to Real-Time Subscription → Displays new balance everywhere
```

## 🛡️ Security Notes

⚠️ **Important:** The Telegram bot token you provided is now public. Please:

1. **Regenerate the Telegram bot token immediately**
   - Message BotFather on Telegram
   - Use /mybots → Select your bot → API Token → /regeneratetoken

2. **Use environment variables properly**
   - Never commit `.env` to git
   - Use `.env.example` for template
   - Keep real tokens in local `.env` only

## 🐛 Troubleshooting

### Bot not receiving updates
- Check `.env` file has correct TELEGRAM_BOT_TOKEN
- Verify bot is running: `npm start`
- Check Supabase connection in bot-server.js

### Balance not updating
- Check payment_approvals table for the record
- Verify Supabase triggers are active
- Check browser console for real-time subscription errors

### Admin not receiving Telegram messages
- Ensure profile has `is_admin = true` and `telegram_id` set
- Send `/start` to bot to register your Telegram ID
- Check that user has sent at least one message to bot (Telegram requirement)

## 📊 Monitoring

Bot logs show:
- ✅ Payment approvals processed
- ❌ Rejections processed
- 🔔 Telegram messages sent
- 💰 Balance updates completed

Watch logs in terminal while bot is running.
