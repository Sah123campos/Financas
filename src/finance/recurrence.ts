// Geração de lançamentos previstos a partir de regras recorrentes, sem duplicar.
import { addMonths, addWeeks, addYears, format, parseISO, endOfMonth } from 'date-fns';
import type { Recurring, Transaction } from '@/db/types';
import { uid } from '@/lib/id';

export const FREQ_LABELS = { weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' } as const;

/** Datas das ocorrências de uma regra até `until` (inclusive). */
export function occurrences(r: Recurring, until: string): string[] {
  const out: string[] = [];
  const start = parseISO(r.startDate);
  const day = start.getDate();
  const limit = r.endDate && r.endDate < until ? r.endDate : until;
  for (let i = 0; i < 1000; i++) {
    if (r.installments && i >= r.installments) break;
    let d: Date;
    if (r.frequency === 'weekly') d = addWeeks(start, i);
    else if (r.frequency === 'yearly') d = addYears(start, i);
    else {
      // mantém o dia do mês original; usa o último dia quando o mês é mais curto
      const m = addMonths(new Date(start.getFullYear(), start.getMonth(), 1), i);
      const last = endOfMonth(m).getDate();
      d = new Date(m.getFullYear(), m.getMonth(), Math.min(day, last));
    }
    const iso = format(d, 'yyyy-MM-dd');
    if (iso > limit) break;
    out.push(iso);
  }
  return out;
}

/** Cria os lançamentos que ainda não existem. `existing` = chaves "recurringId|occurrence" já gravadas. */
export function pendingTransactions(r: Recurring, until: string, existing: Set<string>): Transaction[] {
  if (!r.active) return [];
  const dates = occurrences(r, until);
  const now = Date.now();
  return dates
    .map((date, i) => ({ date, i }))
    .filter(({ date }) => !existing.has(`${r.id}|${date}`) && !r.skipped.includes(date))
    .map(({ date, i }) => ({
      id: uid('tx'), description: r.description, amount: r.amount, type: r.type, categoryId: r.categoryId, accountId: r.accountId,
      paymentMethod: r.paymentMethod, status: 'planned' as const, date, recurringId: r.id, occurrence: date,
      installment: r.installments ? `${i + 1}/${r.installments}` : undefined, notes: r.notes, createdAt: now, updatedAt: now,
    }));
}

/** Horizonte padrão de previsões: fim do 3º mês a partir de hoje. */
export function forecastHorizon(now = new Date()): string {
  return format(endOfMonth(addMonths(now, 3)), 'yyyy-MM-dd');
}
