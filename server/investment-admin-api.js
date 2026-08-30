require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const {
  sendTelegramMessage,
  verifyTelegramAdmin,
  buildInvestmentSubmittedMessage,
  buildApprovalRejectKeyboard,
  buildApprovalMessage,
  buildRejectionMessage,
  parseTelegramCallbackData,
} = require('./telegram-admin');

const projectSupabaseUrl = (process.env.SUPABASE_URL || 'https://mohigobcssqzywmhndml.supabase.co').replace(/\/$/, '');
const supabaseUrl = projectSupabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
const adminUserId = process.env.TELEGRAM_ADMIN_USER_ID;

function normalizePaymentProofPath(value) {
  if (value === null || value === undefined) return '';

  let v = String(value).trim();
  if (!v) return '';

  try {
    v = decodeURIComponent(v);
  } catch (error) {
    // ignore malformed encoded values
  }

  try {
    if (v.startsWith('http://') || v.startsWith('https://')) {
      const url = new URL(v);
      v = url.pathname;
    }
  } catch (error) {
    // fall through to legacy string cleanup
  }

  v = v.replace(/[?#].*$/, '').replace(/^\/+/, '');

  const bucketFragments = [
    /^storage\/v1\/object(?:\/public|\/private|\/authenticated|\/sign)?\//i,
    /^object(?:\/public|\/private|\/authenticated|\/sign)?\//i,
    /^payment-proofs\//i,
    /^public\//i,
    /^private\//i,
    /^authenticated\//i,
    /^\/+/, 
  ];

  let previous = '';
  while (v !== previous) {
    previous = v;
    for (const pattern of bucketFragments) {
      if (pattern.test(v)) {
        v = v.replace(pattern, '');
      }
    }
    v = v.replace(/^\/+/, '');
  }

  return v;
}

function buildPaymentProofUrl(value) {
  if (value && /^https?:\/\//i.test(String(value))) {
    const pathOnly = String(value).replace(/^https?:\/\/[^/]+/i, '');
    if (/^(?:\/)?(?:storage\/v1\/object\/(?:public|private|authenticated)|object\/(?:public|private|authenticated|sign))\/payment-proofs\/?$/i.test(pathOnly)) {
      return '';
    }
  }

  const normalized = normalizePaymentProofPath(value);
  if (!normalized) return '';
  return `${projectSupabaseUrl}/storage/v1/object/public/payment-proofs/${normalized}`;
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getInvestmentById(investmentId) {
  const { data, error } = await supabaseAdmin
    .from('investments')
    .select('*')
    .eq('id', investmentId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function handleInvestmentSubmission(investment) {
  if (!investment || !investment.user_id || !investment.user_email || !investment.investment_amount) {
    throw new Error('Missing required investment fields.');
  }

  const payload = {
    user_id: investment.user_id,
    user_email: investment.user_email,
    plan_name: investment.plan_name || 'Investment',
    investment_amount: Number(investment.investment_amount || 0),
    payment_proof_path: investment.payment_proof_path || investment.payment_proof || '',
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    admin_note: null,
    approved_at: null,
    rejected_at: null,
    approved_by: null,
    rejected_by: null,
  };

  const { data, error } = await supabaseAdmin
    .from('investments')
    .insert([payload])
    .select()
    .single();

  if (error) {
    throw error;
  }

  if (botToken && adminChatId) {
    const proofUrl = buildPaymentProofUrl(data.payment_proof_path || data.payment_proof || '');
    const safeProofUrl = proofUrl || 'https://example.com/payment-proof';

    const message = buildInvestmentSubmittedMessage({
      ...data,
      payment_proof_url: safeProofUrl,
    });

    try {
      await sendTelegramMessage({
        botToken,
        chatId: adminChatId,
        text: message,
        replyMarkup: buildApprovalRejectKeyboard(data.id),
      });
    } catch (telegramError) {
      console.error('Telegram notification failed:', telegramError);
    }
  }

  return data;
}

async function handleApproveInvestment({ investmentId, telegramUserId, chatId }) {
  if (!investmentId) {
    throw new Error('Investment ID is required.');
  }

  const isAuthorized = await verifyTelegramAdmin({
    botToken,
    chatId,
    userId: telegramUserId,
    adminChatId,
    adminUserId,
  });

  if (!isAuthorized) {
    throw new Error('Unauthorized Telegram admin.');
  }

  const investment = await getInvestmentById(investmentId);

  if (!investment || investment.status !== 'pending') {
    throw new Error('Only pending investments can be approved.');
  }

  const { data, error } = await supabaseAdmin
    .from('investments')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: telegramUserId || adminUserId || 'telegram-admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', investmentId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  if (botToken && adminChatId) {
    await sendTelegramMessage({
      botToken,
      chatId: adminChatId,
      text: buildApprovalMessage(data),
    });
  }

  return data;
}

async function handleRejectInvestment({ investmentId, telegramUserId, chatId, reason }) {
  if (!investmentId) {
    throw new Error('Investment ID is required.');
  }

  const isAuthorized = await verifyTelegramAdmin({
    botToken,
    chatId,
    userId: telegramUserId,
    adminChatId,
    adminUserId,
  });

  if (!isAuthorized) {
    throw new Error('Unauthorized Telegram admin.');
  }

  const investment = await getInvestmentById(investmentId);

  if (!investment || investment.status !== 'pending') {
    throw new Error('Only pending investments can be rejected.');
  }

  const { data, error } = await supabaseAdmin
    .from('investments')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: telegramUserId || adminUserId || 'telegram-admin',
      admin_note: reason || 'Payment proof could not be verified',
      updated_at: new Date().toISOString(),
    })
    .eq('id', investmentId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  if (botToken && adminChatId) {
    await sendTelegramMessage({
      botToken,
      chatId: adminChatId,
      text: buildRejectionMessage(data),
    });
  }

  return data;
}

async function handleTelegramCallback({ callbackQuery }) {
  const payload = parseTelegramCallbackData(callbackQuery?.data);
  if (!payload) {
    return { ok: false };
  }

  if (payload.action === 'approve') {
    return handleApproveInvestment({
      investmentId: payload.investmentId,
      telegramUserId: String(callbackQuery?.from?.id || ''),
      chatId: String(callbackQuery?.message?.chat?.id || ''),
    });
  }

  if (payload.action === 'reject') {
    return handleRejectInvestment({
      investmentId: payload.investmentId,
      telegramUserId: String(callbackQuery?.from?.id || ''),
      chatId: String(callbackQuery?.message?.chat?.id || ''),
      reason: 'Payment proof could not be verified',
    });
  }

  return { ok: false };
}

module.exports = {
  handleInvestmentSubmission,
  handleApproveInvestment,
  handleRejectInvestment,
  handleTelegramCallback,
};
