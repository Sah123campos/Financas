// Camada de acesso a dados: todas as escritas passam por aqui (com indicador de salvamento).
import { db } from './schema';
import type { Account, Budget, Category, Dashboard, Dataset, Goal, Recurring, ShareRecord, Transaction } from './types';
import { tracked } from '@/state/saveStatus';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/finance/defaults';
import { forecastHorizon, pendingTransactions } from '@/finance/recurrence';
import { uid } from '@/lib/id';

export async function ensureSeed() {
  const n = await db.categories.count();
  if (n === 0) {
    const now = Date.now();
    await db.transaction('rw', db.categories, db.accounts, async () => {
      await db.categories.bulkPut(DEFAULT_CATEGORIES.map((c) => ({ ...c, createdAt: now })));
      if ((await db.accounts.count()) === 0) await db.accounts.bulkPut(DEFAULT_ACCOUNTS.map((a) => ({ ...a, createdAt: now })));
    });
  }
}

// ---------- Lançamentos ----------
export const saveTransaction = (t: Transaction) => tracked(() => db.transactions.put({ ...t, updatedAt: Date.now() }));
export const saveTransactions = (ts: Transaction[]) => tracked(() => db.transactions.bulkPut(ts));
export async function deleteTransactions(ids: string[]) {
  return tracked(() => db.transaction('rw', db.transactions, db.recurring, async () => {
    const txs = await db.transactions.bulkGet(ids);
    // ocorrências recorrentes excluídas não devem ser recriadas
    for (const t of txs) {
      if (t?.recurringId && t.occurrence) {
        const r = await db.recurring.get(t.recurringId);
        if (r && !r.skipped.includes(t.occurrence)) await db.recurring.update(r.id, { skipped: [...r.skipped, t.occurrence] });
      }
    }
    await db.transactions.bulkDelete(ids);
  }));
}
export const setTransactionStatus = (ids: string[], status: Transaction['status']) =>
  tracked(() => db.transactions.where('id').anyOf(ids).modify({ status, updatedAt: Date.now() }));

// ---------- Recorrências ----------
export async function saveRecurring(r: Recurring, regenerateFuture = false) {
  return tracked(async () => {
    await db.transaction('rw', db.recurring, db.transactions, async () => {
      await db.recurring.put(r);
      if (regenerateFuture) {
        // remove previsões ainda não realizadas para recriá-las com os novos dados
        await db.transactions.where('recurringId').equals(r.id).filter((t) => t.status === 'planned').delete();
      }
    });
    await syncRecurring();
  });
}
export async function deleteRecurring(id: string, removePlanned: boolean) {
  return tracked(() => db.transaction('rw', db.recurring, db.transactions, async () => {
    await db.recurring.delete(id);
    if (removePlanned) await db.transactions.where('recurringId').equals(id).filter((t) => t.status === 'planned').delete();
  }));
}
/** Materializa previsões até o horizonte. A chave [recurringId+occurrence] impede duplicações. */
export async function syncRecurring(until = forecastHorizon()) {
  const rules = await db.recurring.toArray();
  if (!rules.length) return 0;
  return db.transaction('rw', db.transactions, async () => {
    let created = 0;
    for (const r of rules) {
      const existing = new Set((await db.transactions.where('recurringId').equals(r.id).toArray()).map((t) => `${r.id}|${t.occurrence}`));
      const add = pendingTransactions(r, until, existing);
      if (add.length) { await db.transactions.bulkAdd(add); created += add.length; }
    }
    return created;
  });
}

// ---------- Cadastros simples ----------
export const saveCategory = (c: Category) => tracked(() => db.categories.put(c));
export async function deleteCategory(id: string, moveTo: string) {
  return tracked(() => db.transaction('rw', [db.categories, db.transactions, db.recurring, db.budgets], async () => {
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: moveTo });
    await db.recurring.filter((r) => r.categoryId === id).modify({ categoryId: moveTo });
    await db.budgets.where('categoryId').equals(id).delete();
    await db.categories.delete(id);
  }));
}
export const saveAccount = (a: Account) => tracked(() => db.accounts.put(a));
export async function deleteAccount(id: string, moveTo: string) {
  return tracked(() => db.transaction('rw', db.accounts, db.transactions, db.recurring, async () => {
    await db.transactions.where('accountId').equals(id).modify({ accountId: moveTo });
    await db.recurring.filter((r) => r.accountId === id).modify({ accountId: moveTo });
    await db.accounts.delete(id);
  }));
}
export const saveBudget = (b: Budget) => tracked(() => db.budgets.put(b));
export const deleteBudget = (id: string) => tracked(() => db.budgets.delete(id));
export const saveGoal = (g: Goal) => tracked(() => db.goals.put(g));
export const deleteGoal = (id: string) => tracked(() => db.goals.delete(id));

// ---------- Planilhas e dashboards ----------
export const saveDataset = (d: Dataset) => tracked(() => db.datasets.put({ ...d, updatedAt: Date.now() }));
export async function deleteDataset(id: string) {
  return tracked(() => db.transaction('rw', db.datasets, db.dashboards, async () => {
    await db.datasets.delete(id);
    // remove os gráficos que dependiam desta planilha
    await db.dashboards.toCollection().modify((d) => { d.widgets = d.widgets.filter((w) => w.datasetId !== id); });
  }));
}
export const saveDashboard = (d: Dashboard) => tracked(() => db.dashboards.put({ ...d, updatedAt: Date.now() }));
export const deleteDashboard = (id: string) => tracked(() => db.dashboards.delete(id));
export async function duplicateDashboard(id: string) {
  const d = await db.dashboards.get(id);
  if (!d) return;
  const copy: Dashboard = { ...structuredClone(d), id: uid('db'), name: d.name + ' (cópia)', createdAt: Date.now(), updatedAt: Date.now() };
  copy.widgets = copy.widgets.map((w) => ({ ...w, id: uid('w') }));
  await saveDashboard(copy);
  return copy.id;
}
export const saveShareRecord = (s: ShareRecord) => tracked(() => db.shares.put(s));
export const deleteShareRecord = (id: string) => tracked(() => db.shares.delete(id));
