import { useMemo, useState } from 'react';
import { format, subMonths } from 'date-fns';
import type { Transaction } from '@/db/types';
import { balanceAt, budgetStatus, byCategory, byPaymentMethod, goalProgress, monthly, projection, spendingRoom, summarize } from '@/finance/metrics';
import { useFinanceData } from '@/finance/financeDataset';
import { isRealized } from '@/finance/defaults';
import { setTransactionStatus } from '@/db/repo';
import { todayISO } from '@/lib/dates';
import { fmtDate, fmtMoney, fmtPercent } from '@/lib/format';
import { isDark, setPrefs, usePrefs } from '@/state/prefs';
import { navigate } from '@/state/router';
import { toast } from '@/state/toast';
import { EChart } from '@/charts/EChart';
import { donutOption, hbarOption, monthlyOption, projectionOption, stackedCategoryOption } from './financeCharts';
import { openTxForm } from './txFormStore';
import { PeriodPicker } from './PeriodPicker';
import { useFinancePeriod } from './usePeriod';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Progress, Segmented, Spinner } from '@/components/ui/misc';
import { Icon } from '@/components/ui/Icon';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, CheckCircle2, FileUp, GitCompareArrows, Info, Landmark, PiggyBank, Scale, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { loadSampleFinance } from '@/templates/apply';
import { ImportWizard } from '@/features/datasets/ImportWizard';

export function FinanceOverview() {
  const fin = useFinanceData();
  const { preset, custom, period, prev, setPeriod } = useFinancePeriod();
  const prefs = usePrefs();
  const dark = isDark();
  const [importing, setImporting] = useState(false);
  const [compare, setCompare] = useState(false);
  const today = todayISO();

  const m = useMemo(() => {
    if (!fin) return null;
    const { transactions: txs, categories, accounts, budgets, goals } = fin;
    const cur = summarize(txs, period), before = summarize(txs, prev);
    const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 5 - i), 'yyyy-MM'));
    const monthKey = today.slice(0, 7);
    const monthSum = summarize(txs, { start: `${monthKey}-01`, end: `${monthKey}-31`, label: '' });
    const savingGoal = goals.find((g) => g.kind === 'monthly_saving');
    const expCats = byCategory(txs, period, 'expense', categories);
    const prevCats = byCategory(txs, prev, 'expense', categories);
    const unpaid = txs.filter((t) => !isRealized(t.status) && t.date <= period.end).sort((a, b) => a.date.localeCompare(b.date));
    const stackSeries = (() => {
      const top = byCategory(txs, { start: `${months[0]}-01`, end: `${months[5]}-31`, label: '' }, 'expense', categories).slice(0, 7);
      return top.map((c) => ({ name: c.name, color: c.color, data: months.map((mm) => txs.filter((t) => t.type === 'expense' && t.categoryId === c.id && t.date.startsWith(mm) && isRealized(t.status)).reduce((s, t) => s + t.amount, 0)) }));
    })();
    return {
      cur, before, months, expCats, prevCats, unpaid, stackSeries,
      balance: balanceAt(txs, accounts, today),
      byAccount: accounts.map((a) => ({ ...a, balance: balanceAt(txs, accounts, today, a.id) })),
      monthly: monthly(txs, months),
      proj: projection(txs, accounts, today, 30, 90),
      budgets: budgetStatus(budgets, txs, categories, monthKey),
      goals: goals.map((g) => ({ g, ...goalProgress(g, monthSum.result) })),
      room: spendingRoom(txs, monthKey, savingGoal?.target ?? 0),
      payMethods: byPaymentMethod(txs, period),
      savingGoal,
      overdue: unpaid.filter((t) => t.date < today),
    };
  }, [fin, period, prev, today]);

  if (!fin || !m) return <Spinner />;
  const { cur, before } = m;
  const empty = fin.transactions.length === 0;
  const delta = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : null);
  const markPaid = async (t: Transaction) => { await setTransactionStatus([t.id], t.type === 'income' ? 'received' : 'paid'); toast(`“${t.description}” marcado como ${t.type === 'income' ? 'recebido' : 'pago'}.`, 'success', { label: 'Desfazer', run: () => setTransactionStatus([t.id], t.status) }); };
  const projEnd = m.proj[m.proj.length - 1]?.projected ?? 0;
  const projMin = Math.min(...m.proj.filter((p) => p.projected != null).map((p) => p.projected!));
  const detailed = prefs.financeView === 'detailed';

  return (
    <div className="space-y-5">
      {/* Atalhos */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>button]:justify-center sm:[&>button]:justify-start [&>button]:text-[13px] sm:[&>button]:text-sm">
        <Button variant="expense" icon={<ArrowDownCircle className="h-4 w-4" />} onClick={() => openTxForm('expense')}>Adicionar despesa</Button>
        <Button variant="income" icon={<ArrowUpCircle className="h-4 w-4" />} onClick={() => openTxForm('income')}>Adicionar receita</Button>
        <Button icon={<CalendarClock className="h-4 w-4" />} onClick={() => setPeriod('thisMonth')}>Ver gastos do mês</Button>
        <Button icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>Importar extrato</Button>
        <Button icon={<PiggyBank className="h-4 w-4" />} onClick={() => navigate('/financas/orcamentos')}>Criar orçamento</Button>
        <Button icon={<GitCompareArrows className="h-4 w-4" />} aria-pressed={compare} onClick={() => { setPeriod('thisMonth'); setCompare(true); setTimeout(() => document.getElementById('comparativo')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>Comparar com o mês passado</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <PeriodPicker preset={preset} custom={custom} onChange={setPeriod} />
        <Segmented label="Nível de detalhe" size="sm" value={prefs.financeView} onChange={(v) => setPrefs({ financeView: v })} options={[{ value: 'simple', label: 'Resumo do dia a dia' }, { value: 'detailed', label: 'Análise detalhada' }]} />
      </div>

      {empty && (
        <EmptyState icon={<Wallet className="h-6 w-6" />} title="Comece registrando suas movimentações"
          action={<><Button variant="expense" onClick={() => openTxForm('expense')}>Adicionar despesa</Button><Button variant="income" onClick={() => openTxForm('income')}>Adicionar receita</Button><Button onClick={() => setImporting(true)}>Importar extrato</Button><Button variant="ghost" onClick={async () => { await loadSampleFinance(); toast('Dados de exemplo carregados. Você pode apagá-los em Configurações.'); }}>Usar dados de exemplo</Button></>}>
          Registre receitas e despesas em poucos segundos — só o valor é obrigatório. Os indicadores e gráficos aparecem automaticamente.
        </EmptyState>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Landmark className="h-4 w-4" />} label="Saldo atual" value={m.balance} tone={m.balance < 0 ? 'expense' : 'neutral'} hint={`Soma das contas até hoje (${fmtDate(today)}), só com valores pagos/recebidos.`}
          extra={m.byAccount.length > 1 ? <ul className="text-[11px] text-subtle mt-1 space-y-0.5">{m.byAccount.map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{a.name}</span><span className="tabular">{fmtMoney(a.balance)}</span></li>)}</ul> : undefined} />
        <Kpi icon={<ArrowUpCircle className="h-4 w-4 text-income" />} label="Receitas" value={cur.income} tone="income" delta={delta(cur.income, before.income)} goodWhenUp hint={cur.incomePending ? `+ ${fmtMoney(cur.incomePending)} a receber no período` : 'Recebidas no período'} />
        <Kpi icon={<ArrowDownCircle className="h-4 w-4 text-expense" />} label="Despesas" value={cur.expense} tone="expense" delta={delta(cur.expense, before.expense)} hint={cur.expensePending ? `+ ${fmtMoney(cur.expensePending)} a pagar no período` : 'Pagas no período'} />
        <Kpi icon={<Scale className="h-4 w-4" />} label="Resultado do período" value={cur.result} tone={cur.result >= 0 ? 'income' : 'expense'} delta={delta(cur.result, before.result)} goodWhenUp
          hint={cur.result >= 0 ? `Você economizou ${fmtMoney(cur.result)}` : `Gastou ${fmtMoney(-cur.result)} a mais do que recebeu`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi small icon={<CalendarClock className="h-4 w-4 text-expense" />} label="Contas a pagar" value={m.unpaid.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)} hint={`${m.unpaid.filter((t) => t.type === 'expense').length} lançamento(s)${m.overdue.some((t) => t.type === 'expense') ? ` · ${m.overdue.filter((t) => t.type === 'expense').length} atrasado(s)` : ''}`} onClick={() => navigate('/financas/lancamentos?status=open&type=expense')} />
        <Kpi small icon={<CalendarClock className="h-4 w-4 text-income" />} label="A receber" value={m.unpaid.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)} hint={`${m.unpaid.filter((t) => t.type === 'income').length} lançamento(s)`} onClick={() => navigate('/financas/lancamentos?status=open&type=income')} />
        <div className="card p-3 sm:p-4">
          <div className="text-xs text-subtle flex items-center gap-1.5"><Info className="h-4 w-4" aria-hidden />Despesas ÷ receitas</div>
          <div className="text-xl font-semibold mt-1 tabular">{cur.expenseRatio == null ? '—' : fmtPercent(cur.expenseRatio, 0)}</div>
          {cur.expenseRatio != null && <div className="mt-2"><Progress value={Math.min(1, cur.expenseRatio)} color={cur.expenseRatio > 1 ? '#d03b3b' : cur.expenseRatio > 0.85 ? '#eda100' : '#0ca30c'} label="Percentual das despesas em relação às receitas" /></div>}
          <p className="text-[11px] text-subtle mt-1">{cur.expenseRatio == null ? 'Sem receitas no período.' : cur.expenseRatio > 1 ? '⚠ Gastos acima do que entrou.' : cur.expenseRatio > 0.85 ? 'Atenção: pouca margem.' : '✓ Gastos abaixo das receitas.'}</p>
        </div>
        <SpendRoom room={m.room} hasGoal={!!m.savingGoal} />
      </div>

      {/* Perguntas principais */}
      <div className="grid lg:grid-cols-5 gap-3">
        <Panel className="lg:col-span-2" title="Para onde está indo meu dinheiro?" subtitle={`Despesas pagas · ${period.label.toLowerCase()}`}>
          {m.expCats.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2 gap-2 items-center">
              <div className="h-48"><EChart option={donutOption(m.expCats, dark, cur.expense)} ariaLabel={`Despesas por categoria: ${m.expCats.slice(0, 3).map((c) => `${c.name} ${fmtMoney(c.value)}`).join(', ')}`} onClick={(p) => p.name && navigate(`/financas/lancamentos?cat=${m.expCats.find((c) => c.name === p.name)?.id}`)} /></div>
              <ul className="space-y-1.5 text-sm">
                {m.expCats.slice(0, 6).map((c) => (
                  <li key={c.id}><button className="w-full flex items-center gap-2 hover:bg-muted rounded px-1 py-0.5" onClick={() => navigate(`/financas/lancamentos?cat=${c.id}`)}>
                    <Icon name={c.icon} className="h-4 w-4 shrink-0" style={{ color: c.color }} /><span className="flex-1 truncate text-left">{c.name}</span>
                    <span className="tabular text-subtle text-xs">{fmtPercent(c.value / (cur.expense || 1), 0)}</span><span className="tabular font-medium">{fmtMoney(c.value, 0)}</span>
                  </button></li>
                ))}
              </ul>
              {m.expCats[0] && <p className="text-xs text-subtle sm:col-span-2 lg:col-span-1 2xl:col-span-2">Sua maior despesa é <b className="text-fg">{m.expCats[0].name}</b>: {fmtPercent(m.expCats[0].value / (cur.expense || 1), 0)} do total.</p>}
            </div>
          ) : <p className="text-sm text-subtle py-8 text-center">Nenhuma despesa paga neste período.</p>}
        </Panel>
        <Panel className="lg:col-span-3" title="Estou gastando mais do que recebo?" subtitle="Receitas, despesas e resultado dos últimos 6 meses">
          <div className="h-60"><EChart option={monthlyOption(m.monthly, dark)} ariaLabel={`Comparativo mensal: ${m.monthly.map((r) => `${r.month} resultado ${fmtMoney(r.result)}`).join('; ')}`} /></div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-5 gap-3">
        <Panel className="lg:col-span-3" title="Como meu saldo deverá evoluir?" subtitle="Últimos 30 dias e projeção para 90 dias">
          <div className="h-60"><EChart option={projectionOption(m.proj, today, dark)} ariaLabel={`Saldo atual ${fmtMoney(m.balance)}. Projeção em 90 dias: ${fmtMoney(projEnd)}.`} /></div>
          <p className="text-xs text-subtle mt-2 flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />A projeção soma apenas lançamentos pendentes e previstos (inclusive recorrências). É uma estimativa, não uma garantia.{projMin < 0 && <b className="text-expense"> ⚠ Há risco de saldo negativo no período projetado ({fmtMoney(projMin)}).</b>}</p>
        </Panel>
        <Panel className="lg:col-span-2" title="Quais despesas estão pendentes?" subtitle={m.overdue.length ? `${m.overdue.length} atrasada(s)` : 'Próximos vencimentos'} action={<Button size="sm" variant="ghost" onClick={() => navigate('/financas/lancamentos?status=open')}>Ver todas</Button>}>
          {m.unpaid.length ? (
            <ul className="divide-y divide-border -mx-1">
              {m.unpaid.slice(0, 6).map((t) => {
                const late = t.date < today;
                const c = fin.categories.find((x) => x.id === t.categoryId);
                return (
                  <li key={t.id} className="flex items-center gap-2 py-2 px-1">
                    <Icon name={c?.icon ?? 'Tag'} className="h-4 w-4 shrink-0" style={{ color: c?.color }} />
                    <button className="flex-1 min-w-0 text-left" onClick={() => openTxForm(t.type, t)}>
                      <div className="text-sm truncate">{t.description}</div>
                      <div className={`text-xs ${late ? 'text-expense font-medium' : 'text-subtle'}`}>{late ? '⚠ Venceu em ' : 'Vence em '}{fmtDate(t.date)}{t.installment ? ` · parcela ${t.installment}` : ''}</div>
                    </button>
                    <span className={`tabular text-sm font-medium ${t.type === 'income' ? 'text-income' : ''}`}>{t.type === 'income' ? '+' : '−'}{fmtMoney(t.amount)}</span>
                    <Button size="iconSm" variant="ghost" aria-label={`Marcar “${t.description}” como ${t.type === 'income' ? 'recebido' : 'pago'}`} title={t.type === 'income' ? 'Marcar como recebido' : 'Marcar como pago'} onClick={() => markPaid(t)}><CheckCircle2 className="h-4 w-4 text-income" /></Button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-subtle py-8 text-center">✓ Nada pendente até o fim do período.</p>}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Panel title="Orçamentos do mês" subtitle="Limites de gastos por categoria" action={<Button size="sm" variant="ghost" onClick={() => navigate('/financas/orcamentos')}>Gerenciar</Button>}>
          {m.budgets.length ? (
            <ul className="space-y-3">
              {m.budgets.slice(0, 5).map((b) => (
                <li key={b.budget.id}>
                  <div className="flex justify-between text-sm mb-1 gap-2">
                    <span className="flex items-center gap-1.5 truncate"><Icon name={b.category?.icon ?? 'Tag'} className="h-4 w-4" style={{ color: b.category?.color }} />{b.category?.name ?? '—'}
                      {b.level === 'over' && <Badge tone="expense"><AlertTriangle className="h-3 w-3" aria-hidden />Estourado</Badge>}{b.level === 'near' && <Badge tone="warn"><AlertTriangle className="h-3 w-3" aria-hidden />Perto do limite</Badge>}</span>
                    <span className="tabular text-subtle shrink-0">{fmtMoney(b.spent, 0)} / {fmtMoney(b.budget.limit, 0)}</span>
                  </div>
                  <Progress value={b.ratio} color={b.level === 'over' ? '#d03b3b' : b.level === 'near' ? '#eda100' : '#0ca30c'} label={`${b.category?.name}: ${Math.round(b.ratio * 100)}% do orçamento`} />
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-subtle py-6 text-center">Defina limites por categoria para receber alertas. <button className="text-primary underline" onClick={() => navigate('/financas/orcamentos')}>Criar orçamento</button></div>}
        </Panel>
        <Panel title="Metas financeiras" action={<Button size="sm" variant="ghost" onClick={() => navigate('/financas/metas')}>Gerenciar</Button>}>
          {m.goals.length ? (
            <ul className="space-y-3">
              {m.goals.slice(0, 4).map(({ g, current, ratio, monthlyNeeded }) => (
                <li key={g.id}>
                  <div className="flex justify-between text-sm mb-1 gap-2"><span className="flex items-center gap-1.5 truncate"><Target className="h-4 w-4" style={{ color: g.color }} aria-hidden />{g.name}{ratio >= 1 && <Badge tone="income">✓ Alcançada</Badge>}</span><span className="tabular text-subtle shrink-0">{fmtMoney(current, 0)} / {fmtMoney(g.target, 0)}</span></div>
                  <Progress value={ratio} color={g.color} label={`${g.name}: ${Math.round(ratio * 100)}%`} />
                  <p className="text-[11px] text-subtle mt-0.5">{g.kind === 'monthly_saving' ? 'Resultado deste mês até agora' : monthlyNeeded != null ? `Guardando ~${fmtMoney(monthlyNeeded, 0)}/mês, você alcança até ${fmtDate(g.deadline)}` : ''}</p>
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-subtle py-6 text-center">Crie metas de economia, compras ou reserva. <button className="text-primary underline" onClick={() => navigate('/financas/metas')}>Criar meta</button></div>}
        </Panel>
      </div>

      {(detailed || compare) && (
        <div className="grid lg:grid-cols-2 gap-3">
          <Panel title="Como meus gastos mudaram ao longo do tempo?" subtitle="Despesas pagas por categoria, últimos 6 meses">
            <div className="h-64">{m.stackSeries.length ? <EChart option={stackedCategoryOption(m.months, m.stackSeries, dark)} ariaLabel="Despesas por categoria em cada mês" /> : <p className="text-sm text-subtle text-center py-10">Sem dados.</p>}</div>
          </Panel>
          <Panel title="Formas de pagamento" subtitle={`Despesas pagas · ${period.label.toLowerCase()}`}>
            <div className="h-64">{m.payMethods.length ? <EChart option={hbarOption(m.payMethods, dark)} ariaLabel={`Formas de pagamento: ${m.payMethods.map((p) => `${p.name} ${fmtMoney(p.value)}`).join(', ')}`} /> : <p className="text-sm text-subtle text-center py-10">Sem dados.</p>}</div>
          </Panel>
          <div id="comparativo" className="lg:col-span-2">
            <Panel title={`Comparativo: ${period.label.toLowerCase()} × período anterior`} subtitle={`${fmtDate(prev.start)} – ${fmtDate(prev.end)} comparado a ${fmtDate(period.start)} – ${fmtDate(period.end)}`}>
              <CompareTable cur={m.expCats} prev={m.prevCats} curSum={cur} prevSum={before} />
            </Panel>
          </div>
        </div>
      )}
      <ImportWizard open={importing} onClose={() => setImporting(false)} defaultTarget="finance" />
    </div>
  );
}

function Kpi({ icon, label, value, tone = 'neutral', delta, goodWhenUp, hint, extra, small, onClick }: { icon: React.ReactNode; label: string; value: number; tone?: 'neutral' | 'income' | 'expense'; delta?: number | null; goodWhenUp?: boolean; hint?: string; extra?: React.ReactNode; small?: boolean; onClick?: () => void }) {
  const good = delta != null && (goodWhenUp ? delta >= 0 : delta <= 0);
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp className={`card p-3 sm:p-4 text-left ${onClick ? 'hover:border-primary/50 transition' : ''}`} onClick={onClick}>
      <div className="text-xs text-subtle flex items-center gap-1.5">{icon}{label}</div>
      <div className={`${small ? 'text-xl' : 'text-xl sm:text-2xl'} font-semibold mt-1 tabular truncate ${tone === 'expense' && value < 0 ? 'text-expense' : ''}`}>{value < 0 && <span className="sr-only">negativo </span>}{fmtMoney(value)}</div>
      {delta != null && Number.isFinite(delta) && (
        <div className={`text-xs mt-0.5 inline-flex items-center gap-1 font-medium ${good ? 'text-income' : 'text-expense'}`}>
          {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
          {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(0)}% vs. período anterior
        </div>
      )}
      {hint && <p className="text-[11px] text-subtle mt-0.5 line-clamp-2">{hint}</p>}
      {extra}
    </Comp>
  );
}

function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`} aria-label={title}>
      <header className="flex items-start gap-2 mb-3"><div className="flex-1 min-w-0"><h2 className="font-semibold text-sm sm:text-base">{title}</h2>{subtitle && <p className="text-xs text-subtle">{subtitle}</p>}</div>{action}</header>
      {children}
    </section>
  );
}

function SpendRoom({ room, hasGoal }: { room: ReturnType<typeof spendingRoom>; hasGoal: boolean }) {
  const ok = room.available >= 0;
  return (
    <div className="card p-3 sm:p-4">
      <div className="text-xs text-subtle flex items-center gap-1.5"><PiggyBank className="h-4 w-4" aria-hidden />Quanto posso gastar este mês?</div>
      <div className={`text-xl font-semibold mt-1 tabular ${ok ? '' : 'text-expense'}`}>{fmtMoney(Math.max(0, room.available))}</div>
      <p className="text-[11px] text-subtle mt-0.5" title="Receitas esperadas do mês − despesas pagas e previstas − meta mensal de economia">
        {ok ? 'Estimativa: ' : '⚠ Já comprometido além do esperado. '}{fmtMoney(room.expectedIncome, 0)} de receitas − {fmtMoney(room.committed, 0)} comprometidos{hasGoal ? ` − ${fmtMoney(room.saving, 0)} da meta` : ''}.
        {!hasGoal && <> <button className="underline" onClick={() => navigate('/financas/metas')}>Defina uma meta de economia</button>.</>}
      </p>
    </div>
  );
}

function CompareTable({ cur, prev, curSum, prevSum }: { cur: { id: string; name: string; value: number; color: string }[]; prev: { id: string; value: number }[]; curSum: { income: number; expense: number; result: number }; prevSum: { income: number; expense: number; result: number } }) {
  const ids = [...new Set([...cur.map((c) => c.id), ...prev.map((p) => p.id)])];
  const rows = ids.map((id) => { const c = cur.find((x) => x.id === id); const p = prev.find((x) => x.id === id); return { id, name: c?.name ?? (p as { name?: string })?.name ?? '—', a: c?.value ?? 0, b: p?.value ?? 0 }; }).sort((x, y) => y.a - x.a);
  const line = (name: string, a: number, b: number, upGood = false) => {
    const d = a - b; const good = upGood ? d >= 0 : d <= 0;
    return <tr key={name} className="border-b border-border/60"><td className="py-1.5 pr-3">{name}</td><td className="py-1.5 px-2 text-right">{fmtMoney(b)}</td><td className="py-1.5 px-2 text-right font-medium">{fmtMoney(a)}</td>
      <td className={`py-1.5 pl-2 text-right ${d === 0 ? 'text-subtle' : good ? 'text-income' : 'text-expense'}`}>{d > 0 ? '▲ +' : d < 0 ? '▼ ' : ''}{fmtMoney(d)}{b ? ` (${d >= 0 ? '+' : ''}${Math.round((d / b) * 100)}%)` : ''}</td></tr>;
  };
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm tabular">
        <thead><tr className="text-subtle border-b border-border"><th className="text-left font-medium py-2">Item</th><th className="text-right font-medium px-2">Anterior</th><th className="text-right font-medium px-2">Atual</th><th className="text-right font-medium pl-2">Diferença</th></tr></thead>
        <tbody>
          {line('Receitas', curSum.income, prevSum.income, true)}
          {line('Despesas', curSum.expense, prevSum.expense)}
          {line('Resultado', curSum.result, prevSum.result, true)}
          <tr><td colSpan={4} className="pt-3 pb-1 text-xs text-subtle">Despesas por categoria</td></tr>
          {rows.map((r) => line(r.name, r.a, r.b))}
        </tbody>
      </table>
    </div>
  );
}
