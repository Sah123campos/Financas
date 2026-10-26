// Interpretação de valores brutos (texto de planilhas) em tipos tipados.
import type { CellValue, ColumnType } from '@/db/types';

const CURRENCY_RE = /(R\$|US\$|\$|€|£|BRL|USD|EUR)/i;

/** Converte "1.234,56", "1,234.56", "R$ -10,00", "(10)" em número. Retorna null se não for número. */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean' || raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(CURRENCY_RE, '').replace(/%$/, '').replace(/\s| /g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const commas = (s.match(/,/g) || []).length, dots = (s.match(/\./g) || []).length;
  if (commas && dots) {
    // o último separador é o decimal: "1.234,56" (BR) ou "1,234.56" (US)
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (commas) {
    // "12,5" → decimal (padrão BR); "1,234,567" → milhar
    s = commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (dots > 1) {
    s = s.replace(/\./g, ''); // "1.234.567"
  } else if (dots === 1) {
    // "1.234" no padrão BR é milhar; "0.125" ou "12.5" é decimal
    const [a, b] = s.split('.');
    if (b.length === 3 && a.length >= 1 && a.length <= 3 && a !== '0') s = a + b;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Datas: Date, ISO, dd/mm/aaaa, dd-mm-aaaa, dd/mm/aa, número serial do Excel. */
export function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  }
  if (typeof raw === 'number') {
    // serial do Excel (1900) entre 1950 e 2100
    if (raw > 18000 && raw < 73051) {
      const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return null;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s.*)?$/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return valid(y, +m[2], +m[1]);
  }
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{4})$/); // mm/aaaa
  if (m) return valid(+m[2], +m[1], 1);
  return null;
}
const pad = (n: number) => String(n).padStart(2, '0');
function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  const s = String(raw ?? '').trim().toLowerCase();
  if (['sim', 's', 'true', 'verdadeiro', 'yes', 'y', '1', 'x'].includes(s)) return true;
  if (['não', 'nao', 'n', 'false', 'falso', 'no', '0'].includes(s)) return false;
  return null;
}

export function isEmpty(raw: unknown) { return raw == null || (typeof raw === 'string' && raw.trim() === ''); }

/** Converte um valor bruto para o tipo de coluna. `ok=false` quando não foi possível interpretar. */
export function coerce(raw: unknown, type: ColumnType): { value: CellValue; ok: boolean } {
  if (isEmpty(raw)) return { value: null, ok: true };
  switch (type) {
    case 'number':
    case 'currency': { const n = parseNumber(raw); return n == null ? { value: null, ok: false } : { value: n, ok: true }; }
    case 'percent': {
      if (typeof raw === 'number') return { value: raw, ok: true }; // Excel já guarda fração
      const s = String(raw);
      const n = parseNumber(s);
      if (n == null) return { value: null, ok: false };
      return { value: s.includes('%') ? n / 100 : (Math.abs(n) > 1 ? n / 100 : n), ok: true };
    }
    case 'date': { const d = parseDate(raw); return d == null ? { value: null, ok: false } : { value: d, ok: true }; }
    case 'boolean': { const b = parseBoolean(raw); return b == null ? { value: null, ok: false } : { value: b, ok: true }; }
    default: return { value: raw instanceof Date ? parseDate(raw) : String(raw).trim(), ok: true };
  }
}

/** Detecta o tipo predominante de uma coluna a partir de uma amostra. */
export function detectType(samples: unknown[], header = ''): ColumnType {
  const vals = samples.filter((v) => !isEmpty(v)).slice(0, 300);
  if (!vals.length) return 'text';
  const share = (fn: (v: unknown) => boolean) => vals.filter(fn).length / vals.length;
  const h = header.toLowerCase();
  if (share((v) => v instanceof Date || parseDate(v) != null) >= 0.85 && share((v) => typeof v === 'number' && !(+v > 18000 && +v < 73051)) < 0.5) {
    // números puros só contam como data se o cabeçalho sugerir
    const allNumbers = vals.every((v) => typeof v === 'number');
    if (!allNumbers || /data|date|dia|venc|vencimento|emiss/.test(h)) return 'date';
  }
  if (share((v) => typeof v === 'boolean' || (typeof v === 'string' && parseBoolean(v) != null && !/^\d$/.test(v.trim()))) >= 0.9) return 'boolean';
  if (share((v) => typeof v === 'string' && /%\s*$/.test(v.trim()) && parseNumber(v) != null) >= 0.8) return 'percent';
  const moneyHeader = /valor|pre[cç]o|total|receita|despesa|saldo|custo|r\$|amount|price|faturamento|lucro|venda|quantidade|qtd/.test(h);
  // com cabeçalho típico de número, aceitamos alguns valores inválidos (serão reportados)
  if (share((v) => parseNumber(v) != null) >= (moneyHeader ? 0.6 : 0.85)) {
    if (share((v) => typeof v === 'string' && CURRENCY_RE.test(v)) >= 0.5) return 'currency';
    if (/valor|pre[cç]o|total|receita|despesa|saldo|custo|r\$|amount|price|faturamento|lucro|venda/.test(h)) return 'currency';
    if (/%|percent|taxa|margem/.test(h)) return 'percent';
    return 'number';
  }
  return 'text';
}

export const TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Texto', number: 'Número', currency: 'Moeda', percent: 'Percentual', date: 'Data', boolean: 'Sim/Não',
};
export const isNumericType = (t: ColumnType) => t === 'number' || t === 'currency' || t === 'percent';
