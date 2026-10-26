import { db } from '@/db/schema';
import { tracked } from '@/state/saveStatus';
import { syncRecurring } from '@/db/repo';
import { sampleFinance, type Template } from './templates';
import { todayISO } from '@/lib/dates';

export async function applyTemplate(t: Template): Promise<string> {
  const { datasets, dashboard } = t.build();
  await tracked(() => db.transaction('rw', db.datasets, db.dashboards, async () => {
    if (datasets.length) await db.datasets.bulkPut(datasets);
    await db.dashboards.put(dashboard);
  }));
  return dashboard.id;
}

/** Carrega lançamentos, recorrências, orçamentos e metas de exemplo. */
export async function loadSampleFinance() {
  const s = sampleFinance();
  await tracked(() => db.transaction('rw', [db.transactions, db.recurring, db.budgets, db.goals], async () => {
    await db.transactions.bulkPut(s.transactions);
    await db.recurring.bulkPut(s.recurring);
    for (const b of s.budgets) if (!(await db.budgets.where('categoryId').equals(b.categoryId).count())) await db.budgets.put(b);
    await db.goals.bulkPut(s.goals);
  }));
  await syncRecurring();
  // ocorrências recorrentes já vencidas no exemplo são marcadas como efetivadas
  const today = todayISO();
  const ids = new Set(s.recurring.map((r) => r.id));
  await db.transactions.filter((t) => !!t.recurringId && ids.has(t.recurringId) && t.status === 'planned' && t.date <= today)
    .modify((t) => { t.status = t.type === 'income' ? 'received' : 'paid'; });
}
