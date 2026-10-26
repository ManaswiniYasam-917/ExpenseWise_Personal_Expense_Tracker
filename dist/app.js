/**
 * ExpenseWise — Advanced Personal Finance & Expense Tracker
 * High-performance, robust frontend logic with dual backend support:
 * 1. FastAPI + SQLite backend (when running locally)
 * 2. High-fidelity persistent client store (when running in standalone / Vercel cloud)
 */

// Application State
const STATE = {
  apiBase: 'http://127.0.0.1:8000/api',
  isBackendAvailable: false,
  token: localStorage.getItem('ew_token') || '',
  user: JSON.parse(localStorage.getItem('ew_user') || 'null'),
  currency: localStorage.getItem('ew_currency') || 'INR',
  theme: localStorage.getItem('ew_theme') || 'light',
  currentView: 'dashboard',
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  recurring: [],
  insights: [],
  charts: {
    category: null,
    daily: null
  },
  pendingImportRows: []
};

// Currency configurations
const CURRENCIES = {
  INR: { locale: 'en-IN', currency: 'INR', symbol: '₹' },
  USD: { locale: 'en-US', currency: 'USD', symbol: '$' },
  EUR: { locale: 'de-DE', currency: 'EUR', symbol: '€' },
  GBP: { locale: 'en-GB', currency: 'GBP', symbol: '£' }
};

// Default category icons
const CATEGORY_ICONS = {
  'Food': '🍔',
  'Transport': '🚗',
  'Shopping': '🛍️',
  'Bills': '💡',
  'Health': '🏥',
  'Education': '🎓',
  'Entertainment': '🎬',
  'Rent': '🏠',
  'Other': '📦',
  'Salary': '💼',
  'Freelance': '💻',
  'Gift': '🎁',
  'Other income': '💰'
};

/* ============================================================
   UTILITY & FORMATTING FUNCTIONS
   ============================================================ */
function formatMoney(amount) {
  const conf = CURRENCIES[STATE.currency] || CURRENCIES.INR;
  const num = Number(amount) || 0;
  return new Intl.NumberFormat(conf.locale, {
    style: 'currency',
    currency: conf.currency,
    maximumFractionDigits: 2
  }).format(num);
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 350);
  }, 4500);
}

/* ============================================================
   PERSISTENT CLIENT-SIDE DATA STORE (Offline / Vercel Fallback)
   ============================================================ */
const ClientStore = {
  getKey(name) {
    const uid = STATE.user ? STATE.user.id : 'guest';
    return `ew_${uid}_${name}`;
  },

  getData(name, defaultVal = []) {
    try {
      const raw = localStorage.getItem(this.getKey(name));
      return raw ? JSON.parse(raw) : defaultVal;
    } catch {
      return defaultVal;
    }
  },

  setData(name, data) {
    try {
      localStorage.setItem(this.getKey(name), JSON.stringify(data));
    } catch (e) {
      console.warn('Storage quota error', e);
    }
  },

  initUserCategories(userId) {
    const defaultCats = [
      { id: 1, name: 'Food', type: 'expense', is_default: 1 },
      { id: 2, name: 'Transport', type: 'expense', is_default: 1 },
      { id: 3, name: 'Shopping', type: 'expense', is_default: 1 },
      { id: 4, name: 'Bills', type: 'expense', is_default: 1 },
      { id: 5, name: 'Health', type: 'expense', is_default: 1 },
      { id: 6, name: 'Education', type: 'expense', is_default: 1 },
      { id: 7, name: 'Entertainment', type: 'expense', is_default: 1 },
      { id: 8, name: 'Rent', type: 'expense', is_default: 1 },
      { id: 9, name: 'Other', type: 'expense', is_default: 1 },
      { id: 10, name: 'Salary', type: 'income', is_default: 1 },
      { id: 11, name: 'Freelance', type: 'income', is_default: 1 },
      { id: 12, name: 'Gift', type: 'income', is_default: 1 },
      { id: 13, name: 'Other income', type: 'income', is_default: 1 }
    ];
    const key = `ew_${userId}_categories`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify(defaultCats));
    }
  }
};

/* ============================================================
   API / DATA ACCESS LAYER (FastAPI with Automatic Fallback)
   ============================================================ */
async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${STATE.apiBase}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      STATE.isBackendAvailable = true;
      updateBackendStatusBadge(true);
      return true;
    }
  } catch {
    STATE.isBackendAvailable = false;
  }
  updateBackendStatusBadge(false);
  return false;
}

function updateBackendStatusBadge(connected) {
  const dot = document.getElementById('backendStatusDot');
  const title = document.getElementById('backendStatusTitle');
  const sub = document.getElementById('backendStatusSub');
  const footerPill = document.getElementById('footerConnectionPill');

  if (connected) {
    if (dot) dot.className = 'status-indicator-dot';
    if (title) title.textContent = 'Backend: Connected';
    if (sub) sub.textContent = 'FastAPI + SQLite DB';
    if (footerPill) {
      footerPill.textContent = '🟢 Backend: Connected (SQLite)';
      footerPill.style.color = 'var(--success)';
    }
  } else {
    if (dot) dot.className = 'status-indicator-dot offline';
    if (title) title.textContent = 'Cloud Local Store';
    if (sub) sub.textContent = 'Instant persistence';
    if (footerPill) {
      footerPill.textContent = '☁️ Storage: Local Cloud Store (Offline-Ready)';
      footerPill.style.color = 'var(--text-muted)';
    }
  }
}

async function request(endpoint, options = {}) {
  // If backend is active, attempt direct HTTP request
  if (STATE.isBackendAvailable) {
    try {
      const headers = { ...(options.headers || {}) };
      if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;
      if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }

      const res = await fetch(`${STATE.apiBase}${endpoint}`, { ...options, headers });
      if (res.status === 401) {
        logout(false);
        throw new Error('Session expired. Please sign in again.');
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error (${res.status})`);
      }
      if (res.status === 204) return null;
      return await res.json();
    } catch (err) {
      console.warn('API error, using client fallback:', err.message);
      // If network fails unexpectedly, fall through to client store
    }
  }

  // Fallback: Persistent Client Engine
  return await handleClientEngineRequest(endpoint, options);
}

/* ============================================================
   CLIENT ENGINE (Full Mock Implementation for Cloud/Vercel)
   ============================================================ */
async function handleClientEngineRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(`http://dummy${endpoint}`);
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  // Small delay to simulate smooth network response
  await new Promise(r => setTimeout(r, 60));

  // --- Auth endpoints ---
  if (pathname === '/auth/login' && method === 'POST') {
    const { email, password } = options.body;
    let users = JSON.parse(localStorage.getItem('ew_global_users') || '[]');
    let user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    
    // Auto-create demo user if signing in with demo email
    if (!user && (email.includes('demo') || email.includes('admin') || email.includes('manaswini'))) {
      user = { id: Date.now(), name: 'Manaswini Yasam', email: email.trim().toLowerCase() };
      users.push(user);
      localStorage.setItem('ew_global_users', JSON.stringify(users));
      ClientStore.initUserCategories(user.id);
    }

    if (!user) {
      throw new Error('Account not found. Please create an account or use 1-Click Demo.');
    }

    const token = 'demo_token_' + btoa(`${user.id}:${Date.now()}`);
    return { token, user };
  }

  if (pathname === '/auth/register' && method === 'POST') {
    const { name, email, password } = options.body;
    let users = JSON.parse(localStorage.getItem('ew_global_users') || '[]');
    if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      throw new Error('Email already registered.');
    }
    const user = { id: Date.now(), name: name.trim(), email: email.trim().toLowerCase() };
    users.push(user);
    localStorage.setItem('ew_global_users', JSON.stringify(users));
    ClientStore.initUserCategories(user.id);
    const token = 'demo_token_' + btoa(`${user.id}:${Date.now()}`);
    return { token, user };
  }

  if (pathname === '/me') {
    return { user: STATE.user };
  }

  // Ensure user categories exist
  if (STATE.user) {
    ClientStore.initUserCategories(STATE.user.id);
  }

  // --- Categories ---
  if (pathname === '/categories') {
    if (method === 'GET') {
      return ClientStore.getData('categories', []);
    }
    if (method === 'POST') {
      const cats = ClientStore.getData('categories', []);
      const newCat = {
        id: Date.now(),
        name: options.body.name.trim(),
        type: options.body.type,
        is_default: 0
      };
      cats.push(newCat);
      ClientStore.setData('categories', cats);
      return newCat;
    }
  }

  // --- Transactions ---
  if (pathname === '/transactions') {
    let txs = ClientStore.getData('transactions', []);

    if (method === 'GET') {
      const type = searchParams.get('type');
      const category = searchParams.get('category');
      const start = searchParams.get('start');
      const end = searchParams.get('end');
      const q = searchParams.get('q');

      let filtered = [...txs];
      if (type) filtered = filtered.filter(t => t.type === type);
      if (category) filtered = filtered.filter(t => (t.category || '').toLowerCase() === category.toLowerCase());
      if (start) filtered = filtered.filter(t => t.transaction_date >= start);
      if (end) filtered = filtered.filter(t => t.transaction_date <= end);
      if (q) {
        const query = q.toLowerCase();
        filtered = filtered.filter(t =>
          (t.note || '').toLowerCase().includes(query) ||
          (t.category || '').toLowerCase().includes(query) ||
          (t.payment_method || '').toLowerCase().includes(query)
        );
      }
      filtered.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id);
      return filtered;
    }

    if (method === 'POST') {
      const newTx = {
        id: Date.now(),
        type: options.body.type,
        amount: Number(options.body.amount),
        transaction_date: options.body.transaction_date,
        category: options.body.category || 'Other',
        payment_method: options.body.payment_method || 'Other',
        note: options.body.note || '',
        created_at: new Date().toISOString()
      };
      txs.unshift(newTx);
      ClientStore.setData('transactions', txs);
      return newTx;
    }
  }

  // Patch / Delete Transaction
  const txMatch = pathname.match(/^\/transactions\/(\d+)$/);
  if (txMatch) {
    const id = Number(txMatch[1]);
    let txs = ClientStore.getData('transactions', []);

    if (method === 'PATCH') {
      const idx = txs.findIndex(t => t.id === id);
      if (idx === -1) throw new Error('Transaction not found');
      txs[idx] = { ...txs[idx], ...options.body, amount: Number(options.body.amount) };
      ClientStore.setData('transactions', txs);
      return txs[idx];
    }

    if (method === 'DELETE') {
      txs = txs.filter(t => t.id !== id);
      ClientStore.setData('transactions', txs);
      return { deleted: true };
    }
  }

  // --- Dashboard Summary ---
  if (pathname === '/dashboard/summary') {
    const txs = ClientStore.getData('transactions', []);
    const goals = ClientStore.getData('goals', []);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${curYear}-${curMonth}`;

    const monthTxs = txs.filter(t => t.transaction_date && t.transaction_date.startsWith(monthPrefix));

    let income = 0;
    let expense = 0;
    const catMap = {};
    const dailyMap = {};

    monthTxs.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        income += amt;
      } else {
        expense += amt;
        catMap[t.category] = (catMap[t.category] || 0) + amt;
      }

      if (!dailyMap[t.transaction_date]) {
        dailyMap[t.transaction_date] = { transaction_date: t.transaction_date, income: 0, expense: 0 };
      }
      if (t.type === 'income') dailyMap[t.transaction_date].income += amt;
      else dailyMap[t.transaction_date].expense += amt;
    });

    const categories = Object.entries(catMap)
      .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    const daily = Object.values(dailyMap).sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    const recent = [...txs].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id).slice(0, 6);

    const activeGoals = goals.filter(g => g.status === 'active');
    const savedSum = activeGoals.reduce((s, g) => s + (Number(g.current_amount) || 0), 0);
    const targetSum = activeGoals.reduce((s, g) => s + (Number(g.target_amount) || 0), 0);

    return {
      period: { month: now.getMonth() + 1, year: curYear },
      totals: {
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        balance: Math.round((income - expense) * 100) / 100
      },
      categories,
      daily,
      recent,
      goals: {
        count: activeGoals.length,
        saved: Math.round(savedSum * 100) / 100,
        target: Math.round(targetSum * 100) / 100
      }
    };
  }

  // --- Budgets ---
  if (pathname === '/budgets') {
    let budgets = ClientStore.getData('budgets', []);
    const txs = ClientStore.getData('transactions', []);
    const now = new Date();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curYear = String(now.getFullYear());

    if (method === 'GET') {
      return budgets.map(b => {
        let spent = 0;
        txs.forEach(t => {
          if (t.type === 'expense' && t.transaction_date) {
            const parts = t.transaction_date.split('-');
            if (parts[0] === String(b.year) && parts[1] === String(b.month).padStart(2, '0')) {
              if (!b.category || b.category === t.category) {
                spent += Number(t.amount) || 0;
              }
            }
          }
        });
        const lim = b.limit_amount;
        const pct = lim > 0 ? Math.round((spent / lim) * 100) : 0;
        return {
          id: b.id,
          category: b.category,
          month: b.month,
          year: b.year,
          limit_amount: lim,
          spent: Math.round(spent * 100) / 100,
          remaining: Math.round((lim - spent) * 100) / 100,
          percent: pct,
          threshold_percent: b.threshold_percent || 80
        };
      });
    }

    if (method === 'POST') {
      const idx = budgets.findIndex(b => b.category === options.body.category && b.month === options.body.month && b.year === options.body.year);
      if (idx !== -1) {
        budgets[idx] = { ...budgets[idx], ...options.body };
      } else {
        budgets.push({ id: Date.now(), ...options.body });
      }
      ClientStore.setData('budgets', budgets);
      return budgets;
    }
  }

  const budgetMatch = pathname.match(/^\/budgets\/(\d+)$/);
  if (budgetMatch && method === 'DELETE') {
    const id = Number(budgetMatch[1]);
    let budgets = ClientStore.getData('budgets', []);
    budgets = budgets.filter(b => b.id !== id);
    ClientStore.setData('budgets', budgets);
    return { deleted: true };
  }

  // --- Goals ---
  if (pathname === '/goals') {
    let goals = ClientStore.getData('goals', []);
    if (method === 'GET') return goals;

    if (method === 'POST') {
      const newGoal = {
        id: Date.now(),
        title: options.body.title.trim(),
        target_amount: Number(options.body.target_amount),
        current_amount: Number(options.body.current_amount || 0),
        target_date: options.body.target_date || null,
        status: (Number(options.body.current_amount || 0) >= Number(options.body.target_amount)) ? 'completed' : 'active',
        created_at: new Date().toISOString()
      };
      goals.unshift(newGoal);
      ClientStore.setData('goals', goals);
      return newGoal;
    }
  }

  const goalMatch = pathname.match(/^\/goals\/(\d+)$/);
  if (goalMatch) {
    const id = Number(goalMatch[1]);
    let goals = ClientStore.getData('goals', []);

    if (method === 'PATCH') {
      const idx = goals.findIndex(g => g.id === id);
      if (idx === -1) throw new Error('Goal not found');
      goals[idx] = {
        ...goals[idx],
        ...options.body,
        current_amount: options.body.current_amount !== undefined ? Number(options.body.current_amount) : goals[idx].current_amount
      };
      if (goals[idx].current_amount >= goals[idx].target_amount) {
        goals[idx].status = 'completed';
      }
      ClientStore.setData('goals', goals);
      return goals[idx];
    }

    if (method === 'DELETE') {
      goals = goals.filter(g => g.id !== id);
      ClientStore.setData('goals', goals);
      return { deleted: true };
    }
  }

  // --- Recurring Rules ---
  if (pathname === '/recurring') {
    let recurring = ClientStore.getData('recurring', []);
    if (method === 'GET') return recurring;
    if (method === 'POST') {
      const newRule = {
        id: Date.now(),
        type: options.body.type,
        amount: Number(options.body.amount),
        category: options.body.category || 'Other',
        frequency: options.body.frequency,
        next_run_date: options.body.next_run_date,
        payment_method: options.body.payment_method || 'Other',
        note: options.body.note || '',
        active: 1
      };
      recurring.push(newRule);
      ClientStore.setData('recurring', recurring);
      return newRule;
    }
  }

  if (pathname === '/recurring/process-due' && method === 'POST') {
    let recurring = ClientStore.getData('recurring', []);
    let txs = ClientStore.getData('transactions', []);
    const today = todayDateStr();
    let createdCount = 0;

    recurring.forEach(r => {
      if (r.active && r.next_run_date <= today) {
        txs.unshift({
          id: Date.now() + Math.random(),
          type: r.type,
          amount: r.amount,
          transaction_date: r.next_run_date,
          category: r.category,
          payment_method: r.payment_method,
          note: `[Auto-Recurring] ${r.note || r.category}`,
          created_at: new Date().toISOString()
        });
        createdCount++;

        // Advance next_run_date
        const d = new Date(r.next_run_date);
        if (r.frequency === 'weekly') d.setDate(d.getDate() + 7);
        else if (r.frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
        r.next_run_date = d.toISOString().slice(0, 10);
      }
    });

    if (createdCount > 0) {
      ClientStore.setData('transactions', txs);
      ClientStore.setData('recurring', recurring);
    }
    return { created: createdCount, message: `Processed ${createdCount} due transaction(s).` };
  }

  // --- Insights ---
  if (pathname === '/insights') {
    const txs = ClientStore.getData('transactions', []);
    const budgets = ClientStore.getData('budgets', []);
    const insights = [];

    const now = new Date();
    const curMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthPrefix = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    let curExpense = 0;
    let prevExpense = 0;
    let curIncome = 0;
    const catTotals = {};

    txs.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.transaction_date.startsWith(curMonthPrefix)) {
        if (t.type === 'expense') {
          curExpense += amt;
          catTotals[t.category] = (catTotals[t.category] || 0) + amt;
        } else {
          curIncome += amt;
        }
      } else if (t.transaction_date.startsWith(prevMonthPrefix) && t.type === 'expense') {
        prevExpense += amt;
      }
    });

    if (curExpense === 0 && curIncome === 0) {
      insights.push({
        type: 'info',
        title: 'Start Tracking Your Finances',
        message: 'Add transactions or load the demo dataset to unlock personalized financial insights and trends.'
      });
    }

    if (prevExpense > 0 && curExpense > 0) {
      const diffPct = ((curExpense - prevExpense) / prevExpense) * 100;
      const isHigher = diffPct > 0;
      insights.push({
        type: diffPct > 15 ? 'warning' : 'success',
        title: 'Month-over-Month Spending Velocity',
        message: `Your spending this month is ${Math.abs(diffPct).toFixed(1)}% ${isHigher ? 'higher' : 'lower'} than this time last month.`
      });
    }

    // Top Category
    const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
    if (topCat) {
      insights.push({
        type: 'info',
        title: 'Top Spending Category',
        message: `${topCat[0]} represents your highest expense this month at ${formatMoney(topCat[1])}.`
      });
    }

    // Savings Rate
    if (curIncome > 0) {
      const savingsRate = Math.round(((curIncome - curExpense) / curIncome) * 100);
      insights.push({
        type: savingsRate >= 20 ? 'success' : 'warning',
        title: 'Monthly Savings Rate',
        message: `You are saving ${savingsRate}% of your income this month. ${savingsRate >= 20 ? 'Great job building wealth!' : 'Consider trimming discretionary expenses.'}`
      });
    }

    insights.push({
      type: 'info',
      title: 'About These Insights',
      message: 'Mathematical and rule-based observations computed entirely from your records; safe, private, and deterministic.'
    });

    return { insights };
  }

  throw new Error(`Endpoint ${endpoint} not supported in client store.`);
}

/* ============================================================
   AUTHENTICATION LOGIC
   ============================================================ */
function switchAuthTab(mode) {
  const tabIn = document.getElementById('tabSignIn');
  const tabUp = document.getElementById('tabSignUp');
  const formIn = document.getElementById('loginForm');
  const formUp = document.getElementById('registerForm');

  if (mode === 'signin') {
    tabIn.classList.add('active');
    tabUp.classList.remove('active');
    formIn.style.display = 'flex';
    formUp.style.display = 'none';
  } else {
    tabUp.classList.add('active');
    tabIn.classList.remove('active');
    formUp.style.display = 'flex';
    formIn.style.display = 'none';
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('loginSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const payload = {
      email: form.email.value.trim(),
      password: form.password.value
    };
    const res = await request('/auth/login', { method: 'POST', body: payload });
    setAuthSession(res);
    showToast(`Welcome back, ${res.user.name}!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In to Dashboard →';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('registerSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';

  try {
    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value
    };
    const res = await request('/auth/register', { method: 'POST', body: payload });
    setAuthSession(res);
    showToast(`Account created! Welcome, ${res.user.name}.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Free Account →';
  }
}

function handleQuickDemoLogin() {
  const demoUser = {
    id: 917,
    name: 'Manaswini Yasam',
    email: 'demo@expensewise.com'
  };
  const token = 'demo_token_' + btoa('917:exp');
  setAuthSession({ token, user: demoUser });

  // If new or empty demo session, auto-seed realistic demo data
  const existing = ClientStore.getData('transactions', []);
  if (existing.length === 0) {
    seedSampleData(false);
  }
  showToast('Logged in as Demo User with preloaded records!', 'success');
}

function setAuthSession(data) {
  STATE.token = data.token;
  STATE.user = data.user;
  localStorage.setItem('ew_token', STATE.token);
  localStorage.setItem('ew_user', JSON.stringify(STATE.user));

  document.getElementById('authPortal').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';

  updateUserLabels();
  loadAllViews();
}

function logout(notify = true) {
  STATE.token = '';
  STATE.user = null;
  localStorage.removeItem('ew_token');
  localStorage.removeItem('ew_user');

  document.getElementById('authPortal').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';

  if (notify) showToast('You have signed out.', 'info');
}

function updateUserLabels() {
  if (!STATE.user) return;
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('userNameLabel');
  const email = document.getElementById('userEmailLabel');

  if (avatar) avatar.textContent = (STATE.user.name || 'U').charAt(0).toUpperCase();
  if (name) name.textContent = STATE.user.name || 'User';
  if (email) email.textContent = STATE.user.email || 'user@example.com';
}

/* ============================================================
   NAVIGATION & THEME
   ============================================================ */
function navigateTo(viewName) {
  STATE.currentView = viewName;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Toggle view sections
  document.querySelectorAll('.app-view').forEach(view => {
    view.style.display = view.id === `view-${viewName}` ? 'block' : 'none';
  });

  // Update header titles
  const titles = {
    dashboard: { section: 'Overview', title: 'Dashboard', heading: 'Financial Overview' },
    transactions: { section: 'Management', title: 'Transactions', heading: 'Transaction History' },
    budgets: { section: 'Planning', title: 'Budgets', heading: 'Monthly Budgets & Limits' },
    goals: { section: 'Milestones', title: 'Savings Goals', heading: 'Savings Targets & Wealth' },
    recurring: { section: 'Automation', title: 'Recurring Rules', heading: 'Scheduled Transactions' },
    insights: { section: 'Analytics', title: 'Smart Insights', heading: 'Spending Insights & Reports' },
    categories: { section: 'System', title: 'Categories & Tools', heading: 'Settings & Data Tools' }
  };

  const info = titles[viewName] || titles.dashboard;
  const bSect = document.getElementById('breadcrumbSection');
  const hTitle = document.getElementById('headerTitle');
  const pHead = document.getElementById('pageMainHeading');

  if (bSect) bSect.textContent = info.section;
  if (hTitle) hTitle.textContent = info.title;
  if (pHead) pHead.textContent = info.heading;

  // Close mobile sidebar if open
  closeMobileSidebar();

  // Refresh view specific components
  if (viewName === 'transactions') filterTransactions();
  if (viewName === 'budgets') loadBudgets();
  if (viewName === 'goals') loadGoals();
  if (viewName === 'recurring') loadRecurring();
  if (viewName === 'insights') loadInsights();
  if (viewName === 'categories') loadCategoriesView();
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  sidebar.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('open');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

function toggleTheme() {
  STATE.theme = STATE.theme === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', STATE.theme);
  localStorage.setItem('ew_theme', STATE.theme);

  const icon = document.getElementById('themeIcon');
  if (icon) icon.textContent = STATE.theme === 'dark' ? '☀️' : '🌙';

  // Re-render charts with updated color theme
  if (STATE.currentView === 'dashboard') {
    renderDashboardCharts();
  }
}

function changeCurrency(curr) {
  STATE.currency = curr;
  localStorage.setItem('ew_currency', curr);
  loadAllViews();
  showToast(`Currency changed to ${curr}`, 'info');
}

/* ============================================================
   DATA LOADING ORCHESTRATION
   ============================================================ */
async function loadAllViews() {
  try {
    await loadCategories();
    await Promise.all([
      loadDashboard(),
      loadTransactions(),
      loadBudgets(),
      loadGoals(),
      loadRecurring()
    ]);
  } catch (err) {
    console.error('Error loading views:', err);
  }
}

/* ============================================================
   VIEW 1: DASHBOARD LOGIC
   ============================================================ */
async function loadDashboard() {
  try {
    const data = await request('/dashboard/summary');
    
    // Update Stat Cards
    const incEl = document.getElementById('dashTotalIncome');
    const expEl = document.getElementById('dashTotalExpense');
    const balEl = document.getElementById('dashNetBalance');
    const gSavedEl = document.getElementById('dashGoalsSaved');
    const gCountEl = document.getElementById('dashActiveGoalsCount');
    const gPctEl = document.getElementById('dashGoalsPercent');

    if (incEl) incEl.textContent = formatMoney(data.totals.income);
    if (expEl) expEl.textContent = formatMoney(data.totals.expense);
    if (balEl) {
      balEl.textContent = formatMoney(data.totals.balance);
      balEl.style.color = data.totals.balance >= 0 ? 'var(--success)' : 'var(--danger)';
    }
    if (gSavedEl) gSavedEl.textContent = formatMoney(data.goals.saved || 0);
    if (gCountEl) gCountEl.textContent = data.goals.count || 0;
    if (gPctEl) {
      const pct = data.goals.target > 0 ? Math.round((data.goals.saved / data.goals.target) * 100) : 0;
      gPctEl.textContent = `${pct}% target`;
    }

    // Render Recent Transactions
    renderDashRecentTable(data.recent || []);

    // Render Charts
    renderCategoryChart(data.categories || []);
    renderDailyChart(data.daily || []);

    // Populate Category Count
    const catCount = document.getElementById('categoryChartCount');
    if (catCount) catCount.textContent = `${(data.categories || []).length} Categories`;

  } catch (err) {
    console.error('Dashboard load error', err);
  }
}

function renderDashRecentTable(rows) {
  const tbody = document.getElementById('dashRecentTxBody');
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No recent transactions. Record one above!</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const isIncome = r.type === 'income';
    const icon = CATEGORY_ICONS[r.category] || '🏷️';
    return `
      <tr>
        <td><strong>${escapeHtml(r.transaction_date)}</strong></td>
        <td><span class="pill pill-category">${icon} ${escapeHtml(r.category || 'Other')}</span></td>
        <td>${escapeHtml(r.note || '—')}</td>
        <td><span class="pill pill-method">${escapeHtml(r.payment_method || 'Other')}</span></td>
        <td class="text-right ${isIncome ? 'amount-income' : 'amount-expense'}">
          ${isIncome ? '+' : '-'}${formatMoney(r.amount)}
        </td>
      </tr>
    `;
  }).join('');
}

function renderCategoryChart(categories) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  if (STATE.charts.category) {
    STATE.charts.category.destroy();
  }

  const isDark = STATE.theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  if (!categories || categories.length === 0) {
    STATE.charts.category = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No Expenses Recorded'],
        datasets: [{
          data: [1],
          backgroundColor: [isDark ? '#1e293b' : '#e2e8f0'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor } },
          tooltip: { enabled: false }
        }
      }
    });
    return;
  }

  const vibrantPalette = [
    '#0f766e', '#14b8a6', '#0284c7', '#38bdf8', '#8b5cf6',
    '#ec4899', '#f59e0b', '#10b981', '#64748b', '#f43f5e'
  ];

  STATE.charts.category = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories.map(c => `${CATEGORY_ICONS[c.name] || ''} ${c.name}`),
      datasets: [{
        data: categories.map(c => c.total),
        backgroundColor: vibrantPalette.slice(0, categories.length),
        borderWidth: 2,
        borderColor: isDark ? '#111827' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor, boxWidth: 12, padding: 14 }
        },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${formatMoney(item.raw)}`
          }
        }
      }
    }
  });
}

function renderDailyChart(daily) {
  const ctx = document.getElementById('dailyChart');
  if (!ctx) return;

  if (STATE.charts.daily) {
    STATE.charts.daily.destroy();
  }

  const isDark = STATE.theme === 'dark';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  const labels = daily.map(d => d.transaction_date.slice(8));
  const incomeData = daily.map(d => d.income);
  const expenseData = daily.map(d => d.expense);

  STATE.charts.daily = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          borderWidth: 2.5
        },
        {
          label: 'Expenses',
          data: expenseData,
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.08)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.dataset.label}: ${formatMoney(item.raw)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            callback: (v) => formatMoney(v)
          }
        }
      }
    }
  });
}

/* ============================================================
   CATEGORIES MANAGEMENT
   ============================================================ */
async function loadCategories() {
  try {
    const cats = await request('/categories');
    STATE.categories = cats || [];
    populateCategoryDropdowns();
  } catch (err) {
    console.error('Error loading categories', err);
  }
}

function populateCategoryDropdowns() {
  const quickSelect = document.getElementById('quickTxCategory');
  const modalSelect = document.getElementById('modalTxCategory');
  const budgetSelect = document.getElementById('budgetCategorySelect');
  const filterSelect = document.getElementById('filterCategory');
  const recSelect = document.getElementById('recCategorySelect');

  const quickType = document.getElementById('quickTxType')?.value || 'expense';
  updateQuickCategories(quickType);

  const modalType = document.getElementById('modalTxType')?.value || 'expense';
  updateModalCategories(modalType);

  const recType = document.getElementById('recTypeSelect')?.value || 'expense';
  updateRecCategories(recType);

  // Budget category select (Expense only)
  if (budgetSelect) {
    const expCats = STATE.categories.filter(c => c.type === 'expense');
    budgetSelect.innerHTML = `
      <option value="">🌐 Overall Monthly Budget (All Expenses)</option>
      ${expCats.map(c => `<option value="${escapeHtml(c.name)}">${CATEGORY_ICONS[c.name] || '🏷️'} ${escapeHtml(c.name)}</option>`).join('')}
    `;
  }

  // Filter category select (All)
  if (filterSelect) {
    filterSelect.innerHTML = `
      <option value="">All Categories</option>
      ${STATE.categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('')}
    `;
  }
}

function updateQuickCategories(type) {
  const select = document.getElementById('quickTxCategory');
  if (!select) return;
  const filtered = STATE.categories.filter(c => c.type === type);
  select.innerHTML = filtered.map(c => `<option value="${escapeHtml(c.name)}">${CATEGORY_ICONS[c.name] || '🏷️'} ${escapeHtml(c.name)}</option>`).join('');
}

function updateModalCategories(type) {
  const select = document.getElementById('modalTxCategory');
  if (!select) return;
  const filtered = STATE.categories.filter(c => c.type === type);
  select.innerHTML = filtered.map(c => `<option value="${escapeHtml(c.name)}">${CATEGORY_ICONS[c.name] || '🏷️'} ${escapeHtml(c.name)}</option>`).join('');
}

function updateRecCategories(type) {
  const select = document.getElementById('recCategorySelect');
  if (!select) return;
  const filtered = STATE.categories.filter(c => c.type === type);
  select.innerHTML = filtered.map(c => `<option value="${escapeHtml(c.name)}">${CATEGORY_ICONS[c.name] || '🏷️'} ${escapeHtml(c.name)}</option>`).join('');
}

/* ============================================================
   TRANSACTIONS MANAGEMENT (CRUD + Search + Filter + Export)
   ============================================================ */
async function loadTransactions() {
  try {
    const txs = await request('/transactions');
    STATE.transactions = txs || [];
    renderTransactionsTable(STATE.transactions);

    const badge = document.getElementById('txCountBadge');
    if (badge) badge.textContent = STATE.transactions.length;
  } catch (err) {
    console.error('Error loading transactions', err);
  }
}

function renderTransactionsTable(rows) {
  const tbody = document.getElementById('allTxTableBody');
  const countLabel = document.getElementById('txTotalCountLabel');
  if (!tbody) return;

  if (countLabel) countLabel.textContent = `Showing ${rows.length} transaction${rows.length === 1 ? '' : 's'}`;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No transactions found matching your criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const isIncome = r.type === 'income';
    const icon = CATEGORY_ICONS[r.category] || '🏷️';
    return `
      <tr>
        <td><strong>${escapeHtml(r.transaction_date)}</strong></td>
        <td><span class="pill ${isIncome ? 'pill-income' : 'pill-expense'}">${escapeHtml(r.type)}</span></td>
        <td><span class="pill pill-category">${icon} ${escapeHtml(r.category || 'Other')}</span></td>
        <td><span class="pill pill-method">${escapeHtml(r.payment_method || 'Other')}</span></td>
        <td>${escapeHtml(r.note || '—')}</td>
        <td class="text-right ${isIncome ? 'amount-income' : 'amount-expense'}">
          ${isIncome ? '+' : '-'}${formatMoney(r.amount)}
        </td>
        <td class="text-center">
          <div class="action-btn-group">
            <button type="button" class="btn-icon" onclick="openEditTxModal(${r.id})" title="Edit Transaction">✏️</button>
            <button type="button" class="btn-icon btn-icon-danger" onclick="deleteTransaction(${r.id})" title="Delete Transaction">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

let filterDebounceTimer;
function debounceFilterTransactions() {
  clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(filterTransactions, 250);
}

async function filterTransactions() {
  const q = document.getElementById('txSearchInput')?.value || '';
  const type = document.getElementById('filterType')?.value || '';
  const category = document.getElementById('filterCategory')?.value || '';
  const start = document.getElementById('filterStartDate')?.value || '';
  const end = document.getElementById('filterEndDate')?.value || '';

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (type) params.set('type', type);
  if (category) params.set('category', category);
  if (start) params.set('start', start);
  if (end) params.set('end', end);

  try {
    const rows = await request(`/transactions?${params.toString()}`);
    renderTransactionsTable(rows || []);
  } catch (err) {
    console.error('Filter error', err);
  }
}

function resetFilters() {
  const qInput = document.getElementById('txSearchInput');
  const tSelect = document.getElementById('filterType');
  const cSelect = document.getElementById('filterCategory');
  const sDate = document.getElementById('filterStartDate');
  const eDate = document.getElementById('filterEndDate');

  if (qInput) qInput.value = '';
  if (tSelect) tSelect.value = '';
  if (cSelect) cSelect.value = '';
  if (sDate) sDate.value = '';
  if (eDate) eDate.value = '';

  filterTransactions();
}

async function handleQuickAddTx(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    type: form.type.value,
    amount: parseFloat(form.amount.value),
    category: form.category.value,
    transaction_date: form.transaction_date.value || todayDateStr(),
    payment_method: form.payment_method.value,
    note: form.note.value.trim()
  };

  try {
    await request('/transactions', { method: 'POST', body: payload });
    form.reset();
    document.getElementById('quickTxDate').value = todayDateStr();
    updateQuickCategories(document.getElementById('quickTxType').value);
    showToast('Transaction recorded successfully!', 'success');
    await loadAllViews();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* Modal Add/Edit Transaction */
function openAddTxModal() {
  const modal = document.getElementById('txModal');
  const title = document.getElementById('txModalTitle');
  const form = document.getElementById('txModalForm');

  title.textContent = 'Add Transaction';
  form.reset();
  document.getElementById('modalTxId').value = '';
  document.getElementById('modalTxDate').value = todayDateStr();
  document.getElementById('modalTxType').value = 'expense';
  updateModalCategories('expense');

  modal.style.display = 'flex';
}

function openEditTxModal(id) {
  const tx = STATE.transactions.find(t => t.id === id);
  if (!tx) return;

  const modal = document.getElementById('txModal');
  const title = document.getElementById('txModalTitle');

  title.textContent = 'Edit Transaction';
  document.getElementById('modalTxId').value = tx.id;
  document.getElementById('modalTxType').value = tx.type;
  updateModalCategories(tx.type);
  document.getElementById('modalTxAmount').value = tx.amount;
  document.getElementById('modalTxCategory').value = tx.category;
  document.getElementById('modalTxDate').value = tx.transaction_date;
  document.getElementById('modalTxPayment').value = tx.payment_method || 'Other';
  document.getElementById('modalTxNote').value = tx.note || '';

  modal.style.display = 'flex';
}

function closeTxModal() {
  document.getElementById('txModal').style.display = 'none';
}

async function handleModalTxSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const id = document.getElementById('modalTxId').value;
  const payload = {
    type: form.type.value,
    amount: parseFloat(form.amount.value),
    category: form.category.value,
    transaction_date: form.transaction_date.value,
    payment_method: form.payment_method.value,
    note: form.note.value.trim()
  };

  try {
    if (id) {
      await request(`/transactions/${id}`, { method: 'PATCH', body: payload });
      showToast('Transaction updated successfully!', 'success');
    } else {
      await request('/transactions', { method: 'POST', body: payload });
      showToast('Transaction added successfully!', 'success');
    }
    closeTxModal();
    await loadAllViews();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteTransaction(id) {
  if (!confirm('Are you sure you want to delete this transaction record?')) return;
  try {
    await request(`/transactions/${id}`, { method: 'DELETE' });
    showToast('Transaction deleted.', 'info');
    await loadAllViews();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================
   CSV BULK IMPORT & RECONCILIATION
   ============================================================ */
function downloadSampleCSV() {
  const csvContent = "type,amount,transaction_date,category,payment_method,note\n" +
    "expense,450.00,2026-10-20,Food,UPI,Grocery shopping\n" +
    "expense,1200.00,2026-10-21,Transport,Card,Fuel refill\n" +
    "income,75000.00,2026-10-01,Salary,Bank transfer,Monthly Salary\n" +
    "expense,899.00,2026-10-22,Entertainment,UPI,Movie tickets\n";

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'expensewise_sample_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function handleCSVFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const text = evt.target.result;
      parseCSVText(text);
    } catch (err) {
      showToast('Failed to read CSV file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function parseCSVText(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    showToast('CSV must contain a header row and at least one data row.', 'warning');
    return;
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const reqFields = ['type', 'amount', 'transaction_date'];
  for (const f of reqFields) {
    if (!headers.includes(f)) {
      showToast(`Missing required column "${f}" in CSV.`, 'error');
      return;
    }
  }

  const parsedRows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < headers.length) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx];
    });

    const typ = (rowObj.type || '').toLowerCase();
    const amt = parseFloat(rowObj.amount);
    const dt = rowObj.transaction_date;

    const isValid = (typ === 'income' || typ === 'expense') && !isNaN(amt) && amt > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dt);

    parsedRows.push({
      rowNum: i + 1,
      type: typ,
      amount: amt,
      transaction_date: dt,
      category: rowObj.category || (typ === 'expense' ? 'Other' : 'Other income'),
      payment_method: rowObj.payment_method || 'Other',
      note: rowObj.note || '',
      valid: isValid
    });
  }

  STATE.pendingImportRows = parsedRows.filter(r => r.valid);

  // Render preview table
  const previewArea = document.getElementById('csvPreviewArea');
  const previewStats = document.getElementById('csvPreviewStats');
  const tbody = document.getElementById('csvPreviewTableBody');

  previewStats.textContent = `Preview: ${STATE.pendingImportRows.length} valid rows ready to import (${parsedRows.length - STATE.pendingImportRows.length} invalid)`;

  tbody.innerHTML = parsedRows.slice(0, 50).map(r => `
    <tr style="${r.valid ? '' : 'background: var(--danger-bg);'}">
      <td>#${r.rowNum}</td>
      <td><span class="pill ${r.type === 'income' ? 'pill-income' : 'pill-expense'}">${escapeHtml(r.type)}</span></td>
      <td><b>${formatMoney(r.amount)}</b></td>
      <td>${escapeHtml(r.transaction_date)}</td>
      <td>${escapeHtml(r.category)}</td>
      <td>${escapeHtml(r.payment_method)}</td>
      <td>${escapeHtml(r.note)}</td>
      <td>${r.valid ? '<span style="color:var(--success);">Ready</span>' : '<span style="color:var(--danger);">Invalid format</span>'}</td>
    </tr>
  `).join('');

  previewArea.style.display = 'block';
}

function cancelCSVImport() {
  STATE.pendingImportRows = [];
  document.getElementById('csvFileInput').value = '';
  document.getElementById('csvPreviewArea').style.display = 'none';
}

async function confirmCSVImport() {
  if (STATE.pendingImportRows.length === 0) return;

  const btn = document.getElementById('confirmCSVImportBtn');
  btn.disabled = true;
  btn.textContent = 'Importing...';

  try {
    let importedCount = 0;
    for (const r of STATE.pendingImportRows) {
      await request('/transactions', {
        method: 'POST',
        body: {
          type: r.type,
          amount: r.amount,
          transaction_date: r.transaction_date,
          category: r.category,
          payment_method: r.payment_method,
          note: r.note
        }
      });
      importedCount++;
    }

    showToast(`Successfully imported ${importedCount} transactions!`, 'success');
    cancelCSVImport();
    await loadAllViews();
  } catch (err) {
    showToast('Import error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm & Import Records';
  }
}

/* ============================================================
   VIEW 3: BUDGETS & LIMITS
   ============================================================ */
async function loadBudgets() {
  try {
    const list = await request('/budgets');
    STATE.budgets = list || [];
    renderBudgetsList(STATE.budgets);
    renderDashBudgetSnapshot(STATE.budgets);
    checkBudgetAlerts(STATE.budgets);
  } catch (err) {
    console.error('Error loading budgets', err);
  }
}

function renderBudgetsList(budgets) {
  const container = document.getElementById('budgetsListContainer');
  if (!container) return;

  if (!budgets || budgets.length === 0) {
    container.innerHTML = `<div class="empty-state">No budgets configured for this month. Set one using the form on the left!</div>`;
    return;
  }

  container.innerHTML = budgets.map(b => {
    const isExceeded = b.percent >= 100;
    const isWarn = b.percent >= b.threshold_percent && !isExceeded;
    const statusClass = isExceeded ? 'danger' : isWarn ? 'warn' : '';
    const statusText = isExceeded
      ? `🚨 Exceeded by ${formatMoney(Math.abs(b.remaining))}`
      : isWarn
      ? `⚠️ Caution: ${b.percent}% reached (${formatMoney(b.remaining)} remaining)`
      : `✅ On Track · ${formatMoney(b.remaining)} remaining`;

    const icon = CATEGORY_ICONS[b.category] || '🌐';

    return `
      <div class="budget-item-card">
        <div class="budget-item-header">
          <div>
            <span class="budget-cat-name">${icon} ${escapeHtml(b.category || 'Overall Monthly Budget')}</span>
          </div>
          <div class="budget-amounts">
            <span>${formatMoney(b.spent)}</span> <small class="text-muted">/ ${formatMoney(b.limit_amount)}</small>
          </div>
        </div>

        <div class="progress-track">
          <div class="progress-fill ${statusClass}" style="width: ${Math.min(100, b.percent)}%;"></div>
        </div>

        <div class="budget-meta">
          <span>${statusText}</span>
          <button type="button" class="btn-text" style="color:var(--danger);" onclick="deleteBudget(${b.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderDashBudgetSnapshot(budgets) {
  const container = document.getElementById('dashBudgetList');
  if (!container) return;

  if (!budgets || budgets.length === 0) {
    container.innerHTML = `<div class="empty-state">No active budgets. <button class="btn-text" onclick="navigateTo('budgets')">Create one</button> to control spending.</div>`;
    return;
  }

  container.innerHTML = budgets.slice(0, 3).map(b => {
    const isExceeded = b.percent >= 100;
    const isWarn = b.percent >= b.threshold_percent && !isExceeded;
    const statusClass = isExceeded ? 'danger' : isWarn ? 'warn' : '';
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:700; margin-bottom:4px;">
          <span>${escapeHtml(b.category || 'Overall')}</span>
          <span>${b.percent}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${statusClass}" style="width: ${Math.min(100, b.percent)}%;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
          <span>Spent: ${formatMoney(b.spent)}</span>
          <span>Limit: ${formatMoney(b.limit_amount)}</span>
        </div>
      </div>
    `;
  }).join('');
}

function checkBudgetAlerts(budgets) {
  const dot = document.getElementById('budgetAlertDot');
  const banner = document.getElementById('activeAlertsBanner');

  const alerts = budgets.filter(b => b.percent >= b.threshold_percent);
  if (alerts.length > 0) {
    if (dot) dot.style.display = 'block';
    if (banner) {
      const topAlert = alerts[0];
      banner.style.display = 'flex';
      banner.innerHTML = `
        <span>⚠️</span>
        <div><strong>Budget Alert:</strong> Your ${escapeHtml(topAlert.category || 'Overall')} budget is at <strong>${topAlert.percent}%</strong> capacity (${formatMoney(topAlert.spent)} / ${formatMoney(topAlert.limit_amount)}).</div>
      `;
    }
  } else {
    if (dot) dot.style.display = 'none';
    if (banner) banner.style.display = 'none';
  }
}

async function handleSaveBudget(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    category: form.category.value.trim() || null,
    limit_amount: parseFloat(form.limit_amount.value),
    threshold_percent: parseInt(form.threshold_percent.value, 10),
    month: parseInt(form.month.value, 10),
    year: parseInt(form.year.value, 10)
  };

  try {
    await request('/budgets', { method: 'POST', body: payload });
    showToast('Budget target saved successfully!', 'success');
    await loadBudgets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteBudget(id) {
  if (!confirm('Remove this budget target?')) return;
  try {
    await request(`/budgets/${id}`, { method: 'DELETE' });
    showToast('Budget deleted.', 'info');
    await loadBudgets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================
   VIEW 4: SAVINGS GOALS
   ============================================================ */
async function loadGoals() {
  try {
    const list = await request('/goals');
    STATE.goals = list || [];
    renderGoalsList(STATE.goals);
  } catch (err) {
    console.error('Error loading goals', err);
  }
}

function renderGoalsList(goals) {
  const container = document.getElementById('goalsListContainer');
  if (!container) return;

  if (!goals || goals.length === 0) {
    container.innerHTML = `<div class="empty-state">No savings goals created yet. Set your first financial milestone!</div>`;
    return;
  }

  container.innerHTML = goals.map(g => {
    const target = Number(g.target_amount) || 1;
    const current = Number(g.current_amount) || 0;
    const pct = Math.min(100, Math.round((current / target) * 100));
    const isCompleted = current >= target;

    return `
      <div class="goal-item-card">
        <div class="goal-item-header">
          <div>
            <h4 class="goal-title">${escapeHtml(g.title)}</h4>
            <span class="goal-date">${g.target_date ? `🎯 Target: ${escapeHtml(g.target_date)}` : 'Continuous Goal'}</span>
          </div>
          <div class="goal-percentage">${pct}%</div>
        </div>

        <div class="progress-track">
          <div class="progress-fill ${isCompleted ? 'success' : ''}" style="width: ${pct}%; background:${isCompleted ? 'var(--success)' : 'var(--primary)'};"></div>
        </div>

        <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:700; margin-bottom:8px;">
          <span>${formatMoney(current)} saved</span>
          <span class="text-muted">Goal: ${formatMoney(target)}</span>
        </div>

        <div class="goal-actions">
          <span style="font-size:0.75rem; color:${isCompleted ? 'var(--success)' : 'var(--text-muted)'}; font-weight:600;">
            ${isCompleted ? '🎉 Goal Achieved!' : `${formatMoney(target - current)} to go`}
          </span>
          <div class="goal-action-btns">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openGoalDepositModal(${g.id})">+ Deposit</button>
            <button type="button" class="btn-icon btn-icon-danger" onclick="deleteGoal(${g.id})" title="Delete Goal">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function handleCreateGoal(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    title: form.title.value.trim(),
    target_amount: parseFloat(form.target_amount.value),
    current_amount: parseFloat(form.current_amount.value || 0),
    target_date: form.target_date.value || null
  };

  try {
    await request('/goals', { method: 'POST', body: payload });
    form.reset();
    showToast('Savings goal established!', 'success');
    await loadGoals();
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openGoalDepositModal(goalId) {
  const goal = STATE.goals.find(g => g.id === goalId);
  if (!goal) return;

  document.getElementById('depositGoalId').value = goal.id;
  document.getElementById('goalDepositTitle').textContent = `Add Funds: ${goal.title}`;
  document.getElementById('depositGoalDetails').textContent = `Current: ${formatMoney(goal.current_amount)} / Target: ${formatMoney(goal.target_amount)}`;
  document.getElementById('depositAmountInput').value = '';

  document.getElementById('goalDepositModal').style.display = 'flex';
}

function closeGoalDepositModal() {
  document.getElementById('goalDepositModal').style.display = 'none';
}

function setPresetDeposit(amount) {
  document.getElementById('depositAmountInput').value = amount;
}

async function handleGoalDepositSubmit(e) {
  e.preventDefault();
  const goalId = parseInt(document.getElementById('depositGoalId').value, 10);
  const addAmt = parseFloat(document.getElementById('depositAmountInput').value);

  const goal = STATE.goals.find(g => g.id === goalId);
  if (!goal) return;

  const newTotal = (Number(goal.current_amount) || 0) + addAmt;

  try {
    await request(`/goals/${goalId}`, {
      method: 'PATCH',
      body: { current_amount: newTotal }
    });
    showToast(`Added ${formatMoney(addAmt)} to "${goal.title}"!`, 'success');
    closeGoalDepositModal();
    await loadGoals();
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteGoal(id) {
  if (!confirm('Delete this savings goal?')) return;
  try {
    await request(`/goals/${id}`, { method: 'DELETE' });
    showToast('Goal removed.', 'info');
    await loadGoals();
    await loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================
   VIEW 5: RECURRING TRANSACTIONS
   ============================================================ */
async function loadRecurring() {
  try {
    const list = await request('/recurring');
    STATE.recurring = list || [];
    renderRecurringList(STATE.recurring);
  } catch (err) {
    console.error('Error loading recurring rules', err);
  }
}

function renderRecurringList(rules) {
  const container = document.getElementById('recurringListContainer');
  if (!container) return;

  if (!rules || rules.length === 0) {
    container.innerHTML = `<div class="empty-state">No recurring transaction rules found. Add one on the left!</div>`;
    return;
  }

  container.innerHTML = rules.map(r => {
    const isIncome = r.type === 'income';
    const icon = CATEGORY_ICONS[r.category] || '↻';
    return `
      <div class="recurring-item-card">
        <div class="rec-left">
          <span class="rec-icon">${icon}</span>
          <div>
            <h4 class="rec-title">${escapeHtml(r.note || r.category)}</h4>
            <span class="rec-subtitle">${escapeHtml(r.frequency.toUpperCase())} · Next Due: <strong>${escapeHtml(r.next_run_date)}</strong></span>
          </div>
        </div>
        <div class="rec-right">
          <span class="rec-amount ${isIncome ? 'amount-income' : 'amount-expense'}">
            ${isIncome ? '+' : '-'}${formatMoney(r.amount)}
          </span>
          <span class="pill ${isIncome ? 'pill-income' : 'pill-expense'}">${escapeHtml(r.type)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function handleCreateRecurring(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    type: form.type.value,
    amount: parseFloat(form.amount.value),
    category: form.category.value,
    frequency: form.frequency.value,
    next_run_date: form.next_run_date.value,
    payment_method: form.payment_method.value,
    note: form.note.value.trim()
  };

  try {
    await request('/recurring', { method: 'POST', body: payload });
    form.reset();
    document.getElementById('recNextDate').value = todayDateStr();
    showToast('Recurring transaction schedule saved!', 'success');
    await loadRecurring();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function processDueRecurring() {
  try {
    const res = await request('/recurring/process-due', { method: 'POST' });
    showToast(res.message || 'Processed due rules.', 'success');
    await loadAllViews();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================
   VIEW 6: SMART INSIGHTS
   ============================================================ */
async function loadInsights() {
  try {
    const data = await request('/insights');
    const container = document.getElementById('insightsListContainer');
    if (!container) return;

    const list = data.insights || [];
    if (list.length === 0) {
      container.innerHTML = `<div class="empty-state">No insights generated yet. Record more transactions to see patterns!</div>`;
      return;
    }

    container.innerHTML = list.map(i => {
      const icon = i.type === 'danger' ? '🚨' : i.type === 'warning' ? '⚠️' : i.type === 'success' ? '🌟' : '💡';
      return `
        <div class="insight-card insight-${i.type || 'info'}">
          <span class="insight-icon">${icon}</span>
          <div class="insight-content">
            <h4>${escapeHtml(i.title)}</h4>
            <p>${escapeHtml(i.message)}</p>
          </div>
        </div>
      `;
    }).join('');

    // Compute Health Score
    calculateHealthScore();
  } catch (err) {
    console.error('Error loading insights', err);
  }
}

function calculateHealthScore() {
  const scoreNum = document.getElementById('healthScoreNum');
  const scoreGrade = document.getElementById('healthScoreGrade');
  if (!scoreNum || !scoreGrade) return;

  const txs = STATE.transactions || [];
  if (txs.length === 0) {
    scoreNum.textContent = '--';
    scoreGrade.textContent = 'Add transactions to calculate score';
    return;
  }

  let totalIncome = 0;
  let totalExpense = 0;
  txs.forEach(t => {
    if (t.type === 'income') totalIncome += Number(t.amount) || 0;
    else totalExpense += Number(t.amount) || 0;
  });

  let score = 70; // baseline
  if (totalIncome > 0) {
    const savingsRatio = (totalIncome - totalExpense) / totalIncome;
    if (savingsRatio >= 0.25) score += 20;
    else if (savingsRatio >= 0.1) score += 10;
    else if (savingsRatio < 0) score -= 25;
  }

  // Budget violations check
  const violatedBudgets = STATE.budgets.filter(b => b.percent >= 100);
  score -= (violatedBudgets.length * 8);

  score = Math.max(20, Math.min(98, score));
  scoreNum.textContent = score;

  if (score >= 85) scoreGrade.textContent = 'Excellent · Positive savings surplus and disciplined budgets';
  else if (score >= 70) scoreGrade.textContent = 'Good · Balanced cashflow with room to optimize';
  else scoreGrade.textContent = 'Needs Attention · High expense-to-income ratio or budget overruns';
}

/* ============================================================
   EXPORT (CSV & PDF)
   ============================================================ */
function exportData(format) {
  const txs = STATE.transactions || [];
  if (txs.length === 0) {
    showToast('No transactions to export yet.', 'warning');
    return;
  }

  if (format === 'csv') {
    let csv = 'type,amount,transaction_date,category,payment_method,note\n';
    txs.forEach(t => {
      const cleanNote = (t.note || '').replace(/"/g, '""');
      csv += `${t.type},${t.amount},${t.transaction_date},"${t.category || ''}","${t.payment_method || ''}","${cleanNote}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ExpenseWise_Transactions_${todayDateStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV Export generated successfully!', 'success');
  } else if (format === 'pdf') {
    generateClientPDF(txs);
  }
}

function generateClientPDF(txs) {
  // Generate clean, printable executive finance statement
  let totalIncome = 0;
  let totalExpense = 0;
  txs.forEach(t => {
    if (t.type === 'income') totalIncome += Number(t.amount) || 0;
    else totalExpense += Number(t.amount) || 0;
  });

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Popup blocker prevented PDF generation. Please allow popups.', 'error');
    return;
  }

  const rowsHtml = txs.slice(0, 150).map(t => `
    <tr>
      <td style="padding:8px; border-bottom:1px solid #ddd;">${t.transaction_date}</td>
      <td style="padding:8px; border-bottom:1px solid #ddd; text-transform:uppercase; font-weight:bold; color:${t.type==='income'?'#059669':'#dc2626'}">${t.type}</td>
      <td style="padding:8px; border-bottom:1px solid #ddd;">${escapeHtml(t.category)}</td>
      <td style="padding:8px; border-bottom:1px solid #ddd;">${escapeHtml(t.payment_method || 'Other')}</td>
      <td style="padding:8px; border-bottom:1px solid #ddd;">${escapeHtml(t.note || '—')}</td>
      <td style="padding:8px; border-bottom:1px solid #ddd; text-align:right; font-weight:bold;">${formatMoney(t.amount)}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ExpenseWise Financial Statement - ${todayDateStr()}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; }
        .header { border-bottom: 2px solid #0f766e; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; }
        .brand { font-size: 24px; font-weight: 800; color: #0f766e; }
        .stats { display: flex; gap: 24px; margin-bottom: 28px; background: #f8fafc; padding: 16px; border-radius: 8px; }
        .stat-item { flex: 1; }
        .stat-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
        .stat-value { font-size: 20px; font-weight: bold; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 14px; }
        th { background: #0f766e; color: white; text-align: left; padding: 10px; font-size: 11px; text-transform: uppercase; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">◈ ExpenseWise</div>
          <p style="margin:4px 0; color:#64748b; font-size:13px;">Personal Financial Statement</p>
        </div>
        <div style="text-align:right; font-size:12px; color:#64748b;">
          <p><strong>Account:</strong> ${escapeHtml(STATE.user ? STATE.user.name : 'Personal')}</p>
          <p><strong>Date Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat-item">
          <div class="stat-label">Total Income</div>
          <div class="stat-value" style="color:#059669;">${formatMoney(totalIncome)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Total Expenses</div>
          <div class="stat-value" style="color:#dc2626;">${formatMoney(totalExpense)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Net Balance</div>
          <div class="stat-value" style="color:#0f766e;">${formatMoney(totalIncome - totalExpense)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Total Records</div>
          <div class="stat-value">${txs.length}</div>
        </div>
      </div>

      <h3>Transaction Details</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Method</th>
            <th>Description</th>
            <th style="text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <p style="font-size:11px; color:#94a3b8; margin-top:30px; text-align:center;">Generated by ExpenseWise · Private & Confidential</p>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
  showToast('Print-ready PDF report opened!', 'success');
}

/* ============================================================
   VIEW 7: CATEGORIES & TOOLS
   ============================================================ */
function loadCategoriesView() {
  const container = document.getElementById('categoriesChipsList');
  if (!container) return;

  container.innerHTML = STATE.categories.map(c => {
    const icon = CATEGORY_ICONS[c.name] || '🏷️';
    return `
      <div class="category-chip">
        <span>${icon}</span>
        <span>${escapeHtml(c.name)}</span>
        <small class="text-muted">(${c.type})</small>
      </div>
    `;
  }).join('');
}

async function handleAddCategory(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.name.value.trim();
  const type = form.type.value;

  try {
    await request('/categories', { method: 'POST', body: { name, type } });
    form.reset();
    showToast(`Added "${name}" to categories!`, 'success');
    await loadCategories();
    loadCategoriesView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function seedSampleData(notify = true) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  const demoTxs = [
    { id: 101, type: 'income', amount: 85000, transaction_date: `${y}-${m}-01`, category: 'Salary', payment_method: 'Bank transfer', note: 'Monthly Salary' },
    { id: 102, type: 'income', amount: 15000, transaction_date: `${y}-${m}-10`, category: 'Freelance', payment_method: 'UPI', note: 'UI Design Consulting' },
    { id: 103, type: 'expense', amount: 22000, transaction_date: `${y}-${m}-02`, category: 'Rent', payment_method: 'Bank transfer', note: 'Apartment Rent' },
    { id: 104, type: 'expense', amount: 3500, transaction_date: `${y}-${m}-04`, category: 'Bills', payment_method: 'UPI', note: 'Electricity & High-speed Internet' },
    { id: 105, type: 'expense', amount: 4800, transaction_date: `${y}-${m}-06`, category: 'Food', payment_method: 'Card', note: 'Monthly Supermarket Groceries' },
    { id: 106, type: 'expense', amount: 1200, transaction_date: `${y}-${m}-08`, category: 'Transport', payment_method: 'UPI', note: 'Fuel & Metro card' },
    { id: 107, type: 'expense', amount: 2400, transaction_date: `${y}-${m}-12`, category: 'Food', payment_method: 'UPI', note: 'Dinner with colleagues' },
    { id: 108, type: 'expense', amount: 4200, transaction_date: `${y}-${m}-15`, category: 'Shopping', payment_method: 'Card', note: 'New Ergonomic Keyboard' },
    { id: 109, type: 'expense', amount: 1800, transaction_date: `${y}-${m}-17`, category: 'Health', payment_method: 'UPI', note: 'Gym Membership & Vitamins' },
    { id: 110, type: 'expense', amount: 950, transaction_date: `${y}-${m}-19`, category: 'Entertainment', payment_method: 'UPI', note: 'Cinema tickets' },
    { id: 111, type: 'expense', amount: 2100, transaction_date: `${y}-${m}-21`, category: 'Food', payment_method: 'UPI', note: 'Artisan Bakery & Coffee' }
  ];

  const demoBudgets = [
    { id: 201, category: null, month: now.getMonth() + 1, year: y, limit_amount: 50000, threshold_percent: 80 },
    { id: 202, category: 'Food', month: now.getMonth() + 1, year: y, limit_amount: 12000, threshold_percent: 80 },
    { id: 203, category: 'Shopping', month: now.getMonth() + 1, year: y, limit_amount: 8000, threshold_percent: 75 },
    { id: 204, category: 'Bills', month: now.getMonth() + 1, year: y, limit_amount: 5000, threshold_percent: 85 }
  ];

  const demoGoals = [
    { id: 301, title: 'Emergency Fund', target_amount: 150000, current_amount: 95000, target_date: `${y}-12-31`, status: 'active' },
    { id: 302, title: 'MacBook Pro M3', target_amount: 120000, current_amount: 72000, target_date: `${y + 1}-03-15`, status: 'active' },
    { id: 303, title: 'Japan Vacation', target_amount: 200000, current_amount: 60000, target_date: `${y + 1}-05-01`, status: 'active' }
  ];

  const demoRecurring = [
    { id: 401, type: 'expense', amount: 699, category: 'Entertainment', frequency: 'monthly', next_run_date: `${y}-${m}-28`, payment_method: 'UPI', note: 'Netflix & Spotify Family', active: 1 },
    { id: 402, type: 'expense', amount: 22000, category: 'Rent', frequency: 'monthly', next_run_date: `${y}-${String(now.getMonth() + 2).padStart(2, '0')}-02`, payment_method: 'Bank transfer', note: 'Apartment Rent', active: 1 }
  ];

  ClientStore.setData('transactions', demoTxs);
  ClientStore.setData('budgets', demoBudgets);
  ClientStore.setData('goals', demoGoals);
  ClientStore.setData('recurring', demoRecurring);

  loadAllViews();
  if (notify) showToast('Loaded realistic demo dataset with 11 transactions, 4 budgets, and 3 goals!', 'success');
}

function backupDataJSON() {
  const data = {
    user: STATE.user,
    exported_at: new Date().toISOString(),
    transactions: ClientStore.getData('transactions', []),
    budgets: ClientStore.getData('budgets', []),
    goals: ClientStore.getData('goals', []),
    recurring: ClientStore.getData('recurring', []),
    categories: ClientStore.getData('categories', [])
  };

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ExpenseWise_Backup_${todayDateStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON backup downloaded!', 'success');
}

function handleRestoreJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.transactions) ClientStore.setData('transactions', data.transactions);
      if (data.budgets) ClientStore.setData('budgets', data.budgets);
      if (data.goals) ClientStore.setData('goals', data.goals);
      if (data.recurring) ClientStore.setData('recurring', data.recurring);
      if (data.categories) ClientStore.setData('categories', data.categories);

      showToast('Data restored successfully from backup!', 'success');
      loadAllViews();
    } catch (err) {
      showToast('Invalid backup file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function clearAllUserData() {
  if (!confirm('Are you sure you want to clear ALL transactions, budgets, and goals? This action cannot be undone.')) return;

  ClientStore.setData('transactions', []);
  ClientStore.setData('budgets', []);
  ClientStore.setData('goals', []);
  ClientStore.setData('recurring', []);

  showToast('All personal records have been cleared.', 'info');
  loadAllViews();
}

/* Modal helper */
function handleModalBackdropClick(e, modalId) {
  if (e.target.id === modalId) {
    document.getElementById(modalId).style.display = 'none';
  }
}

/* ============================================================
   INITIALIZATION
   ============================================================ */
window.addEventListener('DOMContentLoaded', async () => {
  // Apply saved theme
  document.body.setAttribute('data-theme', STATE.theme);
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) themeIcon.textContent = STATE.theme === 'dark' ? '☀️' : '🌙';

  // Apply saved currency
  const currSelect = document.getElementById('currencySelector');
  if (currSelect) currSelect.value = STATE.currency;

  // Initialize budget month & year selectors
  const bMonth = document.getElementById('budgetMonthSelect');
  const bYear = document.getElementById('budgetYearInput');
  const now = new Date();
  if (bMonth) {
    for (let i = 1; i <= 12; i++) {
      const monthName = new Date(2000, i - 1, 1).toLocaleString('en', { month: 'long' });
      bMonth.insertAdjacentHTML('beforeend', `<option value="${i}" ${i === now.getMonth() + 1 ? 'selected' : ''}>${monthName}</option>`);
    }
  }
  if (bYear) bYear.value = now.getFullYear();

  // Set default transaction dates
  const qDate = document.getElementById('quickTxDate');
  if (qDate) qDate.value = todayDateStr();
  const mDate = document.getElementById('modalTxDate');
  if (mDate) mDate.value = todayDateStr();
  const rDate = document.getElementById('recNextDate');
  if (rDate) rDate.value = todayDateStr();

  // Attach Quick Demo Login button
  const demoBtn = document.getElementById('quickDemoBtn');
  if (demoBtn) demoBtn.addEventListener('click', handleQuickDemoLogin);

  // Check Backend Connection
  await checkBackendHealth();

  // Check Existing Session
  if (STATE.token && STATE.user) {
    document.getElementById('authPortal').style.display = 'none';
    document.getElementById('appShell').style.display = 'flex';
    updateUserLabels();
    loadAllViews();
  } else {
    // Show dedicated Login / Sign Up page first
    document.getElementById('authPortal').style.display = 'flex';
    document.getElementById('appShell').style.display = 'none';
  }
});
