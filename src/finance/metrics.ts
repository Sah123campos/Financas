// Cálculos financeiros puros (sem acesso ao banco), fáceis de testar.
import type { Account, Budget, Category, Goal, Transaction } from '@/db/types';
import { addDays, format, parseISO } from 'date-fns';
import { isRealized } from './defaults';
import type { Period } from '@/lib/dates';
import { inRange } from '@/lib/dates';

export const signed = (t: Transaction) => (t.type === 'income' ? t.amount : -t.amount);

export interface PeriodSummary {
  income: number; expense: number; result: number;
  incomePending: number; expensePending: number;
  expenseRatio: number | null; // despesas / receitas
  count: number;
}
export function summarize(txs: Transaction[], p: Period): PeriodSummary {
  let income = 0, expense = 0, incomePending = 0, expensePending = 0, count = 0;
  for (const t of txs) {
    if (!inRange(t.date, p)) continue;
    count++;
    const real = isRealized(t.status);
    if (t.type === 'income') real ? (income += t.amount) : (incomePending += t.amount);
    else real ? (expense += t.amount) : (expensePending += t.amount);
  }
  return { income, expense, result: income - expense, incomePending, expensePending, expenseRatio: income > 0 ? expense / income : null, count };
}

/** Saldo efetivo (apenas pagos/recebidos) até uma data, somando saldos iniciais das contas. */
export function balanceAt(txs: Transaction[], accounts: Account[], date: string, accountId?: string): number {
  let b = accounts.filter((a) => !accountId || a.id === accountId).reduce((s, a) => s + (a.initialBalance || 0), 0);
  for (const t of txs) if ((!accountId || t.accountId === accountId) && isRealized(t.status) && t.date <= date) b += signed(t);
  return b;
}

export interface ProjectionPoint { date: string; realized: number | null; projected: number | null }
/**
 * Saldo diário: histórico efetivo até hoje e projeção futura somando lançamentos
 * pendentes/previstos (inclusive atrasados, assumidos como liquidados hoje).
 */
export function projection(txs: Transaction[], accounts: Account[], today: string, daysBack = 30, daysAhead = 90): ProjectionPoint[] {
  const start = format(addDays(parseISO(today), -daysBack), 'yyyy-MM-dd');
  let bal = balanceAt(txs, accounts, format(addDays(parseISO(start), -1), 'yyyy-MM-dd'));
  const realByDay = new Map<string, number>(), planByDay = new Map<string, number>();
  for (const t of txs) {
    if (isRealized(t.status)) realByDay.set(t.date, (realByDay.get(t.date) ?? 0) + signed(t));
    else { const d = t.date < today ? today : t.date; planByDay.set(d, (planByDay.get(d) ?? 0) + signed(t)); }
  }
  const out: ProjectionPoint[] = [];
  let proj = 0;
  for (let i = 0; i <= daysBack + daysAhead; i++) {
    const d = format(addDays(parseISO(start), i), 'yyyy-MM-dd');
    if (d <= today) {
      bal += realByDay.get(d) ?? 0;
      if (d === today) { proj = bal + (planByDay.get(d) ?? 0); out.push({ date: d, realized: bal, projected: proj }); }
      else out.push({ date: d, realized: bal, projected: null });
    } else {
      proj += (planByDay.get(d) ?? 0) + (realByDay.get(d) ?? 0);
      out.push({ date: d, realized: null, projected: proj });
    }
  }
  return out;
}

export function byCategory(txs: Transaction[], p: Period, type: 'income' | 'expense', categories: Category[], includePlanned = false) {
  const m = new Map<string, number>();
  for (const t of txs) if (t.type === type && inRange(t.date, p) && (includePlanned || isRealized(t.status))) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount);
  return [...m.entries()].map(([id, value]) => { const c = categories.find((x) => x.id === id); return { id, name: c?.name ?? 'Sem categoria', color: c?.color ?? '#898781', icon: c?.icon ?? 'Tag', value }; }).sort((a, b) => b.value - a.value);
}

export function monthly(txs: Transaction[], months: string[]) {
  return months.map((m) => {
    let inc = 0, exp = 0;
    for (const t of txs) if (t.date.startsWith(m) && isRealized(t.status)) t.type === 'income' ? (inc += t.amount) : (exp += t.amount);
    return { month: m, income: inc, expense: exp, result: inc - exp };
  });
}

export function byPaymentMethod(txs: Transaction[], p: Period) {
  const m = new Map<string, number>();
  for (const t of txs) if (t.type === 'expense' && inRange(t.date, p) && isRealized(t.status)) m.set(t.paymentMethod || 'Não informado', (m.get(t.paymentMethod || 'Não informado') ?? 0) + t.amount);
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export interface BudgetStatus { budget: Budget; category?: Category; spent: number; planned: number; ratio: number; level: 'ok' | 'near' | 'over' }
export function budgetStatus(budgets: Budget[], txs: Transaction[], categories: Category[], month: string): BudgetStatus[] {
  return budgets.map((b) => {
    let spent = 0, planned = 0;
    for (const t of txs) if (t.type === 'expense' && t.categoryId === b.categoryId && t.date.startsWith(month)) isRealized(t.status) ? (spent += t.amount) : (planned += t.amount);
    const ratio = b.limit > 0 ? spent / b.limit : 0;
    const level: BudgetStatus['level'] = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok';
    return { budget: b, category: categories.find((c) => c.id === b.categoryId), spent, planned, ratio, level };
  }).sort((a, b) => b.ratio - a.ratio);
}

/** Quanto ainda pode ser gasto no mês sem comprometer a meta de economia (estimativa). */
export function spendingRoom(txs: Transaction[], month: string, monthlySavingTarget: number) {
  let incReal = 0, incPlan = 0, expReal = 0, expPlan = 0;
  for (const t of txs) {
    if (!t.date.startsWith(month)) continue;
    const r = isRealized(t.status);
    if (t.type === 'income') r ? (incReal += t.amount) : (incPlan += t.amount);
    else r ? (expReal += t.amount) : (expPlan += t.amount);
  }
  const expectedIncome = incReal + incPlan;
  const committed = expReal + expPlan;
  return { expectedIncome, committed, saving: monthlySavingTarget, available: expectedIncome - committed - monthlySavingTarget };
}

export function goalProgress(g: Goal, monthResult: number) {
  const current = g.kind === 'monthly_saving' ? Math.max(0, monthResult) : g.current;
  const ratio = g.target > 0 ? current / g.target : 0;
  let monthlyNeeded: number | null = null;
  if (g.deadline && g.kind !== 'monthly_saving') {
    const now = new Date(), d = parseISO(g.deadline);
    const months = Math.max(1, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth());
    monthlyNeeded = Math.max(0, (g.target - current) / months);
  }
  return { current, ratio, monthlyNeeded };
}
