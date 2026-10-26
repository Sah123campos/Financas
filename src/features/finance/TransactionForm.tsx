import { useEffect, useMemo, useState } from 'react';
import type { Frequency, Recurring, Transaction, TxStatus, TxType } from '@/db/types';
import { closeTxForm, useTxForm } from './txFormStore';
import { useFinanceData } from '@/finance/financeDataset';
import { PAYMENT_METHODS, STATUS_LABELS } from '@/finance/defaults';
import { FREQ_LABELS } from '@/finance/recurrence';
import { deleteTransactions, saveRecurring, saveTransaction } from '@/db/repo';
import { db } from '@/db/schema';
import { parseNumber } from '@/data/values';
import { todayISO } from '@/lib/dates';
import { currencySymbol, fmtMoney } from '@/lib/format';
import { uid } from '@/lib/id';
import { toast } from '@/state/toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Segmented } from '@/components/ui/misc';
import { Icon } from '@/components/ui/Icon';
import { confirmDialog } from '@/components/ui/confirm';
import { ArrowDownCircle, ArrowUpCircle, ChevronDown, Trash2 } from 'lucide-react';

const defaultStatus = (type: TxType, date: string): TxStatus => (date > todayISO() ? (type === 'income' ? 'planned' : 'pending') : type === 'income' ? 'received' : 'paid');

export function TransactionFormHost() {
  const st = useTxForm();
  const fin = useFinanceData();
  if (!st.open || !fin) return null;
  return <TransactionForm key={st.editing?.id ?? st.type + 'new'} initialType={st.type} editing={st.editing} fin={fin} />;
}

function TransactionForm({ initialType, editing, fin }: { initialType: TxType; editing?: Transaction; fin: NonNullable<ReturnType<typeof useFinanceData>> }) {
  const [type, setType] = useState<TxType>(editing?.type ?? initialType);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amountText, setAmountText] = useState(editing ? String(editing.amount).replace('.', ',') : '');
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? fin.accounts[0]?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState(editing?.paymentMethod ?? '');
  const [status, setStatus] = useState<TxStatus>(editing?.status ?? defaultStatus(initialType, todayISO()));
  const [statusTouched, setStatusTouched] = useState(!!editing);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [more, setMore] = useState(!!editing?.notes || !!editing?.paymentMethod);
  const [repeat, setRepeat] = useState<'none' | Frequency>('none');
  const [installments, setInstallments] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const cats = useMemo(() => fin.categories.filter((c) => c.kind === type || c.kind === 'both'), [fin.categories, type]);
  // sugere a categoria usada anteriormente para a mesma descrição
  useEffect(() => {
    if (editing || categoryId || description.length < 3) return;
    const prev = fin.transactions.find((t) => t.type === type && t.description.toLowerCase() === description.trim().toLowerCase());
    if (prev) { setCategoryId(prev.categoryId); if (!paymentMethod) setPaymentMethod(prev.paymentMethod); }
  }, [description]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!statusTouched) setStatus(defaultStatus(type, date)); }, [type, date, statusTouched]);
  useEffect(() => { if (categoryId && !cats.some((c) => c.id === categoryId)) setCategoryId(''); }, [cats, categoryId]);

  const suggestions = useMemo(() => [...new Set(fin.transactions.filter((t) => t.type === type).map((t) => t.description))].slice(0, 50), [fin.transactions, type]);
  const statusOptions: TxStatus[] = type === 'income' ? ['received', 'pending', 'planned'] : ['paid', 'pending', 'planned'];

  const submit = async (addAnother = false) => {
    const amount = parseNumber(amountText);
    const e: Record<string, string> = {};
    if (amount == null || amount <= 0) e.amount = 'Informe um valor maior que zero.';
    if (!date) e.date = 'Informe a data.';
    if (repeat !== 'none' && installments && (!/^\d+$/.test(installments) || +installments < 2)) e.installments = 'Use um número inteiro a partir de 2.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const now = Date.now();
    const desc = description.trim() || (cats.find((c) => c.id === categoryId)?.name ?? (type === 'income' ? 'Receita' : 'Despesa'));
    const cat = categoryId || 'cat_outros';
    const st = statusOptions.includes(status) ? status : defaultStatus(type, date);
    try {
      if (!editing && repeat !== 'none') {
        const rec: Recurring = { id: uid('rec'), description: desc, amount: Math.abs(amount!), type, categoryId: cat, accountId, paymentMethod, frequency: repeat, startDate: date, installments: installments ? +installments : undefined, skipped: [], active: true, notes: notes || undefined, createdAt: now };
        await saveRecurring(rec);
        // a primeira ocorrência recebe a situação escolhida no formulário
        await db.transactions.where('[recurringId+occurrence]').equals([rec.id, date]).modify({ status: st });
        toast(`${type === 'income' ? 'Receita' : 'Despesa'} recorrente criada (${FREQ_LABELS[repeat].toLowerCase()}${installments ? `, ${installments} parcelas` : ''}). Previsões geradas para os próximos meses.`);
      } else {
        const t: Transaction = { id: editing?.id ?? uid('tx'), description: desc, amount: Math.abs(amount!), type, categoryId: cat, date, accountId, paymentMethod, status: st, notes: notes || undefined, recurringId: editing?.recurringId, occurrence: editing?.occurrence, installment: editing?.installment, createdAt: editing?.createdAt ?? now, updatedAt: now };
        await saveTransaction(t);
        toast(editing ? 'Lançamento atualizado.' : `${type === 'income' ? 'Receita' : 'Despesa'} de ${fmtMoney(t.amount)} registrada.`);
      }
      if (addAnother) { setDescription(''); setAmountText(''); setCategoryId(''); setNotes(''); setRepeat('none'); setInstallments(''); setSaving(false); document.getElementById('tx-amount')?.focus(); }
      else closeTxForm();
    } catch (err) { toast((err as Error).message, 'error'); setSaving(false); }
  };

  const remove = async () => {
    if (!editing) return;
    if (await confirmDialog({ title: 'Excluir lançamento?', message: `“${editing.description}” (${fmtMoney(editing.amount)}) será excluído.${editing.recurringId ? '\nEsta ocorrência recorrente não será recriada.' : ''}`, danger: true, confirmLabel: 'Excluir' })) {
      await deleteTransactions([editing.id]); toast('Lançamento excluído.'); closeTxForm();
    }
  };

  return (
    <Modal open onClose={closeTxForm} title={editing ? 'Editar lançamento' : type === 'income' ? 'Adicionar receita' : 'Adicionar despesa'}
      footer={<>
        {editing && <Button variant="ghost" className="mr-auto text-expense" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Excluir</Button>}
        {!editing && <Button onClick={() => submit(true)} disabled={saving}>Salvar e adicionar outro</Button>}
        <Button variant={type === 'income' ? 'income' : 'expense'} loading={saving} onClick={() => submit()}>Salvar</Button>
      </>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Segmented label="Tipo de lançamento" value={type} onChange={(v) => { setType(v); }} options={[
          { value: 'expense', label: <><ArrowDownCircle className="h-4 w-4 text-expense" aria-hidden />Despesa</> },
          { value: 'income', label: <><ArrowUpCircle className="h-4 w-4 text-income" aria-hidden />Receita</> },
        ]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor" htmlFor="tx-amount" error={errors.amount}>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-subtle text-sm" aria-hidden>{currencySymbol()}</span>
              <input id="tx-amount" data-autofocus className={`input pl-10 text-lg font-semibold tabular ${errors.amount ? 'border-expense' : ''}`} inputMode="decimal" placeholder="0,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-invalid={!!errors.amount} autoComplete="off" />
            </div>
          </Field>
          <Field label="Data" htmlFor="tx-date" error={errors.date}><input id="tx-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Descrição" htmlFor="tx-desc" optional>
          <input id="tx-desc" className="input" list="tx-desc-list" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={type === 'income' ? 'Ex.: Salário' : 'Ex.: Supermercado'} autoComplete="off" />
          <datalist id="tx-desc-list">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <div>
          <span className="label">Categoria</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categoria">
            {cats.map((c) => (
              <button type="button" key={c.id} role="radio" aria-checked={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                className={`h-9 px-2.5 rounded-full text-sm border inline-flex items-center gap-1.5 transition ${categoryId === c.id ? 'border-transparent text-white' : 'border-border hover:bg-muted'}`}
                style={categoryId === c.id ? { background: c.color } : undefined}>
                <Icon name={c.icon} className="h-4 w-4" style={categoryId === c.id ? undefined : { color: c.color }} />{c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Conta" htmlFor="tx-acc"><select id="tx-acc" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{fin.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Situação" htmlFor="tx-status"><select id="tx-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value as TxStatus); setStatusTouched(true); }}>{statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></Field>
        </div>
        <button type="button" className="text-sm text-primary font-medium inline-flex items-center gap-1" onClick={() => setMore((m) => !m)} aria-expanded={more}>
          <ChevronDown className={`h-4 w-4 transition ${more ? 'rotate-180' : ''}`} aria-hidden />Mais opções (forma de pagamento, recorrência, observações)
        </button>
        {more && (
          <div className="space-y-3 animate-in">
            <Field label="Forma de pagamento" htmlFor="tx-pm" optional>
              <select id="tx-pm" className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="">Não informar</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </Field>
            {!editing && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Repetir" htmlFor="tx-rep" optional hint="Gera previsões automáticas sem duplicar.">
                  <select id="tx-rep" className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as 'none' | Frequency)}><option value="none">Não repetir</option>{(Object.keys(FREQ_LABELS) as Frequency[]).map((f) => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}</select>
                </Field>
                {repeat !== 'none' && <Field label="Nº de parcelas" htmlFor="tx-inst" optional error={errors.installments} hint="Vazio = sem fim"><input id="tx-inst" className="input" inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value)} placeholder="Ex.: 10" /></Field>}
              </div>
            )}
            {editing?.recurringId && <p className="text-xs text-subtle">Este lançamento faz parte de uma recorrência{editing.installment ? ` (parcela ${editing.installment})` : ''}. Alterações valem só para esta ocorrência; para mudar todas, edite em “Recorrentes”.</p>}
            <Field label="Observações" htmlFor="tx-notes" optional><textarea id="tx-notes" className="input h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
