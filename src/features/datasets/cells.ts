import type { CellValue, ColumnType } from '@/db/types';
import { fmtDate, fmtMoney, fmtNumber, fmtPercent } from '@/lib/format';

export function formatCell(v: CellValue, type: ColumnType): string {
  if (v == null || v === '') return '';
  switch (type) {
    case 'currency': return typeof v === 'number' ? fmtMoney(v) : String(v);
    case 'number': return typeof v === 'number' ? fmtNumber(v, Number.isInteger(v) ? 0 : 2) : String(v);
    case 'percent': return typeof v === 'number' ? fmtPercent(v, 2) : String(v);
    case 'date': return typeof v === 'string' ? fmtDate(v) : String(v);
    case 'boolean': return v === true ? 'Sim' : v === false ? 'Não' : String(v);
    default: return String(v);
  }
}
