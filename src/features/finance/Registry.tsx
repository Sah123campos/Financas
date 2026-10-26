// Categorias (com cores e ícones) e contas/carteiras.
import { useState } from 'react';
import type { Account, AccountType, Category } from '@/db/types';
import { useFinanceData } from '@/finance/financeDataset';
import { ACCOUNT_TYPES, CATEGORY_ICONS } from '@/finance/defaults';
import { balanceAt } from '@/finance/metrics';
import { deleteAccount, deleteCategory, saveAccount, saveCategory } from '@/db/repo';
import { parseNumber } from '@/data/values';
import { todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { uid } from '@/lib/id';
import { toast } from '@/state/toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Spinner } from '@/components/ui/misc';
import { Icon } from '@/components/ui/Icon';
import { Pencil, Plus } from 'lucide-react';
import { PALETTE_LIGHT, STATUS } from '@/charts/palette';

const COLORS = [...PALETTE_LIGHT, STATUS.good, '#199e70', '#9085e9', '#898781'];

export function RegistryView() {
  const fin = useFinanceData();
  const [cat, setCat] = useState<Category | 'new' | null>(null);
  const [acc, setAcc] = useState<Account | 'new' | null>(null);
  if (!fin) return <Spinner />;
  const count = (id: string) => fin.transactions.filter((t) => t.categoryId === id).length;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <section className="card p-4">
        <div className="flex items-center mb-3"><h2 className="font-semibold flex-1">Categorias</h2><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCat('new')}>Nova</Button></div>
        {(['expense', 'income', 'both'] as const).map((k) => (
          <div key={k} className="mb-3">
            <h3 className="text-xs uppercase tracking-wide text-subtle mb-1">{k === 'expense' ? 'Despesas' : k === 'income' ? 'Receitas' : 'Ambos'}</h3>
            <ul className="divide-y divide-border">
              {fin.categories.filter((c) => c.kind === k).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: c.color + '22' }}><Icon name={c.icon} className="h-4 w-4" style={{ color: c.color }} /></span>
                  <span className="flex-1 text-sm">{c.name}</span><span className="text-xs text-subtle">{count(c.id)} lanç.</span>
                  <Button size="iconSm" variant="ghost" aria-label={`Editar categoria ${c.name}`} onClick={() => setCat(c)}><Pencil className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="card p-4 self-start">
        <div className="flex items-center mb-3"><h2 className="font-semibold flex-1">Contas e carteiras</h2><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAcc('new')}>Nova</Button></div>
        <ul className="divide-y divide-border">
          {fin.accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <span className="h-3 w-3 rounded-full" style={{ background: a.color }} aria-hidden />
              <div className="flex-1"><div className="text-sm font-medium">{a.name}</div><div className="text-xs text-subtle">{ACCOUNT_TYPES[a.type]} · saldo inicial {fmtMoney(a.initialBalance)}</div></div>
              <span className="tabular text-sm font-semibold">{fmtMoney(balanceAt(fin.transactions, fin.accounts, todayISO(), a.id))}</span>
              <Button size="iconSm" variant="ghost" aria-label={`Editar conta ${a.name}`} onClick={() => setAcc(a)}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      </section>
      {cat && <CategoryDialog c={cat === 'new' ? null : cat} onClose={() => setCat(null)} all={fin.categories} />}
      {acc && <AccountDialog a={acc === 'new' ? null : acc} onClose={() => setAcc(null)} all={fin.accounts} />}
    </div>
  );
}

function CategoryDialog({ c, onClose, all }: { c: Category | null; onClose: () => void; all: Category[] }) {
  const [name, setName] = useState(c?.name ?? '');
  const [kind, setKind] = useState<Category['kind']>(c?.kind ?? 'expense');
  const [color, setColor] = useState(c?.color ?? COLORS[0]);
  const [icon, setIcon] = useState(c?.icon ?? 'Tag');
  const [moveTo, setMoveTo] = useState('cat_outros');
  const [err, setErr] = useState('');
  const save = async () => {
    if (!name.trim()) return setErr('Informe o nome.');
    if (all.some((x) => x.name.toLowerCase() === name.trim().toLowerCase() && x.id !== c?.id)) return setErr('Já existe uma categoria com este nome.');
    await saveCategory({ id: c?.id ?? uid('cat'), name: name.trim(), kind, color, icon, createdAt: c?.createdAt ?? Date.now() });
    toast('Categoria salva.'); onClose();
  };
  const remove = async () => {
    if (!c) return;
    await deleteCategory(c.id, moveTo); toast(`Categoria excluída; lançamentos movidos para “${all.find((x) => x.id === moveTo)?.name}”.`); onClose();
  };
  const others = all.filter((x) => x.id !== c?.id);
  return (
    <Modal open onClose={onClose} title={c ? 'Editar categoria' : 'Nova categoria'} size="sm" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome" htmlFor="c-name" error={err}><input id="c-name" data-autofocus className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Usada em" htmlFor="c-kind"><select id="c-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as Category['kind'])}><option value="expense">Despesas</option><option value="income">Receitas</option><option value="both">Receitas e despesas</option></select></Field>
        <div><span className="label">Cor</span><div className="flex flex-wrap gap-2">{COLORS.map((x) => <button key={x} className={`h-8 w-8 rounded-full border-2 ${color === x ? 'border-fg' : 'border-transparent'}`} style={{ background: x }} onClick={() => setColor(x)} aria-label={`Cor ${x}`} aria-pressed={color === x} />)}<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 rounded border border-border" aria-label="Cor personalizada" /></div></div>
        <div><span className="label">Ícone</span><div className="flex flex-wrap gap-1.5">{CATEGORY_ICONS.map((i) => <button key={i} className={`h-9 w-9 rounded-lg border flex items-center justify-center ${icon === i ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted'}`} onClick={() => setIcon(i)} aria-label={`Ícone ${i}`} aria-pressed={icon === i}><Icon name={i} className="h-4 w-4" style={{ color }} /></button>)}</div></div>
        {c && c.id !== 'cat_outros' && (
          <details className="rounded-lg border border-border p-2"><summary className="text-sm text-expense cursor-pointer">Excluir categoria</summary>
            <div className="mt-2 space-y-2"><label className="text-sm block">Mover lançamentos para<select className="input mt-1" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><Button variant="danger" size="sm" onClick={remove}>Excluir e mover</Button></div>
          </details>
        )}
      </div>
    </Modal>
  );
}

function AccountDialog({ a, onClose, all }: { a: Account | null; onClose: () => void; all: Account[] }) {
  const [name, setName] = useState(a?.name ?? '');
  const [type, setType] = useState<AccountType>(a?.type ?? 'checking');
  const [initial, setInitial] = useState(a ? String(a.initialBalance).replace('.', ',') : '0');
  const [color, setColor] = useState(a?.color ?? COLORS[0]);
  const [moveTo, setMoveTo] = useState(all.find((x) => x.id !== a?.id)?.id ?? '');
  const [err, setErr] = useState('');
  const save = async () => {
    const v = parseNumber(initial || '0');
    if (!name.trim()) return setErr('Informe o nome.');
    if (v == null) return setErr('Saldo inicial inválido.');
    await saveAccount({ id: a?.id ?? uid('acc'), name: name.trim(), type, initialBalance: v, color, createdAt: a?.createdAt ?? Date.now() });
    toast('Conta salva.'); onClose();
  };
  const remove = async () => { if (a && moveTo) { await deleteAccount(a.id, moveTo); toast('Conta excluída.'); onClose(); } };
  return (
    <Modal open onClose={onClose} title={a ? 'Editar conta' : 'Nova conta'} size="sm" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar</Button></>}>
      <div className="space-y-3">
        <Field label="Nome" htmlFor="a-name" error={err}><input id="a-name" data-autofocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank, Carteira" /></Field>
        <Field label="Tipo" htmlFor="a-type"><select id="a-type" className="input" value={type} onChange={(e) => setType(e.target.value as AccountType)}>{(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => <option key={t} value={t}>{ACCOUNT_TYPES[t]}</option>)}</select></Field>
        <Field label="Saldo inicial" htmlFor="a-init" hint="Saldo da conta antes do primeiro lançamento registrado. Pode ser negativo."><input id="a-init" className="input" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} /></Field>
        <Field label="Cor" htmlFor="a-color"><input id="a-color" type="color" className="h-9 w-14 rounded border border-border" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
        {a && all.length > 1 && (
          <details className="rounded-lg border border-border p-2"><summary className="text-sm text-expense cursor-pointer">Excluir conta</summary>
            <div className="mt-2 space-y-2"><label className="text-sm block">Mover lançamentos para<select className="input mt-1" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>{all.filter((x) => x.id !== a.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><Button variant="danger" size="sm" onClick={remove}>Excluir e mover</Button></div>
          </details>
        )}
      </div>
    </Modal>
  );
}
