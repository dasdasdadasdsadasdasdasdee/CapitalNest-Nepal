(function () {
  const safeNumber = (value) => {
    const numericValue = Number(value ?? 0);
    return Number.isFinite(numericValue) ? numericValue : 0;
  };

  const normalizeString = (value) => String(value ?? '').trim().toLowerCase();

  const formatters = {
    NPR: new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'NPR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  };

  const state = {
    userId: null,
    summary: {
      walletBalance: 0,
      invested: 0,
      withdrawn: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalInvested: 0,
    },
    listeners: [],
    subscription: null,
  };

  function formatCurrency(amount) {
    return formatters.NPR.format(safeNumber(amount));
  }

  function getPurchaseAmount(record = {}) {
    const amount = Number(record.purchase_amount ?? record.amount ?? record.investment_amount ?? record.total_amount ?? record.invested_amount ?? 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }

  function getInvestmentIdentity(record = {}) {
    const referenceId = String(record.reference_id || record.referenceId || record.deposit_id || record.id || '').trim();
    const createdAtRaw = record.created_at || record.approved_at || record.started_at || record.date || '';
    const createdAt = createdAtRaw ? new Date(createdAtRaw).getTime() : 0;
    const createdAtBucket = Number.isFinite(createdAt) ? Math.floor(createdAt / (60 * 1000)) : 0;
    const amount = getPurchaseAmount(record);
    const planName = String(record.plan_name || record.investment_plan || record.name || record.note || 'Investment').trim() || 'Investment';
    const normalizedPlan = planName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim() || 'investment';
    const durationDays = Number(record.duration_days ?? record.duration ?? 0);
    const status = String(record.status || 'active').toLowerCase();

    if (referenceId) {
      return `${record.user_id || ''}|reference:${referenceId.toLowerCase()}`;
    }

    return `${record.user_id || ''}|${normalizedPlan}|${Number.isFinite(amount) ? amount : 0}|${Number.isFinite(durationDays) ? durationDays : 0}|${status}|${createdAtBucket}`;
  }

  function sumUniquePurchaseAmount(records = []) {
    const seen = new Set();
    let total = 0;

    records.forEach((record) => {
      if (!record) return;
      const status = normalizeString(record.status);
      if (['pending', 'rejected', 'failed'].includes(status)) return;
      const key = getInvestmentIdentity(record);
      if (seen.has(key)) return;
      seen.add(key);
      total += getPurchaseAmount(record);
    });

    return total;
  }

  function notifyListeners() {
    state.listeners.forEach((listener) => listener({ ...state.summary }));
  }

  function renderSummary(summary) {
    const primaryMap = {
      walletBalance: [
        'walletBalanceValue',
        'investmentWalletBalanceValue',
        'withdrawalWalletBalanceValue',
      ],
      invested: [
        'investedValue',
        'walletInvestedValue',
        'investmentInvestedValue',
        'withdrawalInvestedValue',
      ],
      withdrawn: [
        'withdrawnValue',
        'walletWithdrawnValue',
        'investmentWithdrawnValue',
        'withdrawalWithdrawnValue',
      ],
    };

    Object.entries(primaryMap).forEach(([metricKey, ids]) => {
      ids.forEach((id) => {
        const element = document.getElementById(id);
        if (!element) return;
        const value = summary[metricKey] ?? 0;
        element.textContent = formatCurrency(value);
        element.dataset.financeMetric = metricKey;
      });
    });

    document.querySelectorAll('[data-finance-metric]').forEach((element) => {
      const metricKey = element.dataset.financeMetric;
      if (!metricKey || !Object.hasOwn(summary, metricKey)) return;
      element.textContent = formatCurrency(summary[metricKey]);
    });
  }

  function getInvestmentEntryKey(entry = {}) {
    const status = normalizeString(entry.status || 'active');
    const createdAtRaw = entry.created_at || entry.approved_at || entry.started_at || entry.date || '';
    const createdAt = createdAtRaw ? new Date(createdAtRaw).getTime() : 0;
    const amount = safeNumber(entry.amount ?? entry.investment_amount ?? entry.total_amount ?? 0);
    const planName = String(
      entry.plan_name || entry.investment_plan || entry.name || entry.note || 'Investment'
    )
      .split(':')
      .pop()
      .trim() || 'Investment';
    const referenceId = entry.reference_id || entry.referenceId || entry.deposit_id || entry.id || '';
    const noteReference = String(entry.note || '').match(/Investment approved:\s*([a-f0-9-]+)/i)?.[1] || '';
    const uniqueKey = referenceId || noteReference || `${planName}|${amount}|${status}|${createdAt}`;
    return `${entry.user_id || ''}|${uniqueKey}`;
  }

  function calculateSummary({ transactions = [], investments = [], balanceRecord = null } = {}) {
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalInvested = 0;

    transactions.forEach((transaction) => {
      const type = normalizeString(transaction.type);
      const amount = safeNumber(transaction.amount);
      const status = normalizeString(transaction.status);

      if (['deposit', 'welcome_bonus', 'bonus', 'refund', 'profit', 'interest', 'topup', 'fund_wallet', 'referral_reward', 'referral_reward_referrer', 'referral_reward_referred_user'].includes(type)) {
        totalDeposits += amount;
      }

      if (['withdrawal', 'withdrawal_request', 'withdrawal_approved', 'withdrawal_paid'].includes(type)) {
        totalWithdrawals += amount;
      }

      if (['investment', 'invest'].includes(type) && !['pending', 'rejected', 'failed'].includes(status)) {
        // Intentionally ignored: invested amount must come from actual package purchase records only.
      }
    });

    totalInvested = sumUniquePurchaseAmount(investments);

    const availableBalance = Number(balanceRecord?.available_balance ?? NaN);
    const walletBalance = Number.isFinite(availableBalance)
      ? availableBalance
      : Math.max(totalDeposits - totalWithdrawals - totalInvested, 0);

    const summary = {
      walletBalance,
      invested: totalInvested,
      withdrawn: totalWithdrawals,
      totalDeposits,
      totalWithdrawals: totalWithdrawals,
      totalInvested,
    };

    state.summary = summary;
    renderSummary(summary);
    notifyListeners();
    return summary;
  }

  async function refreshFinancialSummary() {
    const supabase = window.CAPITALNEST_SUPABASE_CLIENT;
    if (!supabase) {
      return state.summary;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return state.summary;
    }

    state.userId = user.id;

    const queries = await Promise.all([
      supabase.from('wallet_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    const walletTransactions = queries[0]?.data || [];
    const transactionLedger = queries[1]?.data || [];
    const userInvestments = queries[2]?.data || [];
    const balanceRecord = null;
    const legacyInvestments = queries[3]?.data || [];
    const mergedTransactions = [...walletTransactions, ...transactionLedger].filter((transaction, index, list) => {
      const key = `${transaction.user_id}|${transaction.type}|${transaction.amount}|${transaction.created_at || ''}|${transaction.note || ''}`;
      return list.findIndex((candidate) => {
        const candidateKey = `${candidate.user_id}|${candidate.type}|${candidate.amount}|${candidate.created_at || ''}|${candidate.note || ''}`;
        return candidateKey === key;
      }) === index;
    });

    return calculateSummary({
      transactions: mergedTransactions,
      investments: [...userInvestments, ...legacyInvestments],
      balanceRecord,
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    state.listeners.push(listener);
    return () => {
      state.listeners = state.listeners.filter((item) => item !== listener);
    };
  }

  async function startRealtimeSync() {
    const supabase = window.CAPITALNEST_SUPABASE_CLIENT;
    if (!supabase || !state.userId) return;

    if (state.subscription) {
      await supabase.removeChannel(state.subscription);
      state.subscription = null;
    }

    state.subscription = supabase.channel('capitalnest-financial-sync');

    state.subscription
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${state.userId}` }, () => {
        refreshFinancialSummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${state.userId}` }, () => {
        refreshFinancialSummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_investments', filter: `user_id=eq.${state.userId}` }, () => {
        refreshFinancialSummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${state.userId}` }, () => {
        refreshFinancialSummary();
      })
      .subscribe();
  }

  async function start() {
    renderSummary(state.summary);
    const supabase = window.CAPITALNEST_SUPABASE_CLIENT;
    if (!supabase) return state.summary;

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return state.summary;

    state.userId = user.id;
    await refreshFinancialSummary();
    await startRealtimeSync();
    return state.summary;
  }

  window.CAPITALNEST_FINANCE = {
    formatCurrency,
    refreshFinancialSummary,
    start,
    subscribe,
    renderSummary,
    getSummary: () => ({ ...state.summary }),
    startRealtimeSync,
  };
})();
