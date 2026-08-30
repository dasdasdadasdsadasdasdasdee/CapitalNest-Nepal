const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MIN_WITHDRAWAL_AMOUNT,
  calculateWalletBalance,
  isValidWithdrawalAmount,
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

test('minimum withdrawal and balance checks are enforced', () => {
  assert.equal(isValidWithdrawalAmount(1500, 5000), 'Minimum withdrawal amount is NPR 2,000.');
  assert.equal(isValidWithdrawalAmount(6000, 5000), 'Requested amount exceeds your available balance.');
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
