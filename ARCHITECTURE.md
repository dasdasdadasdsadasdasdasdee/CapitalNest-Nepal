# System Architecture Diagram

## Real-Time Payment Approval Flow

```
╔════════════════════════════════════════════════════════════════════════════╗
║                        PAYMENT APPROVAL SYSTEM                             ║
╚════════════════════════════════════════════════════════════════════════════╝

USER DEPOSITS VIA WEBSITE
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  1. User opens: http://localhost:8000/user/wallet.html                 │
│  2. Clicks "Fund Wallet" button                                        │
│  3. Fills form: Payment Method, Amount                                 │
│  4. Clicks "Confirm Deposit"                                          │
│                                                                         │
│  ↓ Event: Submit deposit form                                          │
│                                                                         │
│  JavaScript handler:                                                   │
│  • Creates transaction (type: 'deposit', status: 'pending')           │
│  • Creates payment_approval (status: 'pending')                       │
│  • Alert: "Payment request submitted"                                 │
│                                                                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUPABASE DATABASE                                    │
│                                                                         │
│  payment_approvals table receives INSERT:                             │
│  {                                                                     │
│    id: uuid,                                                          │
│    user_id: 'user-123',                                              │
│    amount: 1000,                                                      │
│    payment_method: 'Bank Transfer',                                  │
│    status: 'pending',                                                │
│    created_at: now()                                                 │
│  }                                                                    │
│                                                                         │
│  ↓ Trigger: new payment_approval detected                              │
│                                                                         │
│  Supabase sends real-time notification via WebSocket                  │
│                                                                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                   ADMIN REVIEW WORKFLOW                                  │
│                                                                         │
│  Admin checks payment requests in the dashboard                        │
│  Reviews amount, proof, and customer information                       │
│  Approves or rejects the request                                       │
│                                                                         │
│  ↓ Admin action in dashboard                                           │
│                                                                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                  ADMIN APPROVAL UPDATE                                   │
│                                                                         │
│  Admin clicks approve or reject in the admin panel                     │
│  • Updates Supabase: payment_approvals.status                          │
│  • Updates Supabase: payment_approvals.approved_at = now()             │
│  • Updates Supabase: transactions.status = 'completed'                 │
│                                                                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                  SUPABASE DATABASE - TRIGGER                            │
│                                                                         │
│  Trigger fires: sync_balance_on_approval                              │
│                                                                         │
│  BEFORE UPDATE on payment_approvals:                                  │
│  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN        │
│    INSERT/UPDATE user_balances:                                       │
│    {                                                                   │
│      user_id: approval.user_id,                                      │
│      available_balance += approval.amount,  (1000)                   │
│      total_balance += approval.amount,      (1000)                   │
│      last_updated: now()                                              │
│    }                                                                   │
│  END IF                                                                │
│                                                                         │
│  ↓ Real-time event broadcast                                           │
│                                                                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│           FRONTEND REAL-TIME SUBSCRIPTION (Browser)                    │
│                                                                         │
│  Files listening:                                                      │
│  • wallet.html                                                        │
│  • dashboard (index.html)                                            │
│  • admin panel (payment-approvals.html)                              │
│                                                                         │
│  Module: realtime-balance-sync.js                                    │
│  • Subscribes to user_balances table changes                         │
│  • Subscribes to payment_approvals updates                           │
│  • Subscribes to transaction updates                                 │
│                                                                         │
│  Event received: balance-updated                                     │
│  • Triggers callback: balanceSync.on('balance-updated', callback)    │
│  • Updates DOM: walletBalanceValue.textContent = "NPR 1000"         │
│  • Reloads transaction table                                         │
│  • Updates all displays showing balance                              │
│                                                                         │
│  ↓ Visual update on screen                                             │
│                                                                         │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                     USER SEES INSTANT UPDATE                            │
│                                                                         │
│  Wallet Page:                Dashboard:               Admin Panel:     │
│  ┌───────────────────┐  ┌──────────────────────┐  ┌──────────────────┐│
│  │ Balance: NPR 1000 │  │ Welcome, User        │  │ Pending: 0       ││
│  │ [Updated ✅]     │  │ Wallet: NPR 1000 [✅]│  │ Approved: 1 [✅]  ││
│  │ Transaction List: │  │ Invested: 0          │  │ Status: APPROVED  ││
│  │ • Deposit 1000    │  │ Withdrawn: 0         │  │ [Real-time sync]  ││
│  │   Bank Transfer   │  │ [Live Update!]       │  │ [All pages sync]   ││
│  │   [COMPLETED]     │  └──────────────────────┘  └──────────────────┘│
│  └───────────────────┘                                                 │
│                                                                         │
│  All pages update SIMULTANEOUSLY with NO page refresh! ⚡              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

TIME FROM PAYMENT TO UPDATE: < 2 SECONDS ⚡

```

## Data Flow

```
Wallet Form
    ↓
    ├─→ Create Transaction
    ├─→ Create PaymentApproval
    ↓
Database
    ↓
    ├─→ Supabase Subscription
    ├─→ Real-time Event
    ↓
Admin Dashboard
    ↓
    ├─→ Review request
    ├─→ Approve or reject
    ↓
Database Trigger
    ↓
    ├─→ Update user_balances
    ├─→ Real-time Event
    ↓
Frontend Subscriptions
    ↓
    ├─→ Balance Updated Event
    ├─→ Payment Approved Event
    ├─→ Transaction Completed Event
    ↓
UI Updates (Wallet, Dashboard, Admin)
    ↓
User Sees NPR 1000 Balance ✅
```

## Technology Stack

```
Frontend                Backend              Database
─────────────────────────────────────────────────────────
wallet.html        ←→  Supabase API  ←→  PostgreSQL
dashboard.html           (REST)            Tables:
admin panel              (WebSocket)        • profiles
                                            • transactions
+ realtime-sync          Admin review       • payment_approvals
  module                 workflow           • user_balances
  (Browser)                                  Triggers:
  subscription                              • sync_balance
  listeners                                 • update_at_ts
  
  Events:
  • balance-updated
  • transaction-completed
  • payment-approved
```

## Approval States

```
Pending ─┬─→ Approved ─→ Balance Updated ─→ User Notified ✅
         │
         └─→ Rejected ─→ Transaction Failed ─→ User Notified ❌
```

## Real-time Sync Events

```javascript
// Events emitted by balanceSync module:

balanceSync.on('balance-updated', (newBalance) => {
    // Fires when user_balances table is updated
    // Updates: walletBalanceValue element
});

balanceSync.on('transaction-updated', (transaction) => {
    // Fires when transactions are modified
    // Updates: Transaction table on wallet
});

balanceSync.on('transaction-completed', (transaction) => {
    // Fires when transaction.status = 'completed'
    // Reloads entire wallet page data
});

balanceSync.on('approval-updated', (approval) => {
    // Fires when payment_approval is modified
    // Used for admin panel updates
});

balanceSync.on('payment-approved', (approval) => {
    // Fires when approval.status = 'approved'
    // Triggers full page reload in dashboard
});

balanceSync.on('payment-request-created', (request) => {
    // Fires when user creates deposit request
    // Triggers bot notification
});
```

---

**This is a fully automated, real-time system!** 🚀
