const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

function buildTelegramApiUrl(botToken) {
  return `${TELEGRAM_API_BASE}${botToken}`;
}

function buildApprovalRejectKeyboard(investmentId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ APPROVE', callback_data: `approve:${investmentId}` },
        { text: '❌ REJECT', callback_data: `reject:${investmentId}` },
      ],
    ],
  };
}

async function sendTelegramMessage({ botToken, chatId, text, replyMarkup }) {
  if (!botToken || !chatId) {
    throw new Error('Telegram bot token and admin chat ID are required.');
  }

  const url = `${buildTelegramApiUrl(botToken)}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: replyMarkup || undefined,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function verifyTelegramAdmin({ botToken, chatId, userId, adminChatId, adminUserId }) {
  const configuredChatId = String(adminChatId || '').trim();
  const configuredUserId = String(adminUserId || '').trim();
  const incomingChatId = String(chatId || '').trim();
  const incomingUserId = String(userId || '').trim();

  if (incomingChatId && configuredChatId && incomingChatId === configuredChatId) {
    return true;
  }

  if (incomingUserId && configuredUserId && incomingUserId === configuredUserId) {
    return true;
  }

  if (!botToken || (!configuredChatId && !configuredUserId)) {
    return false;
  }

  if (!incomingUserId || !configuredChatId) {
    return false;
  }

  try {
    const url = `${buildTelegramApiUrl(botToken)}/getChatMember?chat_id=${encodeURIComponent(configuredChatId)}&user_id=${encodeURIComponent(incomingUserId)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    const status = data?.result?.status;
    return status === 'creator' || status === 'administrator' || status === 'member';
  } catch (error) {
    console.error('Telegram admin verification error:', error);
    return false;
  }
}

function buildInvestmentSubmittedMessage(investment) {
  const proofUrl = investment.payment_proof_url || investment.payment_proof_path || 'https://example.com/payment-proof';

  return [
    '<b>🔔 NEW PAYMENT VERIFICATION</b>',
    '━━━━━━━━━━━━━━━━',
    `💰 Amount: NPR ${Number(investment.investment_amount || 0).toLocaleString('en-US')}`,
    `📦 Plan: ${investment.plan_name || 'Investment'}`,
    `📧 Email: ${investment.user_email || 'N/A'}`,
    `🆔 Investment ID: ${investment.id || investment.investment_id || 'N/A'}`,
    `🕐 Submitted: ${new Date(investment.created_at || Date.now()).toLocaleString('en-GB')}`,
    '📌 Status: PENDING',
    '━━━━━━━━━━━━━━━━',
    '🖼 Payment Proof:',
    `<a href="${proofUrl}">View Payment Proof</a>`,
  ].join('\n');
}

function buildApprovalMessage(investment) {
  return [
    '<b>✅ PAYMENT APPROVED</b>',
    '',
    `💰 Amount: NPR ${Number(investment.investment_amount || 0).toLocaleString('en-US')}`,
    `📧 Email: ${investment.user_email || 'N/A'}`,
    `🆔 Investment ID: ${investment.id || investment.investment_id || 'N/A'}`,
  ].join('\n');
}

function buildRejectionMessage(investment) {
  return [
    '<b>❌ PAYMENT REJECTED</b>',
    '',
    `💰 Amount: NPR ${Number(investment.investment_amount || 0).toLocaleString('en-US')}`,
    `📧 Email: ${investment.user_email || 'N/A'}`,
    `🆔 Investment ID: ${investment.id || investment.investment_id || 'N/A'}`,
  ].join('\n');
}

function parseTelegramCallbackData(payload) {
  if (!payload) return null;
  const [action, investmentId] = String(payload).split(':');
  if (!action || !investmentId) return null;
  return { action, investmentId };
}

module.exports = {
  buildApprovalRejectKeyboard,
  sendTelegramMessage,
  verifyTelegramAdmin,
  buildInvestmentSubmittedMessage,
  buildApprovalMessage,
  buildRejectionMessage,
  parseTelegramCallbackData,
};
