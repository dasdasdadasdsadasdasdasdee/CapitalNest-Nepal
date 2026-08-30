const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MIN_WITHDRAWAL_AMOUNT,
  calculateWalletBalance,
  isValidWithdrawalAmount,
  validateWithdrawalRequest,
  canTransitionWithdrawalStatus,
  calculateInvestmentReturn,
  calculateReferralRewards,
} = require('./financial-logic');

test('wallet balance sums income and subtracts expenses', () => {
  const summary = calculateWalletBalance([
    { type: 'DEPOSIT', amount: 5000 },
    { type: 'REFERRAL_REWARD', amount: 50 },
    { type: 'INVESTMENT', amount: 2000 },
    { type: 'WITHDRAWAL_APPROVED', amount: 1000 },
    { type: 'INVESTMENT_RETURN', amount: 250 },
  ]);

  assert.equal(summary.available, 2300);
  assert.equal(summary.invested, 2000);
  assert.equal(summary.totalEarned, 300);
  assert.equal(summary.totalWithdrawn, 1000);
});

test('matured investment returns add the principal and interest back to the wallet balance', () => {
  const summary = calculateWalletBalance([
    { type: 'DEPOSIT', amount: 5000 },
    { type: 'INVESTMENT', amount: 3000 },
    { type: 'INVESTMENT_RETURN', amount: 4200 },
  ]);

  assert.equal(summary.available, 6200);
  assert.equal(summary.invested, 3000);
  assert.equal(summary.totalEarned, 4200);
});

test('minimum withdrawal and balance checks are enforced', () => {
  assert.equal(isValidWithdrawalAmount(1500, 5000), 'Minimum withdrawal amount is NPR 2,000.');
  assert.equal(isValidWithdrawalAmount(6000, 5000), 'Your balance is insufficient.');
  assert.equal(isValidWithdrawalAmount(3000, 5000), true);
  assert.equal(MIN_WITHDRAWAL_AMOUNT, 2000);
});

test('withdrawal status transitions are validated', () => {
  assert.equal(canTransitionWithdrawalStatus('PENDING', 'UNDER_REVIEW'), true);
  assert.equal(canTransitionWithdrawalStatus('PENDING', 'REJECTED'), true);
  assert.equal(canTransitionWithdrawalStatus('APPROVED', 'PENDING'), false);
  assert.equal(canTransitionWithdrawalStatus('PAID', 'REJECTED'), false);
});

test('investment return calculation is correct', () => {
  assert.equal(calculateInvestmentReturn(10000, 5), 500);
  assert.equal(calculateInvestmentReturn(10000, 0), 0);
});

test('referral reward totals are computed', () => {
  assert.deepEqual(calculateReferralRewards(50, 50), { referrer: 50, referred: 50, total: 100 });
});

test('withdrawal validation enforces supported Nepal methods and wallet details', () => {
  assert.equal(validateWithdrawalRequest({ requestedAmount: 1500, availableBalance: 5000, method: 'ESEWA', accountDetails: '9850000000', walletName: 'Ram Shrestha', walletNumber: '9850000000' }), 'Minimum withdrawal amount is NPR 2,000.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 2500, method: 'KHALTI', accountDetails: '9812345678', walletName: 'Ram Shrestha', walletNumber: '9812345678' }), 'Your balance is insufficient.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 5000, method: 'BANK_TRANSFER', accountDetails: '12345', walletName: 'Ram Shrestha', walletNumber: '9850000000' }), 'Unsupported withdrawal method.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 5000, method: 'ESEWA', accountDetails: '', walletName: 'Ram Shrestha', walletNumber: '9850000000' }), 'Account details are required before requesting a withdrawal.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 5000, method: 'KHALTI', accountDetails: '9812345678', walletName: 'Ram Shrestha', walletNumber: '9812345678' }), true);
});
