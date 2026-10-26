// Expõe os lançamentos financeiros como uma "planilha virtual" para os dashboards.
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { Account, Category, Column, Dataset, Transaction } from '@/db/types';
import { STATUS_LABELS } from './defaults';

export const FINANCE_DATASET_ID = '__finance__';
export const FINANCE_COLUMNS: Column[] = [
  { key: 'data', name: 'Data', type: 'date' },
  { key: 'descricao', name: 'Descrição', type: 'text' },
  { key: 'categoria', name: 'Categoria', type: 'text' },
  { key: 'tipo', name: 'Tipo', type: 'text' },
  { key: 'valor', name: 'Valor', type: 'currency' },
  { key: 'valor_sinal', name: 'Valor (+/−)', type: 'currency' },
  { key: 'receita', name: 'Receitas', type: 'currency' },
  { key: 'despesa', name: 'Despesas', type: 'currency' },
  { key: 'conta', name: 'Conta', type: 'text' },
  { key: 'forma', name: 'Forma de pagamento', type: 'text' },
  { key: 'situacao', name: 'Situação', type: 'text' },
];

export function financeDataset(txs: Transaction[], categories: Category[], accounts: Account[]): Dataset {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  return {
    id: FINANCE_DATASET_ID, name: 'Lançamentos financeiros', description: 'Atualizado automaticamente a partir da Gestão financeira.',
    columns: FINANCE_COLUMNS, source: 'Gestão financeira', createdAt: 0, updatedAt: Date.now(),
    rows: txs.map((t) => ({
      _id: t.id, data: t.date, descricao: t.description, categoria: cat.get(t.categoryId) ?? 'Sem categoria',
      tipo: t.type === 'income' ? 'Receita' : 'Despesa', valor: t.amount, valor_sinal: t.type === 'income' ? t.amount : -t.amount,
      receita: t.type === 'income' ? t.amount : 0, despesa: t.type === 'expense' ? t.amount : 0,
      conta: acc.get(t.accountId) ?? '—', forma: t.paymentMethod || 'Não informado', situacao: STATUS_LABELS[t.status],
    })),
  };
}

/** Cores das categorias (para que os gráficos usem as cores escolhidas pelo usuário). */
export function categoryColors(categories: Category[]): Record<string, string> {
  return Object.fromEntries(categories.map((c) => [c.name, c.color]));
}

export function useFinanceData() {
  return useLiveQuery(async () => {
    const [transactions, categories, accounts, budgets, goals, recurring] = await Promise.all([
      db.transactions.orderBy('date').reverse().toArray(), db.categories.toArray(), db.accounts.toArray(),
      db.budgets.toArray(), db.goals.toArray(), db.recurring.toArray(),
    ]);
    categories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return { transactions, categories, accounts, budgets, goals, recurring };
  }, []);
}

/** Todas as planilhas (incluindo a virtual de finanças) — para o construtor de dashboards. */
export function useAllDatasets(): { datasets: Dataset[]; colors: Record<string, string> } | undefined {
  return useLiveQuery(async () => {
    const [ds, txs, cats, accs] = await Promise.all([db.datasets.toArray(), db.transactions.toArray(), db.categories.toArray(), db.accounts.toArray()]);
    return { datasets: [financeDataset(txs, cats, accs), ...ds.sort((a, b) => b.updatedAt - a.updatedAt)], colors: categoryColors(cats) };
  }, []);
}
