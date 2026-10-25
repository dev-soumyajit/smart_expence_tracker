import type { Account, Budget, Category, Dashboard, Transaction, User } from '../../web/lib/types';

// Fictional, development-only visual fixtures. No API calls or financial writes.
export const user: User = { id: 'preview-user', name: 'Alex Morgan', email: 'alex@example.com', salary_day: 1, minimum_balance: 1000000 };
export const accounts: Account[] = [
  { id: 'bank', name: 'Everyday account', type: 'bank', balance: 7845050, opening_balance: 7845050, archived: false },
  { id: 'cash', name: 'Pocket money', type: 'cash', balance: 350000, opening_balance: 350000, archived: false },
  { id: 'credit', name: 'My credit card', type: 'credit', balance: -1280000, opening_balance: -1280000, archived: false },
];
export const categories: Category[] = [
  { id: 'food', name: 'Food & dining', color: '#446D48' }, { id: 'shopping', name: 'Shopping', color: '#D1E8A1' },
  { id: 'transport', name: 'Transport', color: '#C7BBE0' }, { id: 'bills', name: 'Bills & utilities', color: '#EBC3A3' },
  { id: 'health', name: 'Health', color: '#C98D94' }, { id: 'fun', name: 'Entertainment', color: '#8DAAAA' }, { id: 'other', name: 'Other', color: '#9CA98C' },
];
export const transactions: Transaction[] = [
  { id: 'coffee', account_id: 'bank', destination_id: null, category_id: 'food', original_id: null, kind: 'expense', amount: 32500, description: 'A little coffee break', notes: 'A good start to the day.', occurred_at: '2026-10-24T09:30:00+05:30', source: 'manual', voided: false },
  { id: 'train', account_id: 'bank', destination_id: null, category_id: 'transport', original_id: null, kind: 'expense', amount: 12000, description: 'The everyday commute', notes: '', occurred_at: '2026-10-24T08:00:00+05:30', source: 'manual', voided: false },
  { id: 'salary', account_id: 'bank', destination_id: null, category_id: null, original_id: null, kind: 'income', amount: 8500000, description: 'Hello, payday', notes: '', occurred_at: '2026-10-23T12:00:00+05:30', source: 'manual', voided: false },
  { id: 'cash-transfer', account_id: 'bank', destination_id: 'cash', category_id: null, original_id: null, kind: 'transfer', amount: 200000, description: 'A little cash for the week', notes: '', occurred_at: '2026-10-22T12:00:00+05:30', source: 'manual', voided: false },
];
export const budgets: Budget[] = [
  { id: 'overall', name: 'My October plan', category_id: null, amount: 5400000, start_date: '2026-10-01', end_date: '2026-10-31', spent: 2123450, remaining: 3276550, utilization_bps: 3932, projected: 2742790, preliminary: false },
  { id: 'food-budget', name: 'Good food, good balance', category_id: 'food', amount: 1200000, start_date: '2026-10-01', end_date: '2026-10-31', spent: 892050, remaining: 307950, utilization_bps: 7433, projected: 1152231, preliminary: false },
  { id: 'shopping-budget', name: 'A few nice things', category_id: 'shopping', amount: 800000, start_date: '2026-10-01', end_date: '2026-10-31', spent: 654000, remaining: 146000, utilization_bps: 8175, projected: 844750, preliminary: false },
];
export const dashboard: Dashboard = {
  start_date: '2026-10-01', end_date: '2026-10-31', cycle_start: '2026-10-01', cycle_end: '2026-10-31', available: 8195050,
  credit_debt: 1280000, income: 8500000, expenses: 2123450, savings: 6376550, savings_rate_bps: 7501, cash_expenses: 138000,
  safe_to_spend: 2276550, daily_safe: 284568, days_remaining: 8, reserved_bills: 1000000, reserved_goals: 1050000, minimum_balance: 1000000,
  assumptions: 'Development example. Actual estimates use eligible funds less card debt, reserves, goal allocations and unpaid essential bills, constrained by the remaining overall budget. Future income is excluded. This is an estimate, not a guarantee.',
  accounts, budgets,
  categories: categories.slice(0, 4).map((category, index) => ({ ...category, amount: [892050, 654000, 324500, 252900][index] })),
  trend: [{ date: '2026-10-01', amount: 221500 }, { date: '2026-10-06', amount: 458000 }, { date: '2026-10-11', amount: 267800 }, { date: '2026-10-16', amount: 512400 }, { date: '2026-10-21', amount: 448750 }, { date: '2026-10-26', amount: 215000 }],
  upcoming: [{ id: 'rent', name: 'Home, sweet home', amount: 1000000, account_id: 'bank', next_due: '2026-10-28', frequency: 'monthly', essential: true }],
  goals: [{ id: 'rainy-day', name: 'My rainy-day fund', target: 1500000, target_date: '2026-12-31', saved: 1050000, progress_bps: 7000, monthly_required: 150000 }],
  insights: [{ type: 'budget', title: 'A little intention goes a long way.', detail: 'Your shopping budget is 81% used. A quick check now can leave more room for the rest of your month.' }],
};
