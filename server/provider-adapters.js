const MIN_WITHDRAWAL_AMOUNT = 1000;

class WithdrawalProvider {
  constructor(name) {
    this.name = name;
  }

  async createWithdrawal() {
    throw new Error('Provider createWithdrawal not implemented.');
  }

  async getWithdrawalStatus() {
    throw new Error('Provider getWithdrawalStatus not implemented.');
  }

  async verifyWebhook() {
    throw new Error('Provider verifyWebhook not implemented.');
  }

  async validateAccount() {
    return { valid: true };
  }
}

class EsewaProvider extends WithdrawalProvider {
  constructor() {
    super('eSewa');
  }

  async createWithdrawal(payload) {
    if (!payload?.accountId) throw new Error('INVALID_ACCOUNT');
    return { ok: true, status: 'PENDING', provider: this.name, reference: `ES-${Date.now()}` };
  }
}

class KhaltiProvider extends WithdrawalProvider {
  constructor() {
    super('Khalti');
  }

  async createWithdrawal(payload) {
    if (!payload?.mobileNumber) throw new Error('INVALID_ACCOUNT');
    return { ok: true, status: 'PENDING', provider: this.name, reference: `KH-${Date.now()}` };
  }
}

const providers = {
  ESEWA: new EsewaProvider(),
  KHALTI: new KhaltiProvider(),
};

function getProvider(method) {
  return providers[method] || null;
}

module.exports = {
  WithdrawalProvider,
  EsewaProvider,
  KhaltiProvider,
  getProvider,
  MIN_WITHDRAWAL_AMOUNT,
};
