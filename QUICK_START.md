# ⚡ Quick Start Reference

## 🚀 Setup

```bash
# 1. Run the database migration in Supabase SQL Editor
# Copy/paste the complete file:
# supabase/migrations/20260834000000_manual_investment_verification_system.sql

# 2. Open the app locally
python -m http.server 8000

# 3. Log in and submit an investment verification request
# Visit: http://localhost:8000/user/investment.html
```

## 🎯 Key Points

| What | Where | How It Works |
|------|-------|-------------|
| **Investment Form** | `/user/checkout.html` | Uploads proof and creates an `investments` record with `pending` status |
| **Approval Flow** | `/admin/payment-approvals.html` | Admin reviews and updates `investments.status` |
| **Live Sync** | `/user/investment.html` | Realtime refreshes the user's investment list |
| **Admin Panel** | `/admin/payment-approvals.html` | See all approvals in real time |

## ✅ Test It

1. Go to: http://localhost:8000/user/investment.html
2. Select an investment plan and continue to checkout
3. Upload a payment screenshot and submit the request
4. Open the admin approval page
5. Approve or reject the request
6. Watch the investment status update instantly

## 🔧 Core Components

```javascript
// Investment verification flow
1. User submits -> Uploads proof and creates investments (pending)
2. Admin reviews -> Updates investments.status to "approved" or "rejected"
3. Frontend subscribes -> The dashboard refreshes the investment list
```

## 📊 Database Tables

```sql
-- Check these exist after migration:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_name IN ('investments', 'investment_transactions', 'investment_plans');

-- The result should contain all three tables.
```

## 🐛 If Something Breaks

```javascript
// 1. Check the investment record in Supabase
// Query: SELECT * FROM public.investments ORDER BY created_at DESC;

// 2. Check the browser console for the exact Supabase error.

// 3. If the table query above returns no rows, run the complete canonical
// migration in Supabase SQL Editor and refresh the browser page.
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

---

**Everything is set up and ready to go!** 🎉
