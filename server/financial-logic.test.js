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
  generateReferralCode,
  normalizeReferralCode,
  isValidReferralCode,
  dedupeInvestmentRecords,
  buildInvestmentRecordKey,
} = require('./financial-logic');

const { normalizePaymentProofPath, buildPaymentProofUrl } = require('./telegram-bot');

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

test('welcome bonus is counted as incoming wallet credit', () => {
  const summary = calculateWalletBalance([
    { type: 'WELCOME_BONUS', amount: 50 },
    { type: 'DEPOSIT', amount: 100 },
    { type: 'WITHDRAWAL_APPROVED', amount: 20 },
  ]);

  assert.equal(summary.available, 130);
  assert.equal(summary.totalEarned, 50);
});

test('bonus credit entries are added to available wallet balance', () => {
  const summary = calculateWalletBalance([
    { type: 'BONUS', amount: 250 },
    { type: 'SIGNUP_BONUS', amount: 100 },
    { type: 'WITHDRAWAL_APPROVED', amount: 50 },
  ]);

  assert.equal(summary.available, 300);
  assert.equal(summary.totalEarned, 350);
});

test('referral code generation uses the live CN + 11-character format', () => {
  const code = generateReferralCode();
  assert.match(code, /^CN[A-Z0-9]{11}$/i);
  assert.equal(code.length, 13);
});

test('legacy CN referral codes remain accepted alongside the 7-digit format', () => {
  assert.equal(normalizeReferralCode('cn1234567'), 'CN1234567');
  assert.equal(isValidReferralCode('CN4B3F13D6476'), true);
  assert.equal(isValidReferralCode('CN1234567'), true);
  assert.equal(isValidReferralCode('1234567'), true);
  assert.equal(isValidReferralCode('abc'), false);
});

test('withdrawal validation enforces supported Nepal methods and wallet details', () => {
  assert.equal(validateWithdrawalRequest({ requestedAmount: 1500, availableBalance: 5000, method: 'ESEWA', accountDetails: '9850000000', walletName: 'Ram Shrestha', walletNumber: '9850000000' }), 'Minimum withdrawal amount is NPR 2,000.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 2500, method: 'KHALTI', accountDetails: '9812345678', walletName: 'Ram Shrestha', walletNumber: '9812345678' }), 'Your balance is insufficient.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 5000, method: 'BANK_TRANSFER', accountDetails: '12345', walletName: 'Ram Shrestha', walletNumber: '9850000000' }), 'Unsupported withdrawal method.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 5000, method: 'ESEWA', accountDetails: '', walletName: 'Ram Shrestha', walletNumber: '9850000000' }), 'Account details are required before requesting a withdrawal.');
  assert.equal(validateWithdrawalRequest({ requestedAmount: 3000, availableBalance: 5000, method: 'KHALTI', accountDetails: '9812345678', walletName: 'Ram Shrestha', walletNumber: '9812345678' }), true);
});

test('distinct purchase references are treated as separate investment records', () => {
  const records = [
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Starter',
      amount: 5000,
      purchase_amount: 5000,
      duration_days: 7,
      status: 'active',
      reference_id: '5C03AF15-F',
      created_at: '2026-08-30T15:17:00.000Z'
    },
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Starter',
      amount: 5000,
      purchase_amount: 5000,
      duration_days: 7,
      status: 'active',
      reference_id: '1CE89C02-6',
      created_at: '2026-08-30T15:17:00.000Z'
    },
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Growth',
      amount: 15000,
      purchase_amount: 15000,
      duration_days: 30,
      status: 'active',
      reference_id: '26C31E79-9',
      created_at: '2026-08-30T15:14:00.000Z'
    },
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Growth',
      amount: 15000,
      purchase_amount: 15000,
      duration_days: 30,
      status: 'active',
      reference_id: '86750D3E-2',
      created_at: '2026-08-30T15:14:00.000Z'
    }
  ];

  const deduped = dedupeInvestmentRecords(records);
  assert.equal(deduped.length, 4);
  assert.equal(deduped.reduce((sum, record) => sum + Number(record.purchase_amount ?? record.amount ?? 0), 0), 40000);
  assert.notEqual(buildInvestmentRecordKey(records[0]), buildInvestmentRecordKey(records[1]));
  assert.notEqual(buildInvestmentRecordKey(records[2]), buildInvestmentRecordKey(records[3]));
});

test('same deposit reference is deduplicated even when inserted more than once', () => {
  const records = [
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Starter',
      amount: 5000,
      purchase_amount: 5000,
      duration_days: 7,
      status: 'active',
      reference_id: '5C03AF15-F',
      created_at: '2026-08-30T15:17:00.000Z'
    },
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Starter',
      amount: 5000,
      purchase_amount: 5000,
      duration_days: 7,
      status: 'active',
      reference_id: '5C03AF15-F',
      created_at: '2026-08-30T15:29:00.000Z'
    }
  ];

  const deduped = dedupeInvestmentRecords(records);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].purchase_amount, 5000);
});

test('different package purchases with the same plan and amount remain separate', () => {
  const records = [
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Starter',
      amount: 5000,
      purchase_amount: 5000,
      duration_days: 7,
      status: 'active',
      reference_id: '5C03AF15-F',
      created_at: '2026-08-30T15:17:00.000Z'
    },
    {
      user_id: '11111111-1111-1111-1111-111111111111',
      plan_name: 'Starter',
      amount: 5000,
      purchase_amount: 5000,
      duration_days: 7,
      status: 'active',
      reference_id: '1CE89C02-6',
      created_at: '2026-08-30T15:29:00.000Z'
    }
  ];

  const deduped = dedupeInvestmentRecords(records);
  assert.equal(deduped.length, 2);
});

test('client-side active package deduplication keeps distinct purchases separate', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');

  const html = fs.readFileSync(path.join(__dirname, '..', 'user', 'index.html'), 'utf8');
  const start = html.indexOf('function getInvestmentIdentity(item) {');
  const end = html.indexOf('function generateReferralCode()');
  const script = html.slice(start, end);

  const context = {
    console,
    Number,
    String,
    Math,
    Date,
    Object,
    Array,
    Map,
  };

  vm.runInNewContext(`${script}
    const records = [
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        plan_name: 'Starter',
        amount: 5000,
        purchase_amount: 5000,
        duration_days: 7,
        status: 'active',
        reference_id: '5C03AF15-F',
        created_at: '2026-08-30T15:17:00.000Z'
      },
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        plan_name: 'Starter',
        amount: 5000,
        purchase_amount: 5000,
        duration_days: 7,
        status: 'active',
        reference_id: '1CE89C02-6',
        created_at: '2026-08-30T15:29:00.000Z'
      }
    ];
    const deduped = dedupeInvestments(records);
    if (deduped.length !== 2) {
      throw new Error('Expected two distinct package purchases, received ' + deduped.length);
    }
  `, context);
});

test('payment proof URL normalization strips duplicate bucket prefixes and invalid path fragments', () => {
  assert.equal(normalizePaymentProofPath('payment-proofs/abc123/file.png'), 'abc123/file.png');
  assert.equal(normalizePaymentProofPath('/payment-proofs/abc123/file.png'), 'abc123/file.png');
  assert.equal(normalizePaymentProofPath('https://mohigobcssqzywmhndml.supabase.co/storage/v1/object/public/payment-proofs/abc123/file.png'), 'abc123/file.png');
  assert.equal(normalizePaymentProofPath('https://mohigobcssqzywmhndml.supabase.co/storage/v1/object/public/payment-proofs/abc123/file.png?token=test'), 'abc123/file.png');
  assert.equal(normalizePaymentProofPath('https://mohigobcssqzywmhndml.supabase.co/storage/v1/object/sign/payment-proofs/payment-proofs/abc123/file.png?token=test'), 'abc123/file.png');
  assert.equal(normalizePaymentProofPath('https://mohigobcssqzywmhndml.supabase.co/storage/v1/object/public/payment-proofs/payment-proofs/3cbcb7a7-3b0f-41e1-a0e7-7940901de9b9/ESEWA-LOGO-8df99988-6483-4203-b16e-618b3c70fee6.webp'), '3cbcb7a7-3b0f-41e1-a0e7-7940901de9b9/ESEWA-LOGO-8df99988-6483-4203-b16e-618b3c70fee6.webp');
  assert.equal(normalizePaymentProofPath('https://mohigobcssqzywmhndml.supabase.co/storage/v1/object/public/payment-proofs/payment-proofs/'), '');
  assert.equal(normalizePaymentProofPath('public/payment-proofs/public/abc123/file.png'), 'abc123/file.png');

  const url = buildPaymentProofUrl('payment-proofs/abc123/file.png');
  assert.match(url, /^https:\/\/mohigobcssqzywmhndml\.supabase\.co\/storage\/v1\/object\/public\/payment-proofs\/abc123\/file\.png$/);
  assert.equal(buildPaymentProofUrl('https://mohigobcssqzywmhndml.supabase.co/storage/v1/object/public/payment-proofs/payment-proofs/'), '');
});
