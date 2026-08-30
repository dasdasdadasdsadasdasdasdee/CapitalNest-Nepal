require('dotenv').config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
const adminUserId = process.env.TELEGRAM_ADMIN_USER_ID;
const projectSupabaseUrl = 'https://mohigobcssqzywmhndml.supabase.co';
const configuredSupabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabaseUrl = projectSupabaseUrl;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const notifiedInvestmentIds = new Set();
let shuttingDown = false;
let activePollController = null;

if (!botToken) {
  console.warn('TELEGRAM_BOT_TOKEN is missing. Telegram bot will stay disabled.');
  return;
}

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('Telegram bot is disabled because SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
  return;
}

if (configuredSupabaseUrl && configuredSupabaseUrl !== projectSupabaseUrl) {
  console.warn(`Ignoring mismatched SUPABASE_URL (${configuredSupabaseUrl}); using ${projectSupabaseUrl}.`);
}

const TELEGRAM_API = `https://api.telegram.org/bot${botToken}`;

function api(path, options = {}) {
  return fetch(`${TELEGRAM_API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }).then(async (response) => {
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      json = { ok: false, error: text };
    }

    if (!response.ok || !json.ok) {
      throw new Error(json.description || json.error || `Telegram API error (${response.status})`);
    }

    return json.result;
  });
}

function supabaseRequest(endpoint, options = {}) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  return fetch(`${supabaseUrl.replace(/\/$/, '')}${endpoint}`, {
    ...options,
    headers,
  }).then(async (response) => {
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Supabase parse error: ${text}`);
    }

    if (!response.ok) {
      const message = json?.message || text || `Supabase error (${response.status})`;
      throw new Error(message);
    }

    return json;
  });
}

async function verifyAdmin(userId, chatId) {
  const incomingUserId = String(userId || '');
  const incomingChatId = String(chatId || '');

  if (adminUserId && incomingUserId && incomingUserId === String(adminUserId)) {
    return true;
  }

  if (adminChatId && incomingChatId && incomingChatId === String(adminChatId)) {
    return true;
  }

  return false;
}

async function getInvestmentById(investmentId) {
  const data = await supabaseRequest(`/rest/v1/investments?id=eq.${encodeURIComponent(investmentId)}`, {
    method: 'GET',
  });

  return Array.isArray(data) ? data[0] : null;
}

async function updateInvestmentStatus(investmentId, updateFields) {
  const query = `/rest/v1/investments?id=eq.${encodeURIComponent(investmentId)}`;
  return supabaseRequest(query, {
    method: 'PATCH',
    body: JSON.stringify(updateFields),
  });
}

async function getPendingInvestments() {
  return supabaseRequest('/rest/v1/investments?status=eq.pending&order=created_at.asc&select=*', {
    method: 'GET',
  });
}

async function answerCallback(callbackQueryId, text) {
  await api('/answerCallbackQuery', {
    method: 'POST',
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

async function sendMessage(chatId, text) {
  await api('/sendMessage', {
    method: 'POST',
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

async function notifyPendingInvestments() {
  if (!adminChatId) return;

  const investments = await getPendingInvestments();
  for (const investment of investments || []) {
    if (!investment.id || notifiedInvestmentIds.has(investment.id)) continue;

    const proofUrl = investment.payment_proof_url || investment.payment_proof_path || '';
    const message = [
      '<b>🔔 NEW PAYMENT VERIFICATION</b>',
      '━━━━━━━━━━━━━━━━',
      `💰 Amount: NPR ${Number(investment.amount || investment.investment_amount || 0).toLocaleString('en-US')}`,
      `📦 Plan: ${investment.investment_plan || investment.plan_name || 'Investment'}`,
      `📧 Email: ${investment.email || investment.user_email || 'N/A'}`,
      `🆔 Investment ID: ${investment.id}`,
      `🖼 Proof: ${proofUrl ? `<a href="${proofUrl}">View Payment Proof</a>` : 'Not available'}`,
      '',
      '📌 Status: PENDING',
    ].join('\n');

    await api('/sendMessage', {
      method: 'POST',
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ APPROVE', callback_data: `approve:${investment.id}` },
            { text: '❌ REJECT', callback_data: `reject:${investment.id}` },
          ]],
        },
      }),
    });

    notifiedInvestmentIds.add(investment.id);
    console.log(`Telegram approval buttons sent for investment ${investment.id}`);
  }
}

async function onCallbackQuery(callbackQuery) {
  const payload = callbackQuery?.data || '';
  const match = payload.match(/^(approve|reject):([^:]+)$/);
  if (!match) return;

  const [, action, investmentId] = match;
  const fromUserId = callbackQuery?.from?.id;
  const chatId = callbackQuery?.message?.chat?.id;

  const isAdmin = await verifyAdmin(fromUserId, chatId);
  if (!isAdmin) {
    await answerCallback(callbackQuery.id, '❌ Unauthorized admin.');
    return;
  }

  const investment = await getInvestmentById(investmentId);
  if (!investment) {
    await answerCallback(callbackQuery.id, '❌ Investment not found.');
    return;
  }

  if (investment.status !== 'pending') {
    await answerCallback(callbackQuery.id, '⚠️ This payment is no longer pending and cannot be changed.');
    return;
  }

  if (action === 'approve') {
    await updateInvestmentStatus(investmentId, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: String(fromUserId),
      updated_at: new Date().toISOString(),
    });

    await answerCallback(callbackQuery.id, '✅ Payment approved');
    await sendMessage(chatId, [
      '<b>✅ PAYMENT APPROVED</b>',
      '',
      `💰 Amount: NPR ${Number(investment.investment_amount || 0).toLocaleString('en-US')}`,
      `📧 Email: ${investment.user_email || 'N/A'}`,
      `🆔 Investment ID: ${investment.id || investment.investment_id || 'N/A'}`,
    ].join('\n'));
    return;
  }

  if (action === 'reject') {
    await updateInvestmentStatus(investmentId, {
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: String(fromUserId),
      admin_note: 'Payment proof could not be verified',
      updated_at: new Date().toISOString(),
    });

    await answerCallback(callbackQuery.id, '❌ Payment rejected');
    await sendMessage(chatId, [
      '<b>❌ PAYMENT REJECTED</b>',
      '',
      `💰 Amount: NPR ${Number(investment.investment_amount || 0).toLocaleString('en-US')}`,
      `📧 Email: ${investment.user_email || 'N/A'}`,
      `🆔 Investment ID: ${investment.id || investment.investment_id || 'N/A'}`,
    ].join('\n'));
  }
}

async function pollTelegram() {
  let offset = 0;

  console.log('Telegram bot started. Polling for updates...');

  while (!shuttingDown) {
    try {
      await notifyPendingInvestments();

      activePollController = new AbortController();
      const updates = await api('/getUpdates', {
        method: 'POST',
        body: JSON.stringify({ offset, timeout: 30 }),
        signal: activePollController.signal,
      });
      activePollController = null;

      for (const update of updates || []) {
        offset = Math.max(offset, Number(update.update_id) + 1);

        if (update.callback_query) {
          await onCallbackQuery(update.callback_query);
        }
      }
    } catch (error) {
      activePollController = null;
      if (shuttingDown || error?.name === 'AbortError') {
        break;
      }
      console.error('Polling error:', error.message);
      if (/invalid api key/i.test(error.message)) {
        console.warn('Telegram bot credentials are invalid. Bot remains disabled until a valid TELEGRAM_BOT_TOKEN and SUPABASE_SERVICE_ROLE_KEY are configured in Railway.');
        return;
      }
      if (/forbidden|unauthorized|401|403/i.test(error.message)) {
        console.warn('Telegram bot authorization failed. Check the bot token and admin chat settings in Railway.');
        return;
      }
    }
  }

  console.log('Telegram bot polling stopped.');
}

function stopTelegramBot() {
  if (shuttingDown) return;
  shuttingDown = true;
  activePollController?.abort();
  console.log('Telegram bot shutdown requested.');
}

(async () => {
  try {
    if (shuttingDown) return;
    const me = await api('/getMe', { method: 'POST' });
    console.log(`Telegram bot active: @${me.username || 'unknown'}`);
    await pollTelegram();
  } catch (error) {
    console.error('Failed to start Telegram bot:', error.message);
    console.warn('Telegram bot startup failed, but the web app will continue to run on Railway.');
  }
})();

module.exports = { stopTelegramBot };
