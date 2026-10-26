import type { Account, Category } from '@/db/types';

export const DEFAULT_CATEGORIES: Omit<Category, 'createdAt'>[] = [
  { id: 'cat_salario', name: 'Salário', kind: 'income', color: '#0ca30c', icon: 'Briefcase' },
  { id: 'cat_freela', name: 'Freelances e serviços', kind: 'income', color: '#1baf7a', icon: 'Laptop' },
  { id: 'cat_rendimentos', name: 'Rendimentos', kind: 'income', color: '#008300', icon: 'TrendingUp' },
  { id: 'cat_moradia', name: 'Moradia', kind: 'expense', color: '#2a78d6', icon: 'Home' },
  { id: 'cat_alimentacao', name: 'Alimentação', kind: 'expense', color: '#eb6834', icon: 'UtensilsCrossed' },
  { id: 'cat_transporte', name: 'Transporte', kind: 'expense', color: '#6250d6', icon: 'Car' },
  { id: 'cat_saude', name: 'Saúde', kind: 'expense', color: '#e34948', icon: 'HeartPulse' },
  { id: 'cat_educacao', name: 'Educação', kind: 'expense', color: '#eda100', icon: 'GraduationCap' },
  { id: 'cat_lazer', name: 'Lazer', kind: 'expense', color: '#e87ba4', icon: 'PartyPopper' },
  { id: 'cat_assinaturas', name: 'Assinaturas', kind: 'expense', color: '#9085e9', icon: 'Repeat' },
  { id: 'cat_compras', name: 'Compras', kind: 'expense', color: '#d95926', icon: 'ShoppingBag' },
  { id: 'cat_investimentos', name: 'Investimentos', kind: 'both', color: '#199e70', icon: 'PiggyBank' },
  { id: 'cat_outros', name: 'Outros', kind: 'both', color: '#898781', icon: 'Tag' },
];

export const DEFAULT_ACCOUNTS: Omit<Account, 'createdAt'>[] = [
  { id: 'acc_corrente', name: 'Conta corrente', type: 'checking', initialBalance: 0, color: '#2a78d6' },
  { id: 'acc_carteira', name: 'Carteira', type: 'cash', initialBalance: 0, color: '#1baf7a' },
];

export const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto', 'Transferência', 'Débito automático', 'Outro'];

export const ACCOUNT_TYPES: Record<Account['type'], string> = {
  checking: 'Conta corrente', savings: 'Poupança', cash: 'Dinheiro / carteira', credit: 'Cartão de crédito', investment: 'Investimentos', other: 'Outra',
};

export const STATUS_LABELS = { paid: 'Pago', received: 'Recebido', pending: 'Pendente', planned: 'Previsto' } as const;
export const isRealized = (s: string) => s === 'paid' || s === 'received';

export const CATEGORY_ICONS = ['Briefcase', 'Laptop', 'TrendingUp', 'Home', 'UtensilsCrossed', 'Car', 'HeartPulse', 'GraduationCap', 'PartyPopper', 'Repeat', 'ShoppingBag', 'PiggyBank', 'Tag', 'Plane', 'Gift', 'Baby', 'Dog', 'Dumbbell', 'Shirt', 'Smartphone', 'Wifi', 'Zap', 'Droplets', 'Fuel', 'Coffee', 'Receipt', 'Landmark', 'Wrench'];
