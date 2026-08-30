const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  MIN_WITHDRAWAL_AMOUNT,
  calculateWalletBalance,
  isValidWithdrawalAmount,
  canTransitionWithdrawalStatus,
  calculateInvestmentReturn,
  calculateReferralRewards,
  validateWalletName,
  validateWalletNumber,
} = require('./financial-logic');

const router = express.Router();
const supabaseUrl = process.env.SUPABASE_URL || 'https://mohigobcssqzywmhndml.supabase.co';
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MRVoyKc48ERptjd1G9l08g_3YTAleje';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase service-role key is missing in Railway. User-authenticated requests will continue using the JWT from the browser session.');
}

const supabase = createClient(supabaseUrl, supabaseServiceRole || supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function getRequestSupabaseClient(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  });
}

const uploadDir = path.join(__dirname, '..', 'private', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname || '.png')}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('INVALID_QR_IMAGE'));
    }
    cb(null, true);
  },
});

function getUserIdFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (bearer) return bearer;
  return req.user?.id || req.query?.userId || null;
}

function respondError(res, code, message, status = 400) {
  return res.status(status).json({ error: code, message });
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    console.warn('Deposit auth rejected: request missing bearer token.', {
      path: req.originalUrl,
      headers: Object.keys(req.headers)
    });
    return respondError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.warn('Deposit auth rejected: invalid bearer token.', {
        path: req.originalUrl,
        error: error?.message || 'No user resolved from token'
      });
      return respondError(res, 'UNAUTHORIZED', 'Invalid user session.', 401);
    }

    req.user = user;
    req.supabase = getRequestSupabaseClient(req);
    return next();
  } catch (error) {
    console.error('requireAuth error:', error);
    return respondError(res, 'UNAUTHORIZED', 'Authentication failed.', 401);
  }
}

async function getWalletSummary(userId) {
  const { data: transactions = [], error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const summary = calculateWalletBalance(transactions);
  const { data: investments = [] } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId);

  const activeInvested = investments
    .filter((item) => String(item.status || '').toUpperCase() === 'ACTIVE')
    .reduce((sum, item) => sum + Number(item.invested_amount || item.amount || 0), 0);

  const maturedValue = investments
    .filter((item) => {
      const status = String(item.status || '').toUpperCase();
      if (status === 'MATURING' || status === 'MATURED') return true;
      if (!item.created_at || !item.duration_days) return false;
      const createdAt = new Date(item.created_at);
      const durationMs = Number(item.duration_days || 0) * 24 * 60 * 60 * 1000;
      if (Number.isNaN(createdAt.getTime())) return false;
      return Date.now() - createdAt.getTime() >= durationMs;
    })
    .reduce((sum, item) => sum + Number(item.invested_amount || item.amount || 0), 0);

  const maturedReturnTransactions = transactions
    .filter((txn) => ['INVESTMENT_RETURN', 'MATURITY_PAYOUT', 'MATURED_INVESTMENT'].includes(String(txn.type || '').toUpperCase()))
    .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

  const availableBalance = Number((summary.available + Math.max(maturedValue - maturedReturnTransactions, 0)).toFixed(2));

  return {
    ...summary,
    available: availableBalance,
    invested: Number((summary.invested + activeInvested).toFixed(2)),
  };
}

router.get('/wallet', requireAuth, async (req, res) => {
  try {
    const summary = await getWalletSummary(req.user.id);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ error: 'WALLET_ERROR', message: 'Unable to load wallet summary.' });
  }
});

router.get('/wallet/transactions', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'TRANSACTIONS_ERROR', message: 'Unable to load wallet history.' });
  }
});

router.get('/deposits', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'DEPOSITS_ERROR', message: 'Unable to load deposits.' });
  }
});

router.post('/deposits', requireAuth, upload.single('proofFile'), async (req, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    const method = String(req.body.paymentMethod || req.body.method || 'ESEWA').toUpperCase();
    const referenceId = String(req.body.referenceId || '').trim();
    const userId = req.user.id;
    const requestSupabase = req.supabase || getRequestSupabaseClient(req);

    console.log('Deposit submit request received:', {
      userId,
      amount,
      method,
      referenceId,
      paymentProofPath: req.body.paymentProofPath || null,
      filePresent: Boolean(req.file),
      headers: {
        authHeaderPresent: Boolean(req.headers.authorization),
        contentType: req.headers['content-type']
      }
    });

    if (!amount || amount <= 0) {
      return respondError(res, 'INVALID_AMOUNT', 'A valid deposit amount is required.', 400);
    }

    if (!['ESEWA', 'KHALTI', 'FONEPAY'].includes(method)) {
      return respondError(res, 'INVALID_PAYMENT_METHOD', 'Unsupported payment method.', 400);
    }

    let proofPath = req.body.paymentProofPath || null;
    if (req.file) {
      proofPath = `payment-proofs/${userId}/${req.file.filename}`;
    }

    const { data: deposit, error: insertError } = await requestSupabase
      .from('deposits')
      .insert({
        user_id: userId,
        amount,
        payment_method: method,
        reference_id: referenceId || null,
        payment_proof_path: proofPath,
        status: 'PENDING',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Deposit insert DB error:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
        userId,
        amount,
        method,
        referenceId,
        proofPath
      });
      throw insertError;
    }

    console.log('Deposit inserted successfully:', deposit);

    res.status(201).json({
      success: true,
      data: deposit,
      message: 'Deposit submitted successfully and is pending admin approval.',
    });
  } catch (error) {
    console.error('Deposit submission failed:', {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      body: req.body,
      userId: req.user?.id || null,
      filePresent: Boolean(req.file)
    });
    res.status(500).json({ error: 'DEPOSIT_SUBMIT_ERROR', message: 'Unable to submit deposit.' });
  }
});

router.get('/admin/deposits', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const { data, error } = await supabase
      .from('deposits')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'ADMIN_DEPOSITS_ERROR', message: 'Unable to load deposit approvals.' });
  }
});

router.post('/admin/deposits/:id/approve', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const { data, error } = await supabase.rpc('approve_deposit', {
      p_deposit_id: req.params.id,
      p_admin_id: req.user.id,
    });

    if (error) throw error;
    res.json({ success: true, data, message: 'Deposit approved and wallet credited.' });
  } catch (error) {
    res.status(500).json({ error: 'APPROVE_DEPOSIT_ERROR', message: 'Unable to approve deposit.' });
  }
});

router.post('/admin/deposits/:id/reject', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const rejectionReason = String(req.body.reason || 'Payment proof could not be verified.').trim();
    const { data, error } = await supabase.rpc('reject_deposit', {
      p_deposit_id: req.params.id,
      p_admin_id: req.user.id,
      p_rejection_reason: rejectionReason,
    });

    if (error) throw error;
    res.json({ success: true, data, message: 'Deposit rejected.' });
  } catch (error) {
    res.status(500).json({ error: 'REJECT_DEPOSIT_ERROR', message: 'Unable to reject deposit.' });
  }
});

router.post('/withdrawals', requireAuth, upload.single('qrImage'), async (req, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    const method = String(req.body.method || '').toUpperCase();
    const accountDetails = String(req.body.accountDetails || '').trim();
    const walletName = String(req.body.walletName || '').trim();
    const walletNumber = String(req.body.walletNumber || '').trim();
    const userId = req.user.id;

    if (!['ESEWA', 'KHALTI'].includes(method)) {
      return respondError(res, 'INVALID_WITHDRAWAL_METHOD', 'Unsupported withdrawal method.', 400);
    }

    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      return respondError(res, 'MIN_WITHDRAWAL_NOT_MET', `Minimum withdrawal amount is NPR ${MIN_WITHDRAWAL_AMOUNT.toLocaleString('en-US')}.`, 400);
    }

    // Validate wallet name
    if (!walletName || walletName.length < 2) {
      return respondError(res, 'INVALID_WALLET_NAME', 'Wallet holder name must be at least 2 characters.', 400);
    }
    if (walletName.length > 50) {
      return respondError(res, 'INVALID_WALLET_NAME', 'Wallet holder name cannot exceed 50 characters.', 400);
    }

    // Validate wallet number based on method
    if (!walletNumber) {
      return respondError(res, 'INVALID_WALLET_NUMBER', 'Wallet number/account is required.', 400);
    }

    if (method === 'ESEWA') {
      if (!/^\d{10}$/.test(walletNumber)) {
        return respondError(res, 'INVALID_ESEWA_NUMBER', 'eSewa account must be exactly 10 digits.', 400);
      }
    } else if (method === 'KHALTI') {
      const isValidKhalti = /^\d{10}$/.test(walletNumber) || /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(walletNumber);
      if (!isValidKhalti) {
        return respondError(res, 'INVALID_KHALTI_NUMBER', 'Khalti account must be 10 digits or valid email.', 400);
      }
    }

    const summary = await getWalletSummary(userId);
    if (amount > summary.available) {
      return respondError(res, 'INSUFFICIENT_BALANCE', 'Your balance is insufficient.', 400);
    }

    const existingPending = await supabase
      .from('withdrawals')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'])
      .limit(1);

    if (existingPending.error) throw existingPending.error;
    if (existingPending.data && existingPending.data.length > 0) {
      return respondError(res, 'WITHDRAWAL_ALREADY_PENDING', 'You already have a pending withdrawal.', 409);
    }

    if (!accountDetails) {
      return respondError(res, 'INVALID_ACCOUNT', 'Account details are required for this method.', 400);
    }

    const { data: withdrawal, error: insertError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: userId,
        amount,
        method,
        account_details: accountDetails || null,
        wallet_name: walletName,
        wallet_number: walletNumber,
        verification_status: 'PENDING',
        status: 'PENDING',
        request_reference: `WD-${Date.now()}`,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const { error: ledgerError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        type: 'WITHDRAWAL_REQUEST',
        amount,
        status: 'PENDING',
        payment_method: method,
        note: `Withdrawal request ${withdrawal.id}`,
        created_at: new Date().toISOString(),
      });

    if (ledgerError) throw ledgerError;

    res.status(201).json({ success: true, data: withdrawal, message: 'Withdrawal request created.' });
  } catch (error) {
    if (error.message === 'INVALID_QR_IMAGE') {
      return respondError(res, 'INVALID_QR_IMAGE', 'Only JPG, JPEG, PNG, or WEBP images under 5MB are allowed.', 400);
    }
    res.status(500).json({ error: 'WITHDRAWAL_ERROR', message: 'Unable to submit withdrawal request.' });
  }
});

router.get('/withdrawals', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'WITHDRAWALS_ERROR', message: 'Unable to load withdrawals.' });
  }
});

router.post('/add-wallet-method', requireAuth, async (req, res) => {
  try {
    const method = String(req.body.method || '').toUpperCase();
    const walletName = String(req.body.walletName || '').trim();
    const walletNumber = String(req.body.walletNumber || '').trim();
    const userId = req.user.id;

    // Validate method
    if (!['ESEWA', 'KHALTI'].includes(method)) {
      return respondError(res, 'INVALID_METHOD', 'Unsupported payment method.', 400);
    }

    // Validate wallet name
    if (!walletName || walletName.length < 2) {
      return respondError(res, 'INVALID_WALLET_NAME', 'Wallet holder name must be at least 2 characters.', 400);
    }
    if (walletName.length > 50) {
      return respondError(res, 'INVALID_WALLET_NAME', 'Wallet holder name cannot exceed 50 characters.', 400);
    }

    // Validate wallet number based on method
    if (!walletNumber) {
      return respondError(res, 'INVALID_WALLET_NUMBER', 'Wallet number/account is required.', 400);
    }

    if (method === 'ESEWA') {
      if (!/^\d{10}$/.test(walletNumber)) {
        return respondError(res, 'INVALID_ESEWA_NUMBER', 'eSewa account must be exactly 10 digits.', 400);
      }
    } else if (method === 'KHALTI') {
      const isValidPhone = /^\d{10}$/.test(walletNumber);
      const isValidEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(walletNumber);
      if (!isValidPhone && !isValidEmail) {
        return respondError(res, 'INVALID_KHALTI_NUMBER', 'Khalti account must be 10 digits or valid email.', 400);
      }
    }

    // Store as a transaction note for now (can create saved_wallet_methods table later)
    const { data: wallet, error: insertError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        type: 'WALLET_METHOD_ADDED',
        amount: 0,
        status: 'COMPLETED',
        payment_method: method,
        note: `Added wallet: ${walletName} (${walletNumber})`,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({
      success: true,
      data: {
        method,
        walletName,
        walletNumber: walletNumber.slice(-4).padStart(walletNumber.length, '*'),
      },
      message: 'Wallet method added successfully.',
    });
  } catch (error) {
    res.status(500).json({ error: 'ADD_WALLET_ERROR', message: 'Unable to add wallet method.' });
  }
});

router.get('/referrals', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'REFERRAL_ERROR', message: 'Unable to load referrals.' });
  }
});

router.get('/referrals/stats', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('user_id', req.user.id);

    if (error) throw error;

    const stats = {
      totalReferrals: data.length,
      qualified: data.filter((r) => r.status === 'QUALIFIED').length,
      pending: data.filter((r) => r.status === 'PENDING').length,
      totalEarnings: data.reduce((sum, item) => sum + Number(item.reward_amount || 0), 0),
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: 'REFERRAL_STATS_ERROR', message: 'Unable to load referral stats.' });
  }
});

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'NOTIFICATIONS_ERROR', message: 'Unable to load notifications.' });
  }
});

router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'NOTIFICATION_ERROR', message: 'Unable to update notification.' });
  }
});

router.get('/admin/withdrawals', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: 'ADMIN_ERROR', message: 'Unable to load admin withdrawals.' });
  }
});

router.post('/admin/withdrawals/:id/approve', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const { data: withdrawal, error: findError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (findError || !withdrawal) return respondError(res, 'NOT_FOUND', 'Withdrawal not found.', 404);

    if (!canTransitionWithdrawalStatus(withdrawal.status, 'APPROVED')) {
      return respondError(res, 'INVALID_STATUS_TRANSITION', 'This withdrawal cannot be approved.', 400);
    }

    const { error } = await supabase
      .from('withdrawals')
      .update({ status: 'APPROVED', approved_by: req.user.id, reviewed_at: new Date().toISOString(), admin_notes: req.body.reason || '' })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Withdrawal approved.' });
  } catch (error) {
    res.status(500).json({ error: 'APPROVE_ERROR', message: 'Unable to approve withdrawal.' });
  }
});

router.post('/admin/withdrawals/:id/reject', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return respondError(res, 'REJECTION_REASON_REQUIRED', 'A rejection reason is required.', 400);
    }

    const { error } = await supabase
      .from('withdrawals')
      .update({ status: 'REJECTED', rejected_by: req.user.id, rejection_reason: reason, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Withdrawal rejected.' });
  } catch (error) {
    res.status(500).json({ error: 'REJECT_ERROR', message: 'Unable to reject withdrawal.' });
  }
});

router.post('/admin/withdrawals/:id/process', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const { error } = await supabase
      .from('withdrawals')
      .update({ status: 'PROCESSING', processed_by: req.user.id, processed_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Withdrawal marked processing.' });
  } catch (error) {
    res.status(500).json({ error: 'PROCESS_ERROR', message: 'Unable to update withdrawal status.' });
  }
});

router.post('/admin/withdrawals/:id/paid', requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', req.user.id).single();
    if (!profile?.is_admin) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const referenceId = String(req.body.referenceId || '').trim();
    if (!referenceId) {
      return respondError(res, 'REFERENCE_REQUIRED', 'Transaction/reference ID is required.', 400);
    }

    const { error } = await supabase
      .from('withdrawals')
      .update({ status: 'PAID', paid_by: req.user.id, transaction_reference: referenceId, paid_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'Withdrawal marked paid.' });
  } catch (error) {
    res.status(500).json({ error: 'PAID_ERROR', message: 'Unable to mark withdrawal paid.' });
  }
});

module.exports = router;
