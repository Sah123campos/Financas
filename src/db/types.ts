// Modelos de dados da aplicação (persistidos no IndexedDB)

export type TxType = 'income' | 'expense';
export type TxStatus = 'paid' | 'received' | 'pending' | 'planned';

export interface Category {
  id: string;
  name: string;
  kind: TxType | 'both';
  color: string;
  icon: string;
  createdAt: number;
}

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit' | 'investment' | 'other';
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  color: string;
  createdAt: number;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number; // sempre positivo; o sinal vem do tipo
  type: TxType;
  categoryId: string;
  date: string; // yyyy-MM-dd
  accountId: string;
  paymentMethod: string;
  status: TxStatus;
  recurringId?: string;
  occurrence?: string; // data original da ocorrência (chave anti-duplicação)
  installment?: string; // ex. "3/10"
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type Frequency = 'weekly' | 'monthly' | 'yearly';
export interface Recurring {
  id: string;
  description: string;
  amount: number;
  type: TxType;
  categoryId: string;
  accountId: string;
  paymentMethod: string;
  frequency: Frequency;
  startDate: string;
  endDate?: string;
  installments?: number; // parcelamento: número total de parcelas
  skipped: string[]; // ocorrências excluídas manualmente (não recriar)
  active: boolean;
  notes?: string;
  createdAt: number;
}

export interface Budget {
  id: string;
  categoryId: string;
  limit: number; // mensal
  createdAt: number;
}

export type GoalKind = 'monthly_saving' | 'purchase' | 'reserve';
export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  target: number;
  current: number; // valor já guardado (não usado em monthly_saving)
  deadline?: string;
  color: string;
  createdAt: number;
}

// ---------- Planilhas ----------
export type ColumnType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'boolean';
export interface Column {
  key: string;
  name: string;
  type: ColumnType;
}
export type CellValue = string | number | boolean | null;
export interface Row {
  _id: string;
  [key: string]: CellValue;
}
export interface Dataset {
  id: string;
  name: string;
  description?: string;
  columns: Column[];
  rows: Row[];
  source: string; // ex. "arquivo vendas.xlsx", "manual", "modelo"
  createdAt: number;
  updatedAt: number;
}

// ---------- Dashboards ----------
export type ChartType =
  | 'bar' | 'hbar' | 'stackedBar' | 'groupedBar' | 'line' | 'area' | 'stackedArea'
  | 'pie' | 'donut' | 'scatter' | 'histogram' | 'pareto' | 'waterfall' | 'radar'
  | 'funnel' | 'heatmap' | 'combo' | 'timeline' | 'table' | 'pivot' | 'kpi' | 'gauge' | 'progress';

export type Agg = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'countDistinct';
export type DateGrain = 'none' | 'day' | 'month' | 'quarter' | 'year';
export type FilterOp = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'between';
export interface Filter {
  col: string;
  op: FilterOp;
  value: CellValue | CellValue[];
  grain?: DateGrain; // quando o filtro compara a chave de período de uma data
}
export interface ValueSpec {
  col: string; // '' = contagem de registros
  agg: Agg;
  label?: string;
  color?: string;
  as?: 'bar' | 'line'; // para gráfico combinado
}
export type ValueFormat = 'auto' | 'number' | 'currency' | 'percent';
export interface ChartConfig {
  category?: string;
  grain: DateGrain;
  values: ValueSpec[];
  series?: string; // coluna de legenda (divide em séries)
  filters: Filter[];
  sort: 'none' | 'valueDesc' | 'valueAsc' | 'labelAsc' | 'labelDesc';
  limit?: number;
  showLegend: boolean;
  showLabels: boolean;
  showAxis: boolean;
  format: ValueFormat;
  decimals: number;
  showTotal: boolean;
  zoom: boolean;
  target?: number;
  bins?: number;
  drillTo?: string; // coluna para detalhar (drill-down categórico)
  colors?: string[];
}
export interface WidgetLayout { x: number; y: number; w: number; h: number }
export interface Widget {
  id: string;
  type: ChartType;
  title: string;
  subtitle?: string;
  datasetId: string;
  config: ChartConfig;
  layout: WidgetLayout;
}
export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  widgets: Widget[];
  filters: Filter[]; // filtros iniciais/salvos do painel
  createdAt: number;
  updatedAt: number;
}

// ---------- Compartilhamento ----------
export interface ShareRecord {
  id: string;
  direction: 'sent' | 'received';
  name: string;
  dashboardId?: string; // dashboard local (enviado) ou importado (recebido)
  createdAt: number;
  sizeBytes: number;
  method: 'link' | 'file';
}
