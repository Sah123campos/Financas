// Motor de filtros, agrupamentos e agregações usado por todos os gráficos.
import type { Agg, CellValue, Column, DateGrain, Filter, Row, ValueSpec } from '@/db/types';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const EMPTY_LABEL = '(vazio)';

/** Chave ordenável de período para uma data ISO. */
export function grainKey(iso: CellValue, grain: DateGrain): string {
  if (typeof iso !== 'string' || iso.length < 7) return EMPTY_LABEL;
  const y = iso.slice(0, 4), m = iso.slice(5, 7);
  switch (grain) {
    case 'year': return y;
    case 'quarter': return `${y}-T${Math.floor((+m - 1) / 3) + 1}`;
    case 'month': return `${y}-${m}`;
    case 'day': return iso.slice(0, 10);
    default: return iso.slice(0, 10);
  }
}
export function grainLabel(key: string, grain: DateGrain): string {
  if (key === EMPTY_LABEL) return key;
  switch (grain) {
    case 'year': return key;
    case 'quarter': return `${key.slice(6)}º tri ${key.slice(0, 4)}`;
    case 'month': return `${MONTHS[+key.slice(5, 7) - 1]}/${key.slice(2, 4)}`;
    default: { const [y, m, d] = key.split('-'); return d ? `${d}/${m}/${y.slice(2)}` : key; }
  }
}
export const GRAIN_LABELS: Record<DateGrain, string> = { none: 'Sem agrupamento', day: 'Dia', month: 'Mês', quarter: 'Trimestre', year: 'Ano' };
export const NEXT_GRAIN: Partial<Record<DateGrain, DateGrain>> = { year: 'quarter', quarter: 'month', month: 'day' };

/** Intervalo [início, fim] de datas coberto por uma chave de período (para drill-down). */
export function grainRange(key: string, grain: DateGrain): [string, string] | null {
  const y = +key.slice(0, 4);
  if (!y) return null;
  if (grain === 'year') return [`${y}-01-01`, `${y}-12-31`];
  if (grain === 'quarter') { const q = +key.slice(6); const sm = (q - 1) * 3 + 1; return [`${y}-${String(sm).padStart(2, '0')}-01`, `${y}-${String(sm + 2).padStart(2, '0')}-31`]; }
  if (grain === 'month') return [`${key}-01`, `${key}-31`];
  return [key, key];
}

export function displayKey(v: CellValue): string {
  if (v == null || v === '') return EMPTY_LABEL;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}

export function rowKey(row: Row, col: Column | undefined, grain: DateGrain): string {
  if (!col) return 'Total';
  const v = row[col.key];
  if (col.type === 'date' && grain !== 'none') return grainKey(v, grain);
  return displayKey(v);
}

function cmp(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true });
}

export function matchFilter(row: Row, f: Filter, columns: Column[]): boolean {
  const col = columns.find((c) => c.key === f.col);
  let v: CellValue = row[f.col];
  const grain = f.grain && f.grain !== 'none' ? f.grain : col?.type === 'date' && ['eq', 'neq', 'in'].includes(f.op) ? inferGrain(f.value) : undefined;
  if (col?.type === 'date' && grain) v = grainKey(v, grain);
  else if (f.op === 'eq' || f.op === 'neq' || f.op === 'in') v = displayKey(v);
  switch (f.op) {
    case 'eq': return v === displayKeyAny(f.value);
    case 'neq': return v !== displayKeyAny(f.value);
    case 'in': return Array.isArray(f.value) ? f.value.map(displayKeyAny).includes(String(v)) : v === displayKeyAny(f.value);
    case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
    case 'gt': return v != null && cmp(v, f.value as CellValue) > 0;
    case 'gte': return v != null && cmp(v, f.value as CellValue) >= 0;
    case 'lt': return v != null && cmp(v, f.value as CellValue) < 0;
    case 'lte': return v != null && cmp(v, f.value as CellValue) <= 0;
    case 'between': {
      const [a, b] = Array.isArray(f.value) ? f.value : [null, null];
      if (v == null) return false;
      return (a == null || a === '' || cmp(v, a) >= 0) && (b == null || b === '' || cmp(v, b) <= 0);
    }
  }
  return true;
}
/** Deduz o agrupamento de data pelo formato da chave (ex.: "2025-03" → mês). */
function inferGrain(value: unknown): DateGrain | undefined {
  const k = String(Array.isArray(value) ? value[0] ?? '' : value ?? '');
  if (/^\d{4}$/.test(k)) return 'year';
  if (/^\d{4}-T\d$/.test(k)) return 'quarter';
  if (/^\d{4}-\d{2}$/.test(k)) return 'month';
  return undefined;
}
function displayKeyAny(v: unknown): string { return displayKey(v as CellValue); }

export function applyFilters(rows: Row[], filters: Filter[], columns: Column[]): Row[] {
  const active = filters.filter((f) => columns.some((c) => c.key === f.col));
  if (!active.length) return rows;
  return rows.filter((r) => active.every((f) => matchFilter(r, f, columns)));
}

export function aggregate(rows: Row[], spec: ValueSpec): number {
  if (spec.agg === 'count' || !spec.col) return rows.length;
  if (spec.agg === 'countDistinct') return new Set(rows.map((r) => r[spec.col]).filter((v) => v != null && v !== '')).size;
  const nums: number[] = [];
  for (const r of rows) { const v = r[spec.col]; if (typeof v === 'number' && Number.isFinite(v)) nums.push(v); }
  if (!nums.length) return 0;
  switch (spec.agg) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
  }
  return 0;
}
export const AGG_LABELS: Record<Agg, string> = { sum: 'Soma', avg: 'Média', count: 'Contagem', min: 'Mínimo', max: 'Máximo', countDistinct: 'Contagem distinta' };

export function valueLabel(spec: ValueSpec, columns: Column[]): string {
  if (spec.label) return spec.label;
  const col = columns.find((c) => c.key === spec.col);
  if (!col || spec.agg === 'count') return 'Registros';
  return spec.agg === 'sum' ? col.name : `${AGG_LABELS[spec.agg]} de ${col.name}`;
}

export interface Pivot {
  keys: string[]; // chaves de categoria (ordenadas)
  labels: string[];
  series: { name: string; key: string; spec: ValueSpec; data: number[] }[];
  totals: number[]; // total por categoria (soma das séries do primeiro valor)
  rowsByKey: Map<string, Row[]>;
}

export interface PivotOptions {
  category?: string;
  grain: DateGrain;
  values: ValueSpec[];
  series?: string;
  sort: 'none' | 'valueDesc' | 'valueAsc' | 'labelAsc' | 'labelDesc';
  limit?: number;
}

/** Agrupa linhas por categoria (e opcionalmente por série) e agrega os valores. */
export function pivot(rows: Row[], columns: Column[], o: PivotOptions): Pivot {
  const catCol = columns.find((c) => c.key === o.category);
  const serCol = columns.find((c) => c.key === o.series);
  const isDateCat = catCol?.type === 'date' && o.grain !== 'none';
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = rowKey(r, catCol, o.grain);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  let keys = [...groups.keys()];
  const values = o.values.length ? o.values : [{ col: '', agg: 'count' as Agg }];
  const firstTotals = new Map(keys.map((k) => [k, aggregate(groups.get(k)!, values[0])]));

  // ordenação
  const sort = o.sort === 'none' && (isDateCat || catCol?.type === 'date' || catCol?.type === 'number') ? 'labelAsc' : o.sort;
  if (sort === 'valueDesc') keys.sort((a, b) => firstTotals.get(b)! - firstTotals.get(a)!);
  else if (sort === 'valueAsc') keys.sort((a, b) => firstTotals.get(a)! - firstTotals.get(b)!);
  else if (sort === 'labelAsc') keys.sort((a, b) => cmpKey(a, b, catCol?.type === 'number'));
  else if (sort === 'labelDesc') keys.sort((a, b) => cmpKey(b, a, catCol?.type === 'number'));

  // limite: agrupa o restante em "Outros"
  if (o.limit && o.limit > 0 && keys.length > o.limit) {
    const keep = keys.slice(0, o.limit), rest = keys.slice(o.limit);
    const otherRows = rest.flatMap((k) => groups.get(k)!);
    rest.forEach((k) => groups.delete(k));
    groups.set('Outros', otherRows);
    keys = [...keep, 'Outros'];
  }

  const labels = keys.map((k) => (isDateCat ? grainLabel(k, o.grain) : k));
  const series: Pivot['series'] = [];
  if (serCol) {
    const sKeys = [...new Set(rows.map((r) => rowKey(r, serCol, serCol.type === 'date' ? 'month' : 'none')))].sort((a, b) => cmpKey(a, b));
    const spec = values[0];
    for (const sk of sKeys) {
      series.push({
        name: serCol.type === 'date' ? grainLabel(sk, 'month') : sk, key: sk, spec,
        data: keys.map((k) => aggregate(groups.get(k)!.filter((r) => rowKey(r, serCol, serCol.type === 'date' ? 'month' : 'none') === sk), spec)),
      });
    }
  } else {
    for (const spec of values) {
      series.push({ name: valueLabel(spec, columns), key: spec.col + ':' + spec.agg, spec, data: keys.map((k) => aggregate(groups.get(k)!, spec)) });
    }
  }
  const totals = keys.map((_, i) => (serCol ? series.reduce((a, s) => a + s.data[i], 0) : series[0]?.data[i] ?? 0));
  return { keys, labels, series, totals, rowsByKey: groups };
}

function cmpKey(a: string, b: string, numeric = false): number {
  if (a === EMPTY_LABEL || a === 'Outros') return 1;
  if (b === EMPTY_LABEL || b === 'Outros') return -1;
  if (numeric) return Number(a) - Number(b);
  return a.localeCompare(b, 'pt-BR', { numeric: true });
}

/** Faixas de histograma. */
export function histogram(rows: Row[], col: string, bins = 10): { labels: string[]; counts: number[]; edges: number[] } {
  const nums = rows.map((r) => r[col]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return { labels: [], counts: [], edges: [] };
  const min = Math.min(...nums), max = Math.max(...nums);
  const n = Math.max(1, Math.min(50, Math.round(bins)));
  const width = max === min ? 1 : (max - min) / n;
  const counts = new Array(n).fill(0);
  for (const v of nums) counts[Math.min(n - 1, Math.floor((v - min) / width))]++;
  const edges = Array.from({ length: n + 1 }, (_, i) => min + i * width);
  return { labels: counts.map((_, i) => `${round(edges[i])} – ${round(edges[i + 1])}`), counts, edges };
}
const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('pt-BR') : (+v.toFixed(2)).toLocaleString('pt-BR'));

/** Valores distintos de uma coluna (para filtros), com contagem. */
export function distinctValues(rows: Row[], col: Column, grain: DateGrain = 'none'): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = rowKey(r, col, grain); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => cmpKey(a.key, b.key));
}
