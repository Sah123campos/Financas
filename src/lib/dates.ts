import {
  addDays, addMonths, endOfMonth, endOfYear, format, parseISO, startOfMonth, startOfYear, subDays, subMonths, subYears, differenceInCalendarDays,
} from 'date-fns';

export const toISO = (d: Date) => format(d, 'yyyy-MM-dd');
export const todayISO = () => toISO(new Date());
export const fromISO = (s: string) => parseISO(s);

export interface Period { start: string; end: string; label: string }
export const PERIOD_PRESETS: { id: string; label: string }[] = [
  { id: 'thisMonth', label: 'Este mês' },
  { id: 'lastMonth', label: 'Mês anterior' },
  { id: 'last7', label: 'Últimos 7 dias' },
  { id: 'last30', label: 'Últimos 30 dias' },
  { id: 'last90', label: 'Últimos 90 dias' },
  { id: 'thisYear', label: 'Este ano' },
  { id: 'lastYear', label: 'Ano anterior' },
  { id: 'custom', label: 'Personalizado' },
];

export function resolvePeriod(id: string, custom?: { start: string; end: string }, now = new Date()): Period {
  const label = PERIOD_PRESETS.find((p) => p.id === id)?.label ?? 'Período';
  switch (id) {
    case 'lastMonth': { const m = subMonths(now, 1); return { start: toISO(startOfMonth(m)), end: toISO(endOfMonth(m)), label }; }
    case 'last7': return { start: toISO(subDays(now, 6)), end: toISO(now), label };
    case 'last30': return { start: toISO(subDays(now, 29)), end: toISO(now), label };
    case 'last90': return { start: toISO(subDays(now, 89)), end: toISO(now), label };
    case 'thisYear': return { start: toISO(startOfYear(now)), end: toISO(endOfYear(now)), label };
    case 'lastYear': { const y = subYears(now, 1); return { start: toISO(startOfYear(y)), end: toISO(endOfYear(y)), label }; }
    case 'custom':
      if (custom?.start && custom?.end) return { start: custom.start, end: custom.end, label: 'Personalizado' };
      return { start: toISO(startOfMonth(now)), end: toISO(endOfMonth(now)), label: 'Este mês' };
    default: return { start: toISO(startOfMonth(now)), end: toISO(endOfMonth(now)), label: 'Este mês' };
  }
}

/** Período imediatamente anterior, com a mesma duração (meses inteiros quando aplicável). */
export function previousPeriod(p: Period): Period {
  const s = parseISO(p.start), e = parseISO(p.end);
  const isWholeMonths = s.getDate() === 1 && toISO(endOfMonth(e)) === p.end;
  if (isWholeMonths) {
    const months = (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1;
    const ps = subMonths(s, months);
    return { start: toISO(ps), end: toISO(endOfMonth(addMonths(ps, months - 1))), label: 'Período anterior' };
  }
  const len = differenceInCalendarDays(e, s) + 1;
  return { start: toISO(subDays(s, len)), end: toISO(subDays(s, 1)), label: 'Período anterior' };
}

export const inRange = (iso: string, p: { start: string; end: string }) => iso >= p.start && iso <= p.end;
export { addDays, addMonths, format, parseISO, startOfMonth, endOfMonth };
