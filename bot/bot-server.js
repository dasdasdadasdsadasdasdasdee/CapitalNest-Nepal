import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase with Service Role Key (bypasses RLS)
const SUPABASE_URL = 'https://mohigobcssqzywmhndml.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_KEY not found in .env file');
  console.error('Please add SUPABASE_SERVICE_KEY to bot/.env from your Supabase project settings');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Telegram Bot Token from environment variable
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8872765794:AAFWA9zoUjU0dXPMm9jUc_UvQ8A996kKQBs';
const bot = new TelegramBot(TOKEN, { polling: true });

// Store for pending approvals
const pendingApprovals = new Map();

console.log('🤖 CapitalNest Telegram Bot Started...');

// Bot start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;  // User's actual Telegram user ID
  const firstName = msg.from.first_name;
  
  // Check if user is admin
  const { data: admin, error } = await supabase
    .from('profiles')
    .select('is_admin, email')
    .eq('telegram_id', userId.toString())
    .single();
  
  if (error || !admin) {
    bot.sendMessage(
      chatId,
      `⚠️ Your Telegram ID is not linked to a profile.\n\nYour ID: \`${userId}\`\n\nPlease contact support to link your account.`
    );
    return;
  }
  
  if (!admin.is_admin) {
    bot.sendMessage(
      chatId,
      `⚠️ You are not authorized as an admin.\n\nEmail: ${admin.email}\n\nPlease contact support.`
    );
    return;
  }
  
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 View Pending Approvals', callback_data: 'view_pending' }],
        [{ text: '💰 My Profile', callback_data: 'my_profile' }]
      ]
    }
  };
  
  bot.sendMessage(
    chatId,
    `👋 Welcome ${firstName}! I'm the CapitalNest Payment Approval Bot.\n\n✅ **Admin Access Granted**\n\nI'll notify you of pending payments and help you approve or reject them.`,
    { ...opts, parse_mode: 'Markdown' }
  );
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;  // User's actual Telegram user ID
  const data = query.data;
  const messageId = query.message.message_id;
  
  try {
    if (data.startsWith('approve_')) {
      const approvalId = data.split('_')[1];
      await approvePayment(approvalId, userId, chatId, messageId);
    } else if (data.startsWith('reject_')) {
      const approvalId = data.split('_')[1];
      await rejectPayment(approvalId, userId, chatId, messageId);
    } else if (data === 'view_pending') {
      await viewPendingApprovals(userId, chatId);
    } else if (data === 'my_profile') {
      await showAdminProfile(userId, chatId);
    }
    
    // Answer the callback query
    bot.answerCallbackQuery(query.id, { text: '✅ Processing...' });
  } catch (error) {
    console.error('Callback error:', error);
    bot.answerCallbackQuery(query.id, { text: '❌ Error processing request' });
  }
});

// Approve Payment
async function approvePayment(approvalId, userId, chatId, messageId) {
  try {
    // Verify admin
    const { data: admin, error: adminError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('telegram_id', userId.toString())
      .single();
    
    if (adminError || !admin || !admin.is_admin) {
      bot.editMessageText('❌ Unauthorized! Only admins can approve payments.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
    
    // Get approval details
    const { data: approval, error: fetchError } = await supabase
      .from('payment_approvals')
      .select('*, user_id, amount, payment_method, customer_name, phone_number, payment_proof_url')
      .eq('id', approvalId)
      .single();
    
    if (fetchError) throw fetchError;
    
    if (!approval) {
      bot.editMessageText('❌ Approval record not found!', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
    
    // Update approval status
    const { data: updated, error: updateError } = await supabase
      .from('payment_approvals')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString()
      })
      .eq('id', approvalId)
      .select();
    
    if (updateError) throw updateError;
    
    // Update transaction status
    if (approval.transaction_id) {
      await supabase
        .from('transactions')
        .update({ status: 'completed' })
        .eq('id', approval.transaction_id);

      const { data: userInvestments, error: investmentLookupError } = await supabase
        .from('user_investments')
        .select('id')
        .eq('user_id', approval.user_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!investmentLookupError && userInvestments && userInvestments.length > 0) {
        await supabase
          .from('user_investments')
          .update({ status: 'active', approval_id: approvalId })
          .eq('id', userInvestments[0].id);
      }
    }
    
    // Notify admin
    const approvalText = [
      '✅ Payment Approved!',
      '',
      `Investor: ${approval.customer_name || 'Unknown User'}`,
      `Phone: ${approval.phone_number || 'N/A'}`,
      `Amount: NPR ${approval.amount}`,
      `Method: ${approval.payment_method}`,
      `Status: APPROVED`,
      '',
      'The user has been notified and balance updated.'
    ].join('\n');

    bot.editMessageText(approvalText, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [[{ text: '📊 View More', callback_data: 'view_pending' }]] }
    });

    if (approval.payment_proof_url) {
      try {
        await bot.sendPhoto(chatId, approval.payment_proof_url, {
          caption: `Payment proof for ${approval.customer_name || 'investor'}`
        });
      } catch (proofError) {
        console.error('Error sending payment proof to admin:', proofError);
      }
    }
    
    // Notify user
    await notifyUserApproval(approval.user_id, approval.amount);
    
    console.log(`✅ Payment approved: ${approvalId}`);
  } catch (error) {
    console.error('Error approving payment:', error);
    bot.editMessageText('❌ Error approving payment!', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// Reject Payment
async function rejectPayment(approvalId, userId, chatId, messageId) {
  try {
    // Verify admin
    const { data: admin, error: adminError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('telegram_id', userId.toString())
      .single();
    
    if (adminError || !admin || !admin.is_admin) {
      bot.editMessageText('❌ Unauthorized! Only admins can reject payments.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
    
    const { data: approval, error: fetchError } = await supabase
      .from('payment_approvals')
      .select('*')
      .eq('id', approvalId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Update approval status
    await supabase
      .from('payment_approvals')
      .update({ status: 'rejected' })
      .eq('id', approvalId);
    
    // Update transaction status
    if (approval.transaction_id) {
      await supabase
        .from('transactions')
        .update({ status: 'failed' })
        .eq('id', approval.transaction_id);

      const { data: userInvestments, error: investmentLookupError } = await supabase
        .from('user_investments')
        .select('id')
        .eq('user_id', approval.user_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!investmentLookupError && userInvestments && userInvestments.length > 0) {
        await supabase
          .from('user_investments')
          .update({ status: 'rejected', approval_id: approvalId })
          .eq('id', userInvestments[0].id);
      }
    }
    
    bot.editMessageText(
      `❌ Payment Rejected!\n\n` +
      `Amount: $${approval.amount}\n` +
      `Status: REJECTED\n\n` +
      `The user has been notified.`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '📊 View More', callback_data: 'view_pending' }]] }
      }
    );
    
    // Notify user
    await notifyUserRejection(approval.user_id, approval.amount);
    
    console.log(`❌ Payment rejected: ${approvalId}`);
  } catch (error) {
    console.error('Error rejecting payment:', error);
    bot.editMessageText('❌ Error rejecting payment!', {
      chat_id: chatId,
      message_id: messageId
    });
  }
}

// View Pending Approvals
async function viewPendingApprovals(userId, chatId) {
  try {
    // Verify admin
    const { data: admin, error: adminError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('telegram_id', userId.toString())
      .single();
    
    if (adminError || !admin || !admin.is_admin) {
      bot.sendMessage(chatId, '❌ Unauthorized! Only admins can view pending approvals.');
      return;
    }
    
    const { data: approvals, error } = await supabase
      .from('payment_approvals')
      .select('*, user_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);
    
    if (error) throw error;
    
    if (!approvals || approvals.length === 0) {
      bot.sendMessage(chatId, '✅ No pending approvals!');
      return;
    }
    
    for (const approval of approvals) {
      const approvalMessage = [
        `📋 **Pending Payment Approval**`,
        '',
        `👤 *Investor:* ${approval.customer_name || 'Unknown User'}`,
        `📞 *Phone:* ${approval.phone_number || 'N/A'}`,
        `💰 *Amount:* NPR ${approval.amount}`,
        `📱 *Method:* ${approval.payment_method}`,
        `⏰ *Time:* ${new Date(approval.created_at).toLocaleString()}`,
        `ID: \`${approval.id}\``,
        approval.notes ? `📝 *Notes:* ${approval.notes}` : ''
      ].filter(Boolean).join('\n');

      bot.sendMessage(
        chatId,
        approvalMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve', callback_data: `approve_${approval.id}` },
                { text: '❌ Reject', callback_data: `reject_${approval.id}` }
              ]
            ]
          }
        }
      );

      if (approval.payment_proof_url) {
        try {
          await bot.sendPhoto(chatId, approval.payment_proof_url, {
            caption: `Payment proof for ${approval.customer_name || 'investor'}`
          });
        } catch (photoError) {
          console.error('Error sending payment proof in pending list:', photoError);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    bot.sendMessage(chatId, '❌ Error fetching approvals!');
  }
}

// Show Admin Profile
async function showAdminProfile(userId, chatId) {
  try {
    const { data: adminProfile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', userId.toString())
      .single();
    
    if (error || !adminProfile) {
      bot.sendMessage(
        chatId,
        '⚠️ Your Telegram ID is not linked to a profile. Contact support to link your account.\n\n' +
        `Your Telegram ID: \`${userId}\``
      );
      return;
    }
    
    let profileMsg = `👤 **Your Profile**\n\n`;
    profileMsg += `Name: ${adminProfile.full_name || 'Not set'}\n`;
    profileMsg += `Email: ${adminProfile.email}\n`;
    profileMsg += `Role: ${adminProfile.is_admin ? '🛡️ Admin' : 'User'}\n`;
    profileMsg += `Joined: ${new Date(adminProfile.created_at).toLocaleDateString()}\n`;
    
    bot.sendMessage(chatId, profileMsg, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error fetching profile:', error);
    bot.sendMessage(chatId, '❌ Error fetching profile!');
  }
}

// Notify User of Approval
async function notifyUserApproval(userId, amount) {
  try {
    const { data: user, error } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', userId)
      .single();
    
    if (!user?.telegram_id) return;
    
    bot.sendMessage(
      user.telegram_id,
      `✅ **Payment Approved!**\n\n` +
      `Your deposit of $${amount} has been approved.\n` +
      `Your balance has been updated in real-time.\n\n` +
      `Check your wallet to see the updated balance!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error notifying user:', error);
  }
}

// Notify User of Rejection
async function notifyUserRejection(userId, amount) {
  try {
    const { data: user, error } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', userId)
      .single();
    
    if (!user?.telegram_id) return;
    
    bot.sendMessage(
      user.telegram_id,
      `❌ **Payment Rejected**\n\n` +
      `Your deposit of $${amount} was not approved.\n` +
      `Please contact support for more information.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error notifying user:', error);
  }
}

// Listen for new payment requests (via Supabase subscription)
async function subscribeToPaymentApprovals() {
  supabase
    .channel('payment-approvals-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'payment_approvals'
      },
      async (payload) => {
        const approval = payload.new;
        
        if (approval.status === 'pending') {
          // Notify all admins
          notifyAdminsOfNewPayment(approval);
        }
      }
    )
    .subscribe();
}

// Notify all admins of new payment
async function notifyAdminsOfNewPayment(approval) {
  try {
    const { data: admins, error } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('is_admin', true);
    
    if (error || !admins) return;
    
    for (const admin of admins) {
      if (admin.telegram_id) {
        const paymentMessage = [
          '🔔 **New Payment Request**',
          '',
          `👤 Investor: ${approval.customer_name || 'Unknown User'}`,
          `📞 Phone: ${approval.phone_number || 'N/A'}`,
          `💰 Amount: NPR ${approval.amount}`,
          `📱 Method: ${approval.payment_method}`,
          `⏰ Time: ${new Date(approval.created_at).toLocaleString()}`,
          approval.notes ? `📝 Notes: ${approval.notes}` : ''
        ].filter(Boolean).join('\n');

        bot.sendMessage(
          admin.telegram_id,
          paymentMessage,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Approve', callback_data: `approve_${approval.id}` },
                  { text: '❌ Reject', callback_data: `reject_${approval.id}` }
                ]
              ]
            }
          }
        );

        if (approval.payment_proof_url) {
          try {
            await bot.sendPhoto(admin.telegram_id, approval.payment_proof_url, {
              caption: `Payment proof for ${approval.customer_name || 'investor'}`
            });
          } catch (photoError) {
            console.error('Error sending payment proof to admin:', photoError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error notifying admins:', error);
  }
}

// Start subscription
subscribeToPaymentApprovals();

// Error handler
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('✅ Bot is listening for commands and payments...');
