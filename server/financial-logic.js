const MIN_WITHDRAWAL_AMOUNT = 2000;

const WITHDRAWAL_STATUS_TRANSITIONS = {
  PENDING: ['UNDER_REVIEW', 'REJECTED', 'APPROVED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'PROCESSING'],
  APPROVED: ['PROCESSING', 'PAID', 'REJECTED'],
  PROCESSING: ['PAID', 'REJECTED'],
  PAID: [],
  REJECTED: [],
};

function calculateWalletBalance(transactions = []) {
  let available = 0;
  let invested = 0;
  let totalEarned = 0;
  let totalWithdrawn = 0;

  for (const transaction of transactions) {
    const type = String(transaction.type || '').toUpperCase();
    const amount = Number(transaction.amount || 0);

    if (!Number.isFinite(amount)) continue;

    switch (type) {
      case 'DEPOSIT':
        available += amount;
        break;
      case 'INVESTMENT':
        available -= amount;
        invested += amount;
        break;
      case 'INVESTMENT_RETURN':
        available += amount;
        totalEarned += amount;
        break;
      case 'REFERRAL_REWARD':
      case 'REFERRAL_REWARD_REFERRER':
      case 'REFERRAL_REWARD_REFERRED_USER':
        available += amount;
        totalEarned += amount;
        break;
      case 'WITHDRAWAL_REQUEST':
      case 'WITHDRAWAL_APPROVED':
      case 'WITHDRAWAL_PAID':
        totalWithdrawn += amount;
        available -= amount;
        break;
      case 'WITHDRAWAL_REJECTED':
        available += amount;
        break;
      case 'REFUND':
        available += amount;
        break;
      case 'ADJUSTMENT':
        available += amount;
        break;
      default:
        if (amount > 0) {
          available += amount;
        }
        break;
    }
  }

  return {
    available: Number(available.toFixed(2)),
    invested: Number(invested.toFixed(2)),
    totalEarned: Number(totalEarned.toFixed(2)),
    totalWithdrawn: Number(totalWithdrawn.toFixed(2)),
  };
}

function isValidWithdrawalAmount(requestedAmount, availableBalance) {
  const numericRequested = Number(requestedAmount || 0);
  const numericAvailable = Number(availableBalance || 0);

  if (numericRequested < MIN_WITHDRAWAL_AMOUNT) {
    return `Minimum withdrawal amount is NPR ${MIN_WITHDRAWAL_AMOUNT.toLocaleString('en-US')}.`;
  }

  if (numericRequested > numericAvailable) {
    return 'Requested amount exceeds your available balance.';
  }

  return true;
}

function canTransitionWithdrawalStatus(currentStatus, nextStatus) {
  const current = String(currentStatus || '').toUpperCase();
  const next = String(nextStatus || '').toUpperCase();
  const allowed = WITHDRAWAL_STATUS_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

function calculateInvestmentReturn(investedAmount, percentage) {
  const amount = Number(investedAmount || 0);
  const rate = Number(percentage || 0);
  return Number(((amount * rate) / 100).toFixed(2));
}

function calculateReferralRewards(referrerReward = 50, referredReward = 50) {
  return {
    referrer: Number(referrerReward || 0),
    referred: Number(referredReward || 0),
    total: Number(((Number(referrerReward || 0) + Number(referredReward || 0))).toFixed(2)),
  };
}

module.exports = {
  MIN_WITHDRAWAL_AMOUNT,
  WITHDRAWAL_STATUS_TRANSITIONS,
  calculateWalletBalance,
  isValidWithdrawalAmount,
  canTransitionWithdrawalStatus,
  calculateInvestmentReturn,
  calculateReferralRewards,
};
