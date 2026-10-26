// Backup completo, restauração validada (Zod), exportação CSV e exclusão de dados.
import { z } from 'zod';
import Papa from 'papaparse';
import { db, ALL_TABLES } from './schema';
import { tracked } from '@/state/saveStatus';
import { STATUS_LABELS } from '@/finance/defaults';
import { ensureSeed } from './repo';

const BACKUP_KIND = 'painel-financas-backup';
const id = z.string().min(1).max(100);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const filter = z.object({ col: z.string(), op: z.enum(['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'between']), value: z.union([cell, z.array(cell)]), grain: z.enum(['none', 'day', 'month', 'quarter', 'year']).optional() });

export const schemas = {
  transactions: z.object({ id, description: z.string().max(500), amount: z.number().finite().nonnegative(), type: z.enum(['income', 'expense']), categoryId: z.string(), date: iso, accountId: z.string(), paymentMethod: z.string(), status: z.enum(['paid', 'received', 'pending', 'planned']), recurringId: z.string().optional(), occurrence: z.string().optional(), installment: z.string().optional(), notes: z.string().optional(), createdAt: z.number(), updatedAt: z.number() }),
  categories: z.object({ id, name: z.string().min(1).max(80), kind: z.enum(['income', 'expense', 'both']), color: z.string(), icon: z.string(), createdAt: z.number() }),
  accounts: z.object({ id, name: z.string().min(1).max(80), type: z.enum(['checking', 'savings', 'cash', 'credit', 'investment', 'other']), initialBalance: z.number().finite(), color: z.string(), createdAt: z.number() }),
  recurring: z.object({ id, description: z.string(), amount: z.number().finite().nonnegative(), type: z.enum(['income', 'expense']), categoryId: z.string(), accountId: z.string(), paymentMethod: z.string(), frequency: z.enum(['weekly', 'monthly', 'yearly']), startDate: iso, endDate: iso.optional(), installments: z.number().int().positive().optional(), skipped: z.array(z.string()), active: z.boolean(), notes: z.string().optional(), createdAt: z.number() }),
  budgets: z.object({ id, categoryId: z.string(), limit: z.number().finite().nonnegative(), createdAt: z.number() }),
  goals: z.object({ id, name: z.string().min(1), kind: z.enum(['monthly_saving', 'purchase', 'reserve']), target: z.number().finite().nonnegative(), current: z.number().finite(), deadline: iso.optional(), color: z.string(), createdAt: z.number() }),
  datasets: z.object({ id, name: z.string().min(1), description: z.string().optional(), columns: z.array(z.object({ key: z.string().min(1), name: z.string(), type: z.enum(['text', 'number', 'currency', 'percent', 'date', 'boolean']) })), rows: z.array(z.record(cell).and(z.object({ _id: z.string() }))), source: z.string(), createdAt: z.number(), updatedAt: z.number() }),
  dashboards: z.object({
    id, name: z.string().min(1), description: z.string().optional(), filters: z.array(filter), createdAt: z.number(), updatedAt: z.number(),
    widgets: z.array(z.object({
      id, type: z.string(), title: z.string(), subtitle: z.string().optional(), datasetId: z.string(),
      config: z.object({ values: z.array(z.object({ col: z.string(), agg: z.enum(['sum', 'avg', 'count', 'min', 'max', 'countDistinct']) }).passthrough()), filters: z.array(filter) }).passthrough(),
      layout: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    })),
  }),
  shares: z.object({ id, direction: z.enum(['sent', 'received']), name: z.string(), dashboardId: z.string().optional(), createdAt: z.number(), sizeBytes: z.number(), method: z.enum(['link', 'file']) }),
} as const;

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown[]> = {};
  for (const t of ALL_TABLES) data[t] = await db.table(t).toArray();
  let prefs: unknown = null;
  try { prefs = JSON.parse(localStorage.getItem('pf.prefs') || 'null'); } catch { /* ignora */ }
  return new Blob([JSON.stringify({ kind: BACKUP_KIND, version: 1, exportedAt: new Date().toISOString(), prefs, data })], { type: 'application/json' });
}

export interface RestoreReport { counts: Record<string, number>; rejected: Record<string, number> }

export async function restoreBackup(text: string, mode: 'replace' | 'merge'): Promise<RestoreReport> {
  let json: { kind?: string; data?: Record<string, unknown[]> };
  try { json = JSON.parse(text); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  if (json.kind !== BACKUP_KIND || !json.data) throw new Error('Este arquivo não é um backup do Painel Finanças.');
  const counts: Record<string, number> = {}, rejected: Record<string, number> = {};
  const clean: Record<string, unknown[]> = {};
  for (const t of ALL_TABLES) {
    const rows = Array.isArray(json.data[t]) ? json.data[t] : [];
    const ok: unknown[] = [];
    for (const r of rows) { const p = (schemas[t] as z.ZodTypeAny).safeParse(r); if (p.success) ok.push(r); }
    clean[t] = ok; counts[t] = ok.length; rejected[t] = rows.length - ok.length;
  }
  await tracked(() => db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      if (mode === 'replace') await db.table(t).clear();
      if (clean[t].length) await db.table(t).bulkPut(clean[t]);
    }
  }));
  await ensureSeed();
  return { counts, rejected };
}

export async function exportTransactionsCSV(): Promise<Blob> {
  const [txs, cats, accs] = await Promise.all([db.transactions.orderBy('date').toArray(), db.categories.toArray(), db.accounts.toArray()]);
  const cat = new Map(cats.map((c) => [c.id, c.name])), acc = new Map(accs.map((a) => [a.id, a.name]));
  const csv = Papa.unparse(txs.map((t) => ({
    Data: t.date, 'Descrição': t.description, Tipo: t.type === 'income' ? 'Receita' : 'Despesa', Categoria: cat.get(t.categoryId) ?? '',
    Valor: t.amount.toFixed(2).replace('.', ','), Conta: acc.get(t.accountId) ?? '', 'Forma de pagamento': t.paymentMethod,
    'Situação': STATUS_LABELS[t.status], Parcela: t.installment ?? '', 'Observações': t.notes ?? '',
  })), { delimiter: ';' });
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
}

export async function wipeAll() {
  await tracked(() => db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => { for (const t of ALL_TABLES) await db.table(t).clear(); }));
  await ensureSeed();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted };
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
