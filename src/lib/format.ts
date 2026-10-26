import { getPrefs } from '@/state/prefs';
import type { ColumnType, ValueFormat } from '@/db/types';

const cache = new Map<string, Intl.NumberFormat>();
function nf(key: string, opts: Intl.NumberFormatOptions) {
  const { locale } = getPrefs();
  const k = locale + key;
  let f = cache.get(k);
  if (!f) {
    try { f = new Intl.NumberFormat(locale, opts); } catch { f = new Intl.NumberFormat('pt-BR', opts); }
    cache.set(k, f);
  }
  return f;
}
export function clearFormatCache() { cache.clear(); }

export function fmtMoney(v: number, decimals = 2, compact = false): string {
  const { currency } = getPrefs();
  if (!Number.isFinite(v)) return '—';
  // abaixo de 10 mil a notação compacta repete rótulos ("R$ 5 mil" para 4.931 e 4.977)
  if (compact && Math.abs(v) < 10000) return nf(`m${currency}0s`, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  return nf(`m${currency}${decimals}${compact}`, {
    style: 'currency', currency, minimumFractionDigits: compact ? 0 : decimals, maximumFractionDigits: compact ? 1 : decimals,
    notation: compact ? 'compact' : 'standard',
  }).format(v);
}
export function fmtNumber(v: number, decimals = 0, compact = false): string {
  if (!Number.isFinite(v)) return '—';
  if (compact && Math.abs(v) < 10000) return nf(`n${Math.min(decimals, 2)}s`, { maximumFractionDigits: Math.abs(v) < 10 ? Math.min(decimals, 2) : 0 }).format(v);
  return nf(`n${decimals}${compact}`, { maximumFractionDigits: compact ? 1 : decimals, minimumFractionDigits: compact ? 0 : decimals, notation: compact ? 'compact' : 'standard' }).format(v);
}
/** v em fração (0.12 = 12%) */
export function fmtPercent(v: number, decimals = 1): string {
  if (!Number.isFinite(v)) return '—';
  return nf(`p${decimals}`, { style: 'percent', maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(v);
}

export function fmtValue(v: number, format: ValueFormat, decimals = 2, colType?: ColumnType, compact = false): string {
  const f = format === 'auto' ? (colType === 'currency' ? 'currency' : colType === 'percent' ? 'percent' : 'number') : format;
  if (f === 'currency') return fmtMoney(v, decimals, compact);
  if (f === 'percent') return fmtPercent(v, decimals);
  return fmtNumber(v, Number.isInteger(v) && !compact ? 0 : decimals, compact);
}

export function fmtDate(iso: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  const dt = new Date(y, (m || 1) - 1, d || 1);
  try {
    return dt.toLocaleDateString(getPrefs().locale, style === 'long' ? { day: '2-digit', month: 'long', year: 'numeric' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return iso; }
}

export function currencySymbol(): string {
  const parts = nf('sym' + getPrefs().currency, { style: 'currency', currency: getPrefs().currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? getPrefs().currency;
}
