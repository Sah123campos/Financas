import { describe, expect, it } from 'vitest';
import { occurrences, pendingTransactions } from '../src/finance/recurrence';
import { balanceAt, budgetStatus, projection, summarize } from '../src/finance/metrics';
import { previousPeriod, resolvePeriod } from '../src/lib/dates';
import type { Account, Recurring, Transaction } from '../src/db/types';

const rec = (p: Partial<Recurring> = {}): Recurring => ({ id: 'r1', description: 'Aluguel', amount: 100, type: 'expense', categoryId: 'c', accountId: 'a', paymentMethod: '', frequency: 'monthly', startDate: '2025-01-31', skipped: [], active: true, createdAt: 0, ...p });
const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), description: 'x', amount: 10, type: 'expense', categoryId: 'c', date: '2025-01-01', accountId: 'a', paymentMethod: '', status: 'paid', createdAt: 0, updatedAt: 0, ...p });

describe('recorrência', () => {
  it('mantém o dia e usa o último dia em meses curtos', () => expect(occurrences(rec(), '2025-04-30')).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']));
  it('respeita parcelas e fim', () => {
    expect(occurrences(rec({ installments: 2 }), '2026-01-01')).toHaveLength(2);
    expect(occurrences(rec({ endDate: '2025-02-28' }), '2026-01-01')).toHaveLength(2);
    expect(occurrences(rec({ frequency: 'weekly', startDate: '2025-01-01' }), '2025-01-22')).toHaveLength(4);
  });
  it('não duplica nem recria ocorrências excluídas', () => {
    const existing = new Set(['r1|2025-01-31']);
    const add = pendingTransactions(rec({ skipped: ['2025-02-28'], installments: 4 }), '2025-12-31', existing);
    expect(add.map((t) => t.date)).toEqual(['2025-03-31', '2025-04-30']);
    expect(add[0].installment).toBe('3/4');
    expect(add.every((t) => t.status === 'planned')).toBe(true);
  });
});

describe('métricas', () => {
  const accounts: Account[] = [{ id: 'a', name: 'C', type: 'checking', initialBalance: 1000, color: '', createdAt: 0 }];
  const txs = [
    tx({ type: 'income', amount: 500, date: '2025-01-05', status: 'received' }),
    tx({ amount: 200, date: '2025-01-10' }),
    tx({ amount: 50, date: '2025-01-20', status: 'pending' }),
    tx({ amount: 300, date: '2025-02-10', status: 'planned' }),
  ];
  it('resumo do período separa realizado e pendente', () => {
    const s = summarize(txs, { start: '2025-01-01', end: '2025-01-31', label: '' });
    expect(s).toMatchObject({ income: 500, expense: 200, result: 300, expensePending: 50 });
    expect(s.expenseRatio).toBeCloseTo(0.4);
  });
  it('saldo usa apenas efetivados', () => expect(balanceAt(txs, accounts, '2025-12-31')).toBe(1300));
  it('projeção soma previstos a partir de hoje', () => {
    const p = projection(txs, accounts, '2025-01-31', 2, 15);
    expect(p.find((x) => x.date === '2025-01-31')!.realized).toBe(1300);
    expect(p.find((x) => x.date === '2025-01-31')!.projected).toBe(1250); // pendente atrasado conta hoje
    expect(p.at(-1)!.projected).toBe(950);
  });
  it('orçamento alerta perto do limite', () => {
    const b = budgetStatus([{ id: 'b', categoryId: 'c', limit: 240, createdAt: 0 }], txs, [], '2025-01');
    expect(b[0].level).toBe('near');
  });
  it('período anterior com meses inteiros', () => {
    const p = resolvePeriod('thisMonth', undefined, new Date(2025, 2, 15));
    expect(previousPeriod(p)).toMatchObject({ start: '2025-02-01', end: '2025-02-28' });
    expect(previousPeriod({ start: '2025-03-10', end: '2025-03-19', label: '' })).toMatchObject({ start: '2025-02-28', end: '2025-03-09' });
  });
});
