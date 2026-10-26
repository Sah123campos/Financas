import Dexie, { type Table } from 'dexie';
import type { Account, Budget, Category, Dashboard, Dataset, Goal, Recurring, ShareRecord, Transaction } from './types';

export class AppDB extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  accounts!: Table<Account, string>;
  recurring!: Table<Recurring, string>;
  budgets!: Table<Budget, string>;
  goals!: Table<Goal, string>;
  datasets!: Table<Dataset, string>;
  dashboards!: Table<Dashboard, string>;
  shares!: Table<ShareRecord, string>;

  constructor() {
    super('painel-financas');
    this.version(1).stores({
      transactions: 'id, date, type, categoryId, accountId, status, recurringId, [recurringId+occurrence], updatedAt',
      categories: 'id, name, kind',
      accounts: 'id, name',
      recurring: 'id, active',
      budgets: 'id, &categoryId',
      goals: 'id, kind',
      datasets: 'id, name, updatedAt',
      dashboards: 'id, name, updatedAt',
      shares: 'id, direction, createdAt',
    });
  }
}

export const db = new AppDB();

export const ALL_TABLES = ['transactions', 'categories', 'accounts', 'recurring', 'budgets', 'goals', 'datasets', 'dashboards', 'shares'] as const;
export type TableName = (typeof ALL_TABLES)[number];
