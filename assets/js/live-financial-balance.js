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

  function calculateSummary({ transactions = [], investments = [], balanceRecord = null } = {}) {
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalInvested = 0;

    transactions.forEach((transaction) => {
      const type = normalizeString(transaction.type);
      const amount = safeNumber(transaction.amount);

      if (['deposit', 'welcome_bonus', 'bonus', 'refund', 'profit', 'interest', 'topup', 'fund_wallet'].includes(type)) {
        totalDeposits += amount;
      }

      if (type === 'withdrawal') {
        totalWithdrawals += amount;
      }

      if (type === 'investment' && !['pending', 'rejected', 'failed'].includes(normalizeString(transaction.status))) {
        totalInvested += amount;
      }
    });

    investments.forEach((investment) => {
      const status = normalizeString(investment.status);
      if (!['pending', 'rejected', 'failed'].includes(status)) {
        totalInvested += safeNumber(investment.amount ?? investment.investment_amount);
      }
    });

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
      supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('investments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    const transactions = queries[0]?.data || [];
    const userInvestments = queries[1]?.data || [];
    const balanceRecord = null;
    const legacyInvestments = queries[2]?.data || [];

    return calculateSummary({
      transactions,
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
