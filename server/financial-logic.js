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
    return 'Your balance is insufficient.';
  }

  return true;
}

function validateWithdrawalRequest({ requestedAmount, availableBalance, method, accountDetails, walletName, walletNumber, requiresQr = false }) {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  const supportedMethods = ['ESEWA', 'KHALTI'];

  if (!supportedMethods.includes(normalizedMethod)) {
    return 'Unsupported withdrawal method.';
  }

  const amountValidation = isValidWithdrawalAmount(requestedAmount, availableBalance);
  if (amountValidation !== true) {
    return amountValidation;
  }

  const details = String(accountDetails || '').trim();
  if (!details) {
    return 'Account details are required before requesting a withdrawal.';
  }

  // Validate wallet name
  const nameValidation = validateWalletName(walletName);
  if (nameValidation !== true) {
    return nameValidation;
  }

  // Validate wallet number
  const numberValidation = validateWalletNumber(walletNumber, normalizedMethod);
  if (numberValidation !== true) {
    return numberValidation;
  }

  return true;
}

function validateWalletName(walletName) {
  const name = String(walletName || '').trim();
  
  if (!name) {
    return 'Wallet holder name is required.';
  }
  
  if (name.length < 2) {
    return 'Wallet holder name must be at least 2 characters.';
  }
  
  if (name.length > 50) {
    return 'Wallet holder name cannot exceed 50 characters.';
  }
  
  // Basic name validation - allow letters, spaces, hyphens
  if (!/^[a-zA-Z\s\-]{2,50}$/.test(name)) {
    return 'Wallet holder name contains invalid characters.';
  }
  
  return true;
}

function validateWalletNumber(walletNumber, method) {
  const number = String(walletNumber || '').trim();
  const normalizedMethod = String(method || '').toUpperCase();
  
  if (!number) {
    return 'Wallet number/account is required.';
  }
  
  if (normalizedMethod === 'ESEWA') {
    if (!/^\d{10}$/.test(number)) {
      return 'eSewa account must be exactly 10 digits.';
    }
  } else if (normalizedMethod === 'KHALTI') {
    const isValidPhone = /^\d{10}$/.test(number);
    const isValidEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(number);
    
    if (!isValidPhone && !isValidEmail) {
      return 'Khalti account must be 10 digits or valid email address.';
    }
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
  validateWithdrawalRequest,
  validateWalletName,
  validateWalletNumber,
  canTransitionWithdrawalStatus,
  calculateInvestmentReturn,
  calculateReferralRewards,
};
