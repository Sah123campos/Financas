// Orçamentos, metas e lançamentos recorrentes.
import { useState } from 'react';
import type { Budget, Frequency, Goal, GoalKind, Recurring, TxType } from '@/db/types';
import { useFinanceData } from '@/finance/financeDataset';
import { budgetStatus, goalProgress, summarize } from '@/finance/metrics';
import { FREQ_LABELS, occurrences } from '@/finance/recurrence';
import { PAYMENT_METHODS, isRealized } from '@/finance/defaults';
import { deleteBudget, deleteGoal, deleteRecurring, saveBudget, saveGoal, saveRecurring } from '@/db/repo';
import { parseNumber } from '@/data/values';
import { todayISO } from '@/lib/dates';
import { fmtDate, fmtMoney } from '@/lib/format';
import { uid } from '@/lib/id';
import { toast } from '@/state/toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, Field, Progress, Spinner } from '@/components/ui/misc';
import { Icon } from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/confirm';
import { AlertTriangle, Pencil, PiggyBank, Plus, Repeat, Target, Trash2, Info } from 'lucide-react';

const money = (s: string) => { const n = parseNumber(s); return n != null && n >= 0 ? n : null; };

// ===================== Orçamentos =====================
export function BudgetsView() {
  const fin = useFinanceData();
  const [edit, setEdit] = useState<Budget | 'new' | null>(null);
  if (!fin) return <Spinner />;
  const month = todayISO().slice(0, 7);
  const st = budgetStatus(fin.budgets, fin.transactions, fin.categories, month);
  const totalLimit = st.reduce((a, b) => a + b.budget.limit, 0), totalSpent = st.reduce((a, b) => a + b.spent, 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-subtle flex-1">Limites mensais por categoria. Você recebe alerta ao chegar a 80% e ao ultrapassar o limite.</p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Novo orçamento</Button>
      </div>
      {st.length === 0 ? <EmptyState icon={<PiggyBank className="h-6 w-6" />} title="Nenhum orçamento definido" action={<Button variant="primary" onClick={() => setEdit('new')}>Criar orçamento</Button>}>Defina quanto deseja gastar no máximo por mês em cada categoria, como Alimentação ou Lazer.</EmptyState> : (
        <>
          <div className="card p-4">
            <div className="flex justify-between text-sm mb-1"><span className="font-medium">Total orçado neste mês</span><span className="tabular">{fmtMoney(totalSpent)} de {fmtMoney(totalLimit)}</span></div>
            <Progress value={totalLimit ? totalSpent / totalLimit : 0} label="Total do orçamento" color={totalSpent > totalLimit ? '#d03b3b' : '#2a78d6'} height={10} />
          </div>
          <ul className="grid md:grid-cols-2 gap-3">
            {st.map((b) => {
              const remaining = b.budget.limit - b.spent;
              return (
                <li key={b.budget.id} className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name={b.category?.icon ?? 'Tag'} className="h-5 w-5" style={{ color: b.category?.color }} />
                    <span className="font-medium flex-1 truncate">{b.category?.name ?? 'Categoria removida'}</span>
                    {b.level === 'over' && <Badge tone="expense"><AlertTriangle className="h-3 w-3" aria-hidden />Ultrapassado</Badge>}
                    {b.level === 'near' && <Badge tone="warn"><AlertTriangle className="h-3 w-3" aria-hidden />Atenção</Badge>}
                    {b.level === 'ok' && <Badge tone="income">Dentro do limite</Badge>}
                    <Button size="iconSm" variant="ghost" aria-label="Editar orçamento" onClick={() => setEdit(b.budget)}><Pencil className="h-4 w-4" /></Button>
                  </div>
                  <Progress value={b.ratio} color={b.level === 'over' ? '#d03b3b' : b.level === 'near' ? '#eda100' : '#0ca30c'} label={`${Math.round(b.ratio * 100)}% usado`} height={10} />
                  <div className="flex justify-between text-sm mt-2 tabular"><span>{fmtMoney(b.spent)} gastos</span><span className="text-subtle">limite {fmtMoney(b.budget.limit)}</span></div>
                  <p className={`text-xs mt-1 ${remaining < 0 ? 'text-expense' : 'text-subtle'}`}>{remaining >= 0 ? `Restam ${fmtMoney(remaining)} para este mês.` : `Ultrapassou em ${fmtMoney(-remaining)}.`}{b.planned > 0 && ` Há ainda ${fmtMoney(b.planned)} previstos/pendentes nesta categoria.`}</p>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {edit && <BudgetDialog budget={edit === 'new' ? null : edit} onClose={() => setEdit(null)} categories={fin.categories.filter((c) => c.kind !== 'income')} used={fin.budgets.map((b) => b.categoryId)} />}
    </div>
  );
}
function BudgetDialog({ budget, onClose, categories, used }: { budget: Budget | null; onClose: () => void; categories: { id: string; name: string }[]; used: string[] }) {
  const avail = categories.filter((c) => !used.includes(c.id) || c.id === budget?.categoryId);
  const [cat, setCat] = useState(budget?.categoryId ?? avail[0]?.id ?? '');
  const [limit, setLimit] = useState(budget ? String(budget.limit).replace('.', ',') : '');
  const [err, setErr] = useState('');
  const save = async () => {
    const v = money(limit);
    if (!v) return setErr('Informe um limite maior que zero.');
    await saveBudget({ id: budget?.id ?? uid('bud'), categoryId: cat, limit: v, createdAt: budget?.createdAt ?? Date.now() });
    toast('Orçamento salvo.'); onClose();
  };
  const remove = async () => { if (budget && await confirmDialog({ title: 'Excluir orçamento?', message: 'Os lançamentos não serão afetados.', danger: true })) { await deleteBudget(budget.id); onClose(); } };
  return (
    <Modal open onClose={onClose} title={budget ? 'Editar orçamento' : 'Novo orçamento'} size="sm" footer={<>{budget && <Button variant="ghost" className="mr-auto text-expense" onClick={remove}>Excluir</Button>}<Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save} disabled={!cat}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Categoria" htmlFor="b-cat">{avail.length ? <select id="b-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)} disabled={!!budget}>{avail.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : <p className="text-sm text-subtle">Todas as categorias de despesa já possuem orçamento.</p>}</Field>
        <Field label="Limite mensal" htmlFor="b-lim" error={err}><input id="b-lim" data-autofocus className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0,00" /></Field>
      </div>
    </Modal>
  );
}

// ===================== Metas =====================
const GOAL_KINDS: Record<GoalKind, string> = { monthly_saving: 'Meta mensal de economia', purchase: 'Compra específica', reserve: 'Reserva financeira' };
export function GoalsView() {
  const fin = useFinanceData();
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  const [deposit, setDeposit] = useState<Goal | null>(null);
  if (!fin) return <Spinner />;
  const m = todayISO().slice(0, 7);
  const monthResult = summarize(fin.transactions, { start: `${m}-01`, end: `${m}-31`, label: '' }).result;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-subtle flex-1">Acompanhe metas de economia mensal, compras e reserva de emergência.</p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Nova meta</Button>
      </div>
      {fin.goals.length === 0 ? <EmptyState icon={<Target className="h-6 w-6" />} title="Nenhuma meta" action={<Button variant="primary" onClick={() => setEdit('new')}>Criar meta</Button>}>Exemplo: guardar R$ 500 por mês, juntar R$ 6.000 para uma viagem ou formar uma reserva de 6 meses de despesas.</EmptyState> : (
        <ul className="grid md:grid-cols-2 gap-3">
          {fin.goals.map((g) => {
            const p = goalProgress(g, monthResult);
            return (
              <li key={g.id} className="card p-4">
                <div className="flex items-center gap-2 mb-1"><Target className="h-5 w-5" style={{ color: g.color }} aria-hidden /><span className="font-medium flex-1 truncate">{g.name}</span>{p.ratio >= 1 && <Badge tone="income">✓ Alcançada</Badge>}
                  <Button size="iconSm" variant="ghost" aria-label="Editar meta" onClick={() => setEdit(g)}><Pencil className="h-4 w-4" /></Button></div>
                <p className="text-xs text-subtle mb-2">{GOAL_KINDS[g.kind]}{g.deadline ? ` · prazo ${fmtDate(g.deadline)}` : ''}</p>
                <Progress value={p.ratio} color={g.color} label={`${Math.round(p.ratio * 100)}% da meta`} height={10} />
                <div className="flex justify-between text-sm mt-2 tabular"><span>{fmtMoney(p.current)}</span><span className="text-subtle">{Math.round(p.ratio * 100)}% de {fmtMoney(g.target)}</span></div>
                <p className="text-xs text-subtle mt-1">
                  {g.kind === 'monthly_saving' ? (monthResult >= g.target ? 'Neste mês você já economizou o planejado. 🎉' : `Resultado do mês até agora: ${fmtMoney(monthResult)}. Faltam ${fmtMoney(Math.max(0, g.target - monthResult))}.`)
                    : p.monthlyNeeded != null ? `Para chegar no prazo, guarde cerca de ${fmtMoney(p.monthlyNeeded)} por mês (estimativa).` : `Faltam ${fmtMoney(Math.max(0, g.target - p.current))}.`}
                </p>
                {g.kind !== 'monthly_saving' && <Button size="sm" className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={() => setDeposit(g)}>Registrar valor guardado</Button>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-subtle flex gap-1.5"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />As estimativas consideram apenas os valores informados e não constituem recomendação financeira.</p>
      {edit && <GoalDialog goal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {deposit && <DepositDialog goal={deposit} onClose={() => setDeposit(null)} />}
    </div>
  );
}
function GoalDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? 'purchase');
  const [target, setTarget] = useState(goal ? String(goal.target).replace('.', ',') : '');
  const [current, setCurrent] = useState(goal ? String(goal.current).replace('.', ',') : '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [color, setColor] = useState(goal?.color ?? '#2a78d6');
  const [err, setErr] = useState<Record<string, string>>({});
  const save = async () => {
    const t = money(target), c = current ? money(current) : 0;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Dê um nome à meta.';
    if (!t) e.target = 'Informe um valor maior que zero.';
    if (c == null) e.current = 'Valor inválido.';
    setErr(e); if (Object.keys(e).length) return;
    await saveGoal({ id: goal?.id ?? uid('goal'), name: name.trim(), kind, target: t!, current: c ?? 0, deadline: deadline || undefined, color, createdAt: goal?.createdAt ?? Date.now() });
    toast('Meta salva.'); onClose();
  };
  const remove = async () => { if (goal && await confirmDialog({ title: 'Excluir meta?', message: `“${goal.name}” será excluída.`, danger: true })) { await deleteGoal(goal.id); onClose(); } };
  return (
    <Modal open onClose={onClose} title={goal ? 'Editar meta' : 'Nova meta'} size="sm" footer={<>{goal && <Button variant="ghost" className="mr-auto text-expense" onClick={remove}>Excluir</Button>}<Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Tipo" htmlFor="g-kind"><select id="g-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>{(Object.keys(GOAL_KINDS) as GoalKind[]).map((k) => <option key={k} value={k}>{GOAL_KINDS[k]}</option>)}</select></Field>
        <Field label="Nome" htmlFor="g-name" error={err.name}><input id="g-name" data-autofocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'monthly_saving' ? 'Ex.: Guardar todo mês' : kind === 'reserve' ? 'Ex.: Reserva de emergência' : 'Ex.: Notebook novo'} /></Field>
        <Field label={kind === 'monthly_saving' ? 'Quanto economizar por mês' : 'Valor da meta'} htmlFor="g-target" error={err.target}><input id="g-target" className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0,00" /></Field>
        {kind !== 'monthly_saving' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Já guardado" htmlFor="g-cur" optional error={err.current}><input id="g-cur" className="input" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0,00" /></Field>
            <Field label="Prazo" htmlFor="g-dl" optional><input id="g-dl" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
          </div>
        )}
        {kind === 'monthly_saving' && <p className="text-xs text-subtle">O progresso é calculado automaticamente pelo resultado do mês (receitas − despesas pagas). Esta meta também é usada em “Quanto posso gastar”.</p>}
        <Field label="Cor" htmlFor="g-color"><input id="g-color" type="color" className="h-9 w-14 rounded border border-border" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
function DepositDialog({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [v, setV] = useState('');
  const [withdraw, setWithdraw] = useState(false);
  const save = async () => {
    const n = money(v); if (!n) return;
    await saveGoal({ ...goal, current: Math.max(0, goal.current + (withdraw ? -n : n)) });
    toast(withdraw ? 'Retirada registrada.' : 'Valor adicionado à meta.'); onClose();
  };
  return (
    <Modal open onClose={onClose} title={goal.name} size="sm" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Confirmar</Button></>}>
      <div className="space-y-3">
        <div className="flex gap-3 text-sm"><label className="flex items-center gap-1.5"><input type="radio" checked={!withdraw} onChange={() => setWithdraw(false)} />Guardar</label><label className="flex items-center gap-1.5"><input type="radio" checked={withdraw} onChange={() => setWithdraw(true)} />Retirar</label></div>
        <Field label="Valor" htmlFor="dep-v"><input id="dep-v" data-autofocus className="input" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" /></Field>
        <p className="text-xs text-subtle">Atual: {fmtMoney(goal.current)} de {fmtMoney(goal.target)}.</p>
      </div>
    </Modal>
  );
}

// ===================== Recorrentes =====================
export function RecurringView() {
  const fin = useFinanceData();
  const [edit, setEdit] = useState<Recurring | 'new' | null>(null);
  if (!fin) return <Spinner />;
  const cat = new Map(fin.categories.map((c) => [c.id, c]));
  const monthlyEq = (r: Recurring) => (r.frequency === 'weekly' ? r.amount * 52 / 12 : r.frequency === 'yearly' ? r.amount / 12 : r.amount);
  const active = fin.recurring.filter((r) => r.active);
  const inc = active.filter((r) => r.type === 'income').reduce((s, r) => s + monthlyEq(r), 0), exp = active.filter((r) => r.type === 'expense').reduce((s, r) => s + monthlyEq(r), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-subtle flex-1">Salário, aluguel, contas, assinaturas e parcelamentos. As próximas ocorrências são criadas como <b>previstas</b> (até 3 meses à frente), sem duplicar — marque como pagas quando acontecerem.</p>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Nova recorrência</Button>
      </div>
      {active.length > 0 && <div className="flex flex-wrap gap-4 text-sm px-1"><span className="text-income">▲ {fmtMoney(inc)}/mês em receitas fixas</span><span className="text-expense">▼ {fmtMoney(exp)}/mês em despesas fixas</span></div>}
      {fin.recurring.length === 0 ? <EmptyState icon={<Repeat className="h-6 w-6" />} title="Nenhum lançamento recorrente" action={<Button variant="primary" onClick={() => setEdit('new')}>Criar recorrência</Button>}>Cadastre uma vez e o sistema prevê os próximos lançamentos automaticamente.</EmptyState> : (
        <ul className="card divide-y divide-border">
          {fin.recurring.map((r) => {
            const c = cat.get(r.categoryId);
            const txs = fin.transactions.filter((t) => t.recurringId === r.id);
            const next = txs.filter((t) => !isRealized(t.status)).sort((a, b) => a.date.localeCompare(b.date))[0];
            const paidCount = txs.filter((t) => isRealized(t.status)).length;
            return (
              <li key={r.id} className={`flex items-center gap-3 p-3 ${r.active ? '' : 'opacity-60'}`}>
                <span className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: (c?.color ?? '#898781') + '22' }}><Icon name={c?.icon ?? 'Tag'} className="h-4 w-4" style={{ color: c?.color }} /></span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.description} {!r.active && <Badge>Pausada</Badge>}</div>
                  <div className="text-xs text-subtle">{FREQ_LABELS[r.frequency]} desde {fmtDate(r.startDate)}{r.installments ? ` · ${paidCount}/${r.installments} parcelas pagas` : ''}{r.endDate ? ` · até ${fmtDate(r.endDate)}` : ''}{next ? ` · próxima ${fmtDate(next.date)}` : ''}</div>
                </div>
                <span className={`tabular text-sm font-semibold ${r.type === 'income' ? 'text-income' : ''}`}>{r.type === 'income' ? '+' : '−'}{fmtMoney(r.amount)}</span>
                <Button size="iconSm" variant="ghost" aria-label="Editar recorrência" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <RecurringDialog rec={edit === 'new' ? null : edit} onClose={() => setEdit(null)} fin={fin} />}
    </div>
  );
}
function RecurringDialog({ rec, onClose, fin }: { rec: Recurring | null; onClose: () => void; fin: NonNullable<ReturnType<typeof useFinanceData>> }) {
  const [type, setType] = useState<TxType>(rec?.type ?? 'expense');
  const [description, setDescription] = useState(rec?.description ?? '');
  const [amount, setAmount] = useState(rec ? String(rec.amount).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState(rec?.categoryId ?? '');
  const [accountId, setAccountId] = useState(rec?.accountId ?? fin.accounts[0]?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState(rec?.paymentMethod ?? '');
  const [frequency, setFrequency] = useState<Frequency>(rec?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(rec?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(rec?.endDate ?? '');
  const [installments, setInstallments] = useState(rec?.installments ? String(rec.installments) : '');
  const [active, setActive] = useState(rec?.active ?? true);
  const [err, setErr] = useState<Record<string, string>>({});
  const cats = fin.categories.filter((c) => c.kind === type || c.kind === 'both');
  const preview = occurrences({ id: '', description, amount: 0, type, categoryId, accountId, paymentMethod, frequency, startDate, endDate: endDate || undefined, installments: installments ? +installments : undefined, skipped: [], active, createdAt: 0 }, '9999-12-31').slice(0, 4);
  const save = async () => {
    const a = money(amount);
    const e: Record<string, string> = {};
    if (!description.trim()) e.description = 'Informe uma descrição.';
    if (!a) e.amount = 'Informe um valor maior que zero.';
    if (installments && (!/^\d+$/.test(installments) || +installments < 1)) e.installments = 'Número inválido.';
    if (endDate && endDate < startDate) e.endDate = 'A data final deve ser posterior ao início.';
    setErr(e); if (Object.keys(e).length) return;
    await saveRecurring({ id: rec?.id ?? uid('rec'), description: description.trim(), amount: a!, type, categoryId: categoryId || 'cat_outros', accountId, paymentMethod, frequency, startDate, endDate: endDate || undefined, installments: installments ? +installments : undefined, skipped: rec?.skipped ?? [], active, notes: rec?.notes, createdAt: rec?.createdAt ?? Date.now() }, !!rec);
    toast(rec ? 'Recorrência atualizada. Previsões futuras foram recalculadas.' : 'Recorrência criada. As próximas ocorrências foram previstas.'); onClose();
  };
  const remove = async () => {
    if (!rec) return;
    if (await confirmDialog({ title: 'Excluir recorrência?', message: 'Os lançamentos já pagos/recebidos são mantidos. As previsões ainda não realizadas serão removidas.', danger: true, confirmLabel: 'Excluir' })) { await deleteRecurring(rec.id, true); toast('Recorrência excluída.'); onClose(); }
  };
  return (
    <Modal open onClose={onClose} title={rec ? 'Editar recorrência' : 'Nova recorrência'} footer={<>{rec && <Button variant="ghost" className="mr-auto text-expense" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Excluir</Button>}<Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <div className="flex gap-3 text-sm"><label className="flex items-center gap-1.5"><input type="radio" checked={type === 'expense'} onChange={() => setType('expense')} />Despesa</label><label className="flex items-center gap-1.5"><input type="radio" checked={type === 'income'} onChange={() => setType('income')} />Receita</label></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Descrição" htmlFor="r-desc" error={err.description}><input id="r-desc" data-autofocus className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel" /></Field>
          <Field label="Valor" htmlFor="r-amt" error={err.amount}><input id="r-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Categoria" htmlFor="r-cat"><select id="r-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Outros</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Conta" htmlFor="r-acc"><select id="r-acc" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{fin.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Frequência" htmlFor="r-freq"><select id="r-freq" className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>{(Object.keys(FREQ_LABELS) as Frequency[]).map((f) => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}</select></Field>
          <Field label="Forma de pagamento" htmlFor="r-pm" optional><select id="r-pm" className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="">—</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Primeira data" htmlFor="r-start"><input id="r-start" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="Nº de parcelas" htmlFor="r-inst" optional error={err.installments} hint="Para parcelamentos"><input id="r-inst" className="input" inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value)} /></Field>
          <Field label="Termina em" htmlFor="r-end" optional error={err.endDate}><input id="r-end" type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Ativa</label>
        </div>
        {preview.length > 0 && <p className="text-xs text-subtle">Próximas datas: {preview.map((d) => fmtDate(d)).join(', ')}{preview.length === 4 ? '…' : ''}</p>}
        {rec && <p className="text-xs text-subtle">Ao salvar, as previsões ainda não pagas desta recorrência são recriadas com os novos dados. Lançamentos já pagos não mudam.</p>}
      </div>
    </Modal>
  );
}
