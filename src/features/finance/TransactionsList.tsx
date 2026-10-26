import { useMemo, useState } from 'react';
import type { Transaction, TxStatus } from '@/db/types';
import { useFinanceData } from '@/finance/financeDataset';
import { isRealized, STATUS_LABELS } from '@/finance/defaults';
import { deleteTransactions, setTransactionStatus } from '@/db/repo';
import { exportTransactionsCSV, download } from '@/db/backup';
import { inRange, todayISO } from '@/lib/dates';
import { fmtDate, fmtMoney } from '@/lib/format';
import { query, useRoute, navigate } from '@/state/router';
import { toast } from '@/state/toast';
import { openTxForm } from './txFormStore';
import { PeriodPicker } from './PeriodPicker';
import { useFinancePeriod } from './usePeriod';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Spinner } from '@/components/ui/misc';
import { Icon } from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/confirm';
import { CheckCircle2, Download, Plus, Repeat, Search, Trash2, X, ListFilter } from 'lucide-react';

export function TransactionsList() {
  const fin = useFinanceData();
  const route = useRoute();
  const qs = query(route);
  const { preset, custom, period, setPeriod } = useFinancePeriod();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>(qs.get('type') ?? '');
  const [cat, setCat] = useState<string>(qs.get('cat') ?? '');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState<string>(qs.get('status') ?? '');
  const [allDates, setAllDates] = useState(qs.get('status') === 'open');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(150);
  const [showFilters, setShowFilters] = useState(!!(qs.get('cat') || qs.get('type') || qs.get('status')));
  const today = todayISO();

  const list = useMemo(() => {
    if (!fin) return [];
    const s = search.trim().toLowerCase();
    return fin.transactions.filter((t) =>
      (allDates || inRange(t.date, period)) && (!type || t.type === type) && (!cat || t.categoryId === cat) && (!acc || t.accountId === acc) &&
      (!status || (status === 'open' ? !isRealized(t.status) : status === 'overdue' ? !isRealized(t.status) && t.date < today : t.status === status)) &&
      (!s || t.description.toLowerCase().includes(s) || (t.notes ?? '').toLowerCase().includes(s) || String(t.amount).includes(s.replace(',', '.'))));
  }, [fin, search, type, cat, acc, status, period, allDates, today]);

  if (!fin) return <Spinner />;
  const catMap = new Map(fin.categories.map((c) => [c.id, c])), accMap = new Map(fin.accounts.map((a) => [a.id, a]));
  const totals = list.reduce((a, t) => { if (t.type === 'income') a.inc += t.amount; else a.exp += t.amount; return a; }, { inc: 0, exp: 0 });
  const groups = new Map<string, Transaction[]>();
  list.slice(0, limit).forEach((t) => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date)!.push(t); });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sel = [...selected].filter((id) => list.some((t) => t.id === id));
  const clearFilters = () => { setType(''); setCat(''); setAcc(''); setStatus(''); setSearch(''); setAllDates(false); navigate('/financas/lancamentos', true); };
  const filterCount = [type, cat, acc, status].filter(Boolean).length + (allDates ? 1 : 0);

  const bulkStatus = async (realized: boolean) => {
    const txs = list.filter((t) => sel.includes(t.id));
    const inc = txs.filter((t) => t.type === 'income').map((t) => t.id), exp = txs.filter((t) => t.type === 'expense').map((t) => t.id);
    const st = (t: 'income' | 'expense'): TxStatus => (realized ? (t === 'income' ? 'received' : 'paid') : 'pending');
    if (inc.length) await setTransactionStatus(inc, st('income'));
    if (exp.length) await setTransactionStatus(exp, st('expense'));
    toast(`${txs.length} lançamento(s) atualizados.`); setSelected(new Set());
  };
  const bulkDelete = async () => {
    if (await confirmDialog({ title: `Excluir ${sel.length} lançamento(s)?`, message: 'Esta ação não pode ser desfeita. Ocorrências de recorrências excluídas não serão recriadas.', danger: true, confirmLabel: 'Excluir' })) {
      await deleteTransactions(sel); toast('Lançamentos excluídos.'); setSelected(new Set());
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!allDates && <PeriodPicker preset={preset} custom={custom} onChange={setPeriod} />}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="h-4 w-4 absolute left-3 top-2 text-subtle" aria-hidden />
          <input className="input h-8 pl-9 text-sm" placeholder="Buscar descrição ou valor" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar lançamentos" />
        </div>
        <Button size="sm" icon={<ListFilter className="h-4 w-4" />} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>Filtros{filterCount ? ` (${filterCount})` : ''}</Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={async () => download(await exportTransactionsCSV(), 'lancamentos.csv')}>CSV</Button>
          <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openTxForm('expense')}>Novo</Button>
        </div>
      </div>
      {showFilters && (
        <div className="card p-3 grid grid-cols-2 md:grid-cols-5 gap-2 animate-in">
          <select className="input h-9 text-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo"><option value="">Receitas e despesas</option><option value="income">Somente receitas</option><option value="expense">Somente despesas</option></select>
          <select className="input h-9 text-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{fin.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input h-9 text-sm" value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Conta"><option value="">Todas as contas</option>{fin.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select className="input h-9 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação"><option value="">Qualquer situação</option><option value="open">Em aberto (pendente/previsto)</option><option value="overdue">Atrasados</option>{(Object.keys(STATUS_LABELS) as TxStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} />Ignorar período</label>
          {filterCount > 0 && <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={clearFilters} className="col-span-2 md:col-span-5 justify-self-start">Limpar filtros</Button>}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm px-1">
        <span>{list.length} lançamento(s)</span>
        <span className="text-income">▲ {fmtMoney(totals.inc)}</span>
        <span className="text-expense">▼ {fmtMoney(totals.exp)}</span>
        <span className="font-medium">= {fmtMoney(totals.inc - totals.exp)}</span>
      </div>

      {sel.length > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 p-2 rounded-lg bg-primary-soft text-sm shadow animate-in">
          <b className="px-1">{sel.length} selecionado(s)</b>
          <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => bulkStatus(true)}>Marcar pago/recebido</Button>
          <Button size="sm" onClick={() => bulkStatus(false)}>Marcar pendente</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={bulkDelete}>Excluir</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancelar</Button>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState title="Nenhum lançamento encontrado" action={<><Button variant="expense" onClick={() => openTxForm('expense')}>Adicionar despesa</Button><Button variant="income" onClick={() => openTxForm('income')}>Adicionar receita</Button>{filterCount > 0 && <Button onClick={clearFilters}>Limpar filtros</Button>}</>}>
          Ajuste o período ou os filtros, ou registre uma nova movimentação.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {[...groups.entries()].map(([date, txs]) => (
            <section key={date} aria-label={fmtDate(date, 'long')}>
              <h3 className="text-xs font-medium text-subtle px-1 mb-1 flex justify-between"><span>{fmtDate(date, 'long')}{date === today ? ' · hoje' : ''}</span><span className="tabular">{fmtMoney(txs.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0))}</span></h3>
              <ul className="card divide-y divide-border">
                {txs.map((t) => {
                  const c = catMap.get(t.categoryId); const late = !isRealized(t.status) && t.date < today;
                  return (
                    <li key={t.id} className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 ${selected.has(t.id) ? 'bg-primary-soft/50' : ''}`}>
                      <input type="checkbox" className="h-4 w-4 shrink-0" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Selecionar ${t.description}`} />
                      <span className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: (c?.color ?? '#898781') + '22' }}><Icon name={c?.icon ?? 'Tag'} className="h-4 w-4" style={{ color: c?.color }} /></span>
                      <button className="flex-1 min-w-0 text-left" onClick={() => openTxForm(t.type, t)}>
                        <div className="text-sm font-medium truncate flex items-center gap-1.5">{t.description}{t.recurringId && <Repeat className="h-3 w-3 text-subtle shrink-0" aria-label="recorrente" />}{t.installment && <span className="text-[11px] text-subtle font-normal">{t.installment}</span>}</div>
                        <div className="text-xs text-subtle truncate">{c?.name ?? 'Sem categoria'} · {accMap.get(t.accountId)?.name ?? '—'}{t.paymentMethod ? ` · ${t.paymentMethod}` : ''}</div>
                      </button>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-semibold tabular ${t.type === 'income' ? 'text-income' : 'text-fg'}`}>{t.type === 'income' ? '+ ' : '− '}{fmtMoney(t.amount)}</div>
                        {isRealized(t.status) ? <span className="text-[11px] text-subtle">✓ {STATUS_LABELS[t.status]}</span> : <Badge tone={late ? 'expense' : t.status === 'planned' ? 'primary' : 'warn'}>{late ? '⚠ Atrasado' : STATUS_LABELS[t.status]}</Badge>}
                      </div>
                      {!isRealized(t.status) && <Button size="iconSm" variant="ghost" title={t.type === 'income' ? 'Marcar como recebido' : 'Marcar como pago'} aria-label={`Marcar ${t.description} como ${t.type === 'income' ? 'recebido' : 'pago'}`} onClick={() => setTransactionStatus([t.id], t.type === 'income' ? 'received' : 'paid')}><CheckCircle2 className="h-4 w-4 text-income" /></Button>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {list.length > limit && <div className="text-center"><Button onClick={() => setLimit((l) => l + 300)}>Mostrar mais ({list.length - limit})</Button></div>}
        </div>
      )}
    </div>
  );
}
