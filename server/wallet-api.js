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
const projectSupabaseUrl = 'https://mohigobcssqzywmhndml.supabase.co';
const configuredSupabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const configuredSupabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_MRVoyKc48ERptjd1G9l08g_3YTAleje';
const supabaseUrl = configuredSupabaseUrl || projectSupabaseUrl;

// Use service role key if available, regardless of URL mismatch
// This allows using the key even if .env has outdated URL
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

const supabaseAnonKey = configuredSupabaseAnonKey;

if (configuredSupabaseUrl && configuredSupabaseUrl !== projectSupabaseUrl) {
  console.warn(`Configured SUPABASE_URL (${configuredSupabaseUrl}) differs from project URL (${projectSupabaseUrl}). Using project URL.`);
}

if (!supabaseServiceRole) {
  console.warn('⚠️ Supabase service-role key is unavailable. Deposits may fail due to RLS restrictions. Set SUPABASE_SERVICE_ROLE_KEY in environment.');
} else {
  console.log('✅ Supabase service-role key loaded successfully.');
}

const supabase = createClient(supabaseUrl, supabaseServiceRole || supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Dedicated storage client for uploads (uses service role to bypass RLS)
const storageClient = supabaseServiceRole
  ? createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : supabase;

function getRequestSupabaseClient(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  });
}

function getDepositWriteClient(req) {
  // CRITICAL: Use authenticated user's token for deposits INSERT
  // because RLS policy requires auth.uid() = user_id
  // Service role would have auth.uid() = NULL, causing RLS check to fail
  return req.supabase || getRequestSupabaseClient(req);
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

async function ensurePaymentQrBucket() {
  if (!storageClient?.storage) return;

  try {
    const { data: existingBucket, error: getError } = await storageClient.storage.getBucket('payment-qr');
    if (!getError && existingBucket) return;

    const { error: createError } = await storageClient.storage.createBucket('payment-qr', {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      fileSizeLimit: '5MB',
    });

    if (createError && !String(createError.message || '').toLowerCase().includes('already exists')) {
      throw createError;
    }
  } catch (error) {
    console.warn('Payment QR bucket setup warning:', error?.message || error);
  }
}

async function getPaymentQrSettings() {
  const { data, error } = await supabase
    .from('payment_qr_settings')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('Unable to load payment QR settings:', error.message || error);
    return {};
  }

  const resolved = {};
  for (const row of data || []) {
    const method = String(row.method || '').toUpperCase();
    if (!method) continue;
    resolved[method] = {
      method,
      label: row.label || row.display_name || method,
      accountNumber: row.account_number || row.accountNumber || '',
      imageUrl: row.image_url || row.imageUrl || '',
      storagePath: row.storage_path || row.storagePath || '',
      instruction: row.instruction || `Pay the amount in NPR using the selected ${method} QR below.`,
      updatedAt: row.updated_at || row.created_at || null,
    };
  }

  return resolved;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    console.warn('Deposit auth rejected: request missing bearer token.', {
      path: req.originalUrl,
      headers: Object.keys(req.headers)
    });
    return respondError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
  }

  try {
    const requestSupabase = getRequestSupabaseClient(req);
    const { data: { user }, error } = await requestSupabase.auth.getUser(token);
    if (error || !user) {
      console.warn('Deposit auth rejected: invalid bearer token.', {
        path: req.originalUrl,
        error: error?.message || 'No user resolved from token',
        errorCode: error?.code || null,
        errorStatus: error?.status || null,
        tokenLength: token.length,
        tokenPrefix: token.slice(0, 12)
      });
      return respondError(res, 'UNAUTHORIZED', 'Invalid user session.', 401);
    }

    req.user = user;
    req.supabase = requestSupabase;
    return next();
  } catch (error) {
    console.error('requireAuth error:', {
      path: req.originalUrl,
      message: error?.message,
      code: error?.code || null,
      status: error?.status || null,
      stack: error?.stack
    });
    return respondError(res, 'UNAUTHORIZED', 'Authentication failed.', 401);
  }
}

async function isAdminUser(userId) {
  const { data: adminData, error: adminError } = await supabase
    .from('admin_users')
    .select('is_active')
    .eq('user_id', userId)
    .maybeSingle();

  if (adminError && !['PGRST116', '42P01', '42703'].includes(adminError.code)) {
    throw adminError;
  }
  if (adminData?.is_active === true) return true;

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (profileError && !['PGRST116', '42P01', '42703'].includes(profileError.code)) {
    throw profileError;
  }

  return profileData?.is_admin === true;
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

  const dedupedInvestmentAmounts = new Map();
  const validInvestments = investments.filter((item) => {
    const status = String(item.status || '').toUpperCase();
    if (['PENDING', 'REJECTED', 'FAILED'].includes(status)) return false;
    const amount = Number(item.purchase_amount ?? item.invested_amount ?? item.amount ?? 0);
    const planName = String(item.plan_name || item.investment_plan || item.name || 'Investment').trim() || 'Investment';
    const normalizedPlan = planName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
    const durationDays = Number(item.duration_days ?? item.duration ?? 0);
    const referenceId = String(item.reference_id || item.referenceId || item.deposit_id || item.id || '').trim();
    const createdAtRaw = item.created_at || item.approved_at || item.started_at || item.date || '';
    const createdAt = createdAtRaw ? new Date(createdAtRaw).getTime() : 0;
    const createdAtBucket = Number.isFinite(createdAt) ? Math.floor(createdAt / (60 * 1000)) : 0;
    const key = referenceId
      ? `${item.user_id || userId}|reference:${referenceId.toLowerCase()}`
      : `${item.user_id || userId}|${normalizedPlan}|${amount}|${durationDays}|${status}|${createdAtBucket}`;
    if (dedupedInvestmentAmounts.has(key)) return false;
    dedupedInvestmentAmounts.set(key, true);
    return true;
  });

  const activeInvested = validInvestments.reduce((sum, item) => sum + Number(item.purchase_amount ?? item.invested_amount ?? item.amount ?? 0), 0);

  const maturedValue = validInvestments
    .filter((item) => {
      const status = String(item.status || '').toUpperCase();
      if (status === 'MATURING' || status === 'MATURED') return true;
      if (!item.created_at || !item.duration_days) return false;
      const createdAt = new Date(item.created_at);
      const durationMs = Number(item.duration_days || 0) * 24 * 60 * 60 * 1000;
      if (Number.isNaN(createdAt.getTime())) return false;
      return Date.now() - createdAt.getTime() >= durationMs;
    })
    .reduce((sum, item) => sum + Number(item.purchase_amount ?? item.invested_amount ?? item.amount ?? 0), 0);

  const maturedReturnTransactions = transactions
    .filter((txn) => ['INVESTMENT_RETURN', 'MATURITY_PAYOUT', 'MATURED_INVESTMENT'].includes(String(txn.type || '').toUpperCase()))
    .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);

  const availableBalance = Number((summary.available + Math.max(maturedValue - maturedReturnTransactions, 0)).toFixed(2));

  return {
    ...summary,
    available: availableBalance,
    invested: Number(activeInvested.toFixed(2)),
  };
}

router.get('/payment-qr', async (_req, res) => {
  try {
    const settings = await getPaymentQrSettings();
    const defaults = {
      ESEWA: {
        method: 'ESEWA',
        label: 'eSewa',
        accountNumber: '9767048356',
        imageUrl: '/assets/img/ESEWA.jpg',
        instruction: 'Pay the amount in NPR using the selected eSewa QR below.',
      },
      KHALTI: {
        method: 'KHALTI',
        label: 'Khalti',
        accountNumber: '9713555399',
        imageUrl: '/assets/img/KHALTI.jpg',
        instruction: 'Pay the amount in NPR using the selected Khalti QR below.',
      },
      FONEPAY: {
        method: 'FONEPAY',
        label: 'FonePay',
        accountNumber: '98XXXXXXXX',
        imageUrl: '/assets/img/FONEYPAY.jpg',
        instruction: 'Pay the amount in NPR using the selected FonePay QR below.',
      },
    };

    const merged = {};
    for (const method of Object.keys(defaults)) {
      merged[method] = {
        ...defaults[method],
        ...(settings[method] || {}),
      };
    }

    res.json({ success: true, data: merged });
  } catch (error) {
    res.status(500).json({ error: 'PAYMENT_QR_ERROR', message: 'Unable to load payment QR settings.' });
  }
});

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
  let stage = 'request parsing';
  try {
    console.log('🔵 Deposit endpoint called');
    
    const amount = Number(req.body.amount || 0);
    const method = String(req.body.paymentMethod || req.body.method || 'ESEWA').toUpperCase();
    const referenceId = String(req.body.referenceId || '').trim();
    const userId = req.user.id;
    const requestSupabase = getDepositWriteClient(req);

    console.log('🔵 Deposit submit request received:', {
      userId,
      amount,
      method,
      referenceId,
      receivedFields: Object.keys(req.body || {}),
      hasServiceRole: Boolean(supabaseServiceRole),
      requestSupabaseType: requestSupabase ? 'SupabaseClient' : 'null',
      paymentProofPath: req.body.paymentProofPath || null,
      filePresent: Boolean(req.file),
      fileName: req.file?.filename || null,
      fileMimeType: req.file?.mimetype || null,
      headers: {
        authHeaderPresent: Boolean(req.headers.authorization),
        contentType: req.headers['content-type']
      }
    });

    if (!Number.isFinite(amount) || amount <= 0) {
      return respondError(res, 'INVALID_AMOUNT', 'A valid deposit amount is required.', 400);
    }

    if (!['ESEWA', 'KHALTI', 'FONEPAY'].includes(method)) {
      return respondError(res, 'INVALID_PAYMENT_METHOD', 'Unsupported payment method.', 400);
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return respondError(res, 'INVALID_USER_ID', 'Authenticated user ID is invalid.', 401);
    }

    if (!referenceId) {
      return respondError(res, 'INVALID_REFERENCE_ID', 'A transaction reference is required.', 400);
    }

    stage = 'deposit payload preparation';
    let proofPath = null;
    if (req.file) {
      proofPath = `${userId}/${req.file.filename}`;
      const proofBytes = fs.readFileSync(req.file.path);
      stage = 'Supabase payment proof upload';
      console.log('🔵 Using storage client for payment proof upload:', {
        clientType: supabaseServiceRole ? 'service_role' : 'authenticated',
        proofPath,
        fileSize: proofBytes.length,
        mimeType: req.file.mimetype
      });
      
      const { data: proofUpload, error: proofUploadError } = await storageClient.storage
        .from('payment-proofs')
        .upload(proofPath, proofBytes, {
          cacheControl: '3600',
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (proofUploadError) {
        console.error('Payment proof storage upload error:', {
          message: proofUploadError.message,
          details: proofUploadError.details,
          hint: proofUploadError.hint,
          code: proofUploadError.statusCode || proofUploadError.code,
          userId,
          proofPath,
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
        });
        throw proofUploadError;
      }

      proofPath = proofUpload?.path || proofPath;
      proofPath = String(proofPath).replace(/^\/?payment-proofs\//i, '');
      console.log('✅ Payment proof stored in Supabase:', { proofPath, userId });
    }

    stage = 'Supabase deposits insert';
    console.log('Deposit insert starting:', {
      stage,
      table: 'public.deposits',
      userId,
      amount,
      method,
      hasProofPath: Boolean(proofPath),
      writeMode: supabaseServiceRole ? 'service_role' : 'authenticated_jwt'
    });

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
      
      // Provide specific error messages for common issues
      if (insertError.code === '42501' || insertError.message?.includes('row level security')) {
        console.error('RLS policy violation - user cannot insert own deposit');
        throw new Error('RLS Policy Violation: Cannot insert deposit record - ensure auth.uid() can insert to deposits table');
      }
      if (insertError.code === '23503') {
        console.error('Foreign key constraint - user_id may not exist in auth.users');
        throw new Error('User ID does not exist in authentication system');
      }
      
      throw insertError;
    }

    console.log('✅ Deposit inserted successfully:', deposit);

    res.status(201).json({
      success: true,
      data: deposit,
      message: 'Deposit submitted successfully and is pending admin approval.',
    });
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error('❌ Deposit submission failed at stage:', stage);
    console.error('❌ Deposit submission error details:', {
      errorId,
      method: req.method,
      path: req.originalUrl,
      stage,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      status: error?.status || null,
      statusCode: error?.statusCode || null,
      stack: error?.stack,
      body: req.body,
      userId: req.user?.id || null,
      filePresent: Boolean(req.file),
      fileName: req.file?.filename || null
    });

    if (error?.code === '42501') {
      return res.status(403).json({
        error: 'DEPOSIT_PERMISSION_DENIED',
        message: 'The authenticated account does not have permission to save this deposit.',
        errorId
      });
    }

    if (['22P02', '23503', '23514', '23502', '42703', '42P01'].includes(error?.code)) {
      return res.status(500).json({
        error: 'DEPOSIT_DATABASE_SCHEMA_ERROR',
        message: 'The deposit database configuration is incomplete. Please contact support.',
        details: error?.message,
        errorId
      });
    }

    // Return detailed error for development debugging
    const errorResponse = {
      error: 'DEPOSIT_SUBMIT_ERROR',
      message: error?.message || 'Unable to submit deposit. Please try again.',
      stage,
      errorId
    };
    
    // Include more details in development/local testing
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.details = error?.details;
      errorResponse.hint = error?.hint;
      errorResponse.code = error?.code;
    }
    
    res.status(500).json(errorResponse);
  }
});

router.get('/admin/deposits', requireAuth, async (req, res) => {
  try {
    if (!await isAdminUser(req.user.id)) {
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

router.get('/admin/payment-qr', requireAuth, async (req, res) => {
  try {
    if (!await isAdminUser(req.user.id)) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const settings = await getPaymentQrSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ error: 'ADMIN_PAYMENT_QR_ERROR', message: 'Unable to load payment QR settings.' });
  }
});

router.post('/admin/payment-qr', requireAuth, upload.single('qrFile'), async (req, res) => {
  try {
    if (!await isAdminUser(req.user.id)) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const method = String(req.body.method || '').toUpperCase();
    if (!['ESEWA', 'KHALTI', 'FONEPAY'].includes(method)) {
      return respondError(res, 'INVALID_PAY_METHOD', 'Unsupported payment method.', 400);
    }

    if (!req.file && !req.body.imageUrl) {
      return respondError(res, 'QR_REQUIRED', 'Please upload a new QR image to replace the old QR.', 400);
    }

    await ensurePaymentQrBucket();

    let imageUrl = String(req.body.imageUrl || '').trim();
    let storagePath = '';

    if (req.file) {
      const filename = `${method.toLowerCase()}-${Date.now()}${path.extname(req.file.originalname || '.png')}`;
      storagePath = `${method.toLowerCase()}/${filename}`;
      const fileBuffer = fs.readFileSync(req.file.path);

      const { data: uploadData, error: uploadError } = await storageClient.storage
        .from('payment-qr')
        .upload(storagePath, fileBuffer, {
          cacheControl: '3600',
          contentType: req.file.mimetype || 'image/png',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = storageClient.storage.from('payment-qr').getPublicUrl(uploadData?.path || storagePath);
      imageUrl = publicData?.publicUrl || imageUrl;
      storagePath = uploadData?.path || storagePath;
    }

    const label = String(req.body.label || '').trim() || method;
    const accountNumber = String(req.body.accountNumber || '').trim() || '';
    const instruction = String(req.body.instruction || '').trim() || `Pay the amount in NPR using the selected ${label} QR below.`;

    const { data, error } = await supabase
      .from('payment_qr_settings')
      .upsert({
        method,
        label,
        account_number: accountNumber,
        image_url: imageUrl,
        storage_path: storagePath,
        instruction,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'method' })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data,
      message: `${label} QR updated successfully and the previous QR has been replaced.`,
    });
  } catch (error) {
    const message = error?.message || 'Unable to update payment QR.';
    res.status(500).json({ error: 'UPDATE_PAYMENT_QR_ERROR', message });
  }
});

router.post('/admin/change-password', requireAuth, async (req, res) => {
  try {
    if (!await isAdminUser(req.user.id)) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const currentPassword = String(req.body.currentPassword || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();

    if (!currentPassword || !newPassword) {
      return respondError(res, 'PASSWORD_REQUIRED', 'Current and new passwords are required.', 400);
    }

    if (newPassword.length < 6) {
      return respondError(res, 'PASSWORD_TOO_SHORT', 'New password must be at least 6 characters.', 400);
    }

    const email = String(req.user?.email || '').trim();
    if (!email) {
      return respondError(res, 'EMAIL_REQUIRED', 'Admin email is required to verify your current password.', 400);
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthError) {
      return respondError(res, 'CURRENT_PASSWORD_INVALID', 'The current password is incorrect.', 401);
    }

    if (!supabaseServiceRole) {
      return respondError(res, 'SERVICE_ROLE_MISSING', 'Password change is not available because the server is missing the service-role key.', 500);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(req.user.id, { password: newPassword });
    if (updateError) throw updateError;

    res.json({ success: true, message: 'Admin password changed successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'ADMIN_CHANGE_PASSWORD_ERROR', message: error?.message || 'Unable to change admin password.' });
  }
});

router.get('/admin/dashboard', requireAuth, async (req, res) => {
  try {
    if (!await isAdminUser(req.user.id)) {
      return respondError(res, 'FORBIDDEN', 'Admin access required.', 403);
    }

    const [profilesResult, adminUsersResult, transactionsResult, depositsResult, withdrawalsResult, investmentsResult] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('admin_users').select('user_id, is_active'),
      supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('deposits').select('*').order('created_at', { ascending: false }),
      supabase.from('withdrawals').select('*').order('created_at', { ascending: false }),
      supabase.from('investments').select('*').order('created_at', { ascending: false }),
    ]);

    const failedQuery = [profilesResult, adminUsersResult, transactionsResult, depositsResult, withdrawalsResult, investmentsResult]
      .find((result) => result.error);
    if (failedQuery) throw failedQuery.error;

    const profiles = profilesResult.data || [];
    const adminRows = Array.isArray(adminUsersResult.data) ? adminUsersResult.data.filter((item) => item.is_active) : [];
    const profileAdminIds = profiles.filter((profile) => profile.is_admin === true).map((profile) => profile.id);
    const activeAdminIds = new Set([
      ...adminRows.map((item) => item.user_id),
      ...profileAdminIds,
    ]);
    const transactions = transactionsResult.data || [];
    const deposits = depositsResult.data || [];
    const withdrawals = withdrawalsResult.data || [];
    const investments = investmentsResult.data || [];

    const users = profiles.map((user) => {
      const userTransactions = transactions.filter((item) => item.user_id === user.id);
      const userDeposits = deposits.filter((item) => item.user_id === user.id);
      const userWithdrawals = withdrawals.filter((item) => item.user_id === user.id);
      const userInvestments = investments.filter((item) => item.user_id === user.id);
      const wallet = calculateWalletBalance(userTransactions);
      const totalDeposited = userDeposits
        .filter((item) => String(item.status).toUpperCase() === 'APPROVED')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const totalInvested = userInvestments
        .filter((item) => !['PENDING', 'REJECTED', 'FAILED'].includes(String(item.status).toUpperCase()))
        .reduce((sum, item) => sum + Number(item.purchase_amount ?? item.investment_amount ?? item.amount ?? 0), 0);

      return {
        ...user,
        is_admin: activeAdminIds.has(user.id),
        wallet,
        invited_count: Number(user.invited_count || 0),
        referral_bonus: Number(user.referral_bonus || 0),
        referred_by: user.referred_by || null,
        invitation_code: user.invitation_code || null,
        stats: {
          deposits: userDeposits.length,
          totalDeposited: Number(totalDeposited.toFixed(2)),
          approvedDeposits: userDeposits.filter((item) => String(item.status).toUpperCase() === 'APPROVED').length,
          pendingDeposits: userDeposits.filter((item) => String(item.status).toUpperCase() === 'PENDING').length,
          withdrawals: userWithdrawals.length,
          pendingWithdrawals: userWithdrawals.filter((item) => ['PENDING', 'UNDER_REVIEW', 'PROCESSING'].includes(String(item.status).toUpperCase())).length,
          investments: userInvestments.length,
          totalInvested: Number(totalInvested.toFixed(2)),
          transactions: userTransactions.length,
        },
      };
    });

    const pendingDeposits = deposits.filter((item) => String(item.status).toUpperCase() === 'PENDING');
    const pendingWithdrawals = withdrawals.filter((item) => ['PENDING', 'UNDER_REVIEW', 'PROCESSING'].includes(String(item.status).toUpperCase()));

    res.json({
      success: true,
      data: {
        users,
        deposits,
        withdrawals,
        investments,
        transactions,
        stats: {
          users: users.length,
          admins: users.filter((user) => user.is_admin).length,
          totalAvailable: users.reduce((sum, user) => sum + Number(user.wallet.available || 0), 0),
          totalInvested: users.reduce((sum, user) => sum + Number(user.wallet.invested || 0), 0),
          totalEarned: users.reduce((sum, user) => sum + Number(user.wallet.totalEarned || 0), 0),
          pendingDeposits: pendingDeposits.length,
          pendingDepositAmount: pendingDeposits.reduce((sum, item) => sum + Number(item.amount || 0), 0),
          pendingWithdrawals: pendingWithdrawals.length,
          pendingWithdrawalAmount: pendingWithdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        },
      },
    });
  } catch (error) {
    console.error('Admin dashboard load failed:', { message: error?.message, code: error?.code });
    res.status(500).json({ error: 'ADMIN_DASHBOARD_ERROR', message: 'Unable to load admin dashboard.' });
  }
});

router.post('/admin/deposits/:id/approve', requireAuth, async (req, res) => {
  try {
    if (!await isAdminUser(req.user.id)) {
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
    if (!await isAdminUser(req.user.id)) {
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
    if (!await isAdminUser(req.user.id)) {
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
    if (!await isAdminUser(req.user.id)) {
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
    if (!await isAdminUser(req.user.id)) {
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
    if (!await isAdminUser(req.user.id)) {
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
    if (!await isAdminUser(req.user.id)) {
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
