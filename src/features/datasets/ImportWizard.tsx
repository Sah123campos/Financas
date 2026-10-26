import { useMemo, useRef, useState } from 'react';
import type { ColumnType, Dataset, Transaction } from '@/db/types';
import { analyze, buildDataset, planColumns, readDelimited, readFile, readJSON, type ColumnPlan, type RawFile } from '@/data/importers';
import { coerce, TYPE_LABELS, parseNumber } from '@/data/values';
import { detectFinanceMapping, suggestCharts, type FinanceMapping } from '@/data/suggest';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge, Segmented } from '@/components/ui/misc';
import { db } from '@/db/schema';
import { saveDataset } from '@/db/repo';
import { tracked } from '@/state/saveStatus';
import { navigate } from '@/state/router';
import { uid } from '@/lib/id';
import { todayISO } from '@/lib/dates';
import { useFinanceData } from '@/finance/financeDataset';
import { buildWidgets } from '@/templates/layout';
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileSpreadsheet, Sparkles, Table, Upload, Wallet } from 'lucide-react';

type Step = 'source' | 'columns' | 'target' | 'done';

export function ImportWizard({ open, onClose, defaultTarget = 'dataset' }: { open: boolean; onClose: () => void; defaultTarget?: 'dataset' | 'finance' }) {
  const [step, setStep] = useState<Step>('source');
  const [raw, setRaw] = useState<RawFile | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [plan, setPlan] = useState<ColumnPlan[]>([]);
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<'dataset' | 'finance'>(defaultTarget);
  const [mapping, setMapping] = useState<FinanceMapping>({});
  const [result, setResult] = useState<{ ds?: Dataset; tx?: { added: number; dup: number; invalid: number } } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const sheet = raw?.sheets[sheetIdx];
  const report = useMemo(() => (sheet ? analyze(sheet, plan) : []), [sheet, plan]);
  const totalInvalid = report.reduce((a, r) => a + r.invalid, 0);

  const reset = () => { setStep('source'); setRaw(null); setPlan([]); setName(''); setPaste(''); setError(null); setResult(null); setTarget(defaultTarget); };
  const close = () => { reset(); onClose(); };

  const loadRaw = (r: RawFile) => {
    setRaw(r); setSheetIdx(0);
    const p = planColumns(r.sheets[0]);
    setPlan(p);
    setName(r.fileName.replace(/\.\w+$/, ''));
    setStep('columns');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setLoading(true); setError(null);
    try { loadRaw(await readFile(f)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  const onPaste = () => {
    setError(null);
    try { const t = paste.trim(); loadRaw(t.startsWith('[') || t.startsWith('{') ? readJSON(t, 'Dados colados') : readDelimited(t, 'Dados colados')); }
    catch (e) { setError((e as Error).message); }
  };
  const chooseSheet = (i: number) => { setSheetIdx(i); setPlan(planColumns(raw!.sheets[i])); };

  const toTarget = () => {
    const tmp = buildDataset(sheet!, plan, name, '');
    const m = detectFinanceMapping(tmp.columns);
    // o mapeamento usa nomes de colunas do plano (índices) — guardamos as chaves geradas
    setMapping(m.mapping);
    setStep('target');
  };

  const confirmDataset = async () => {
    setLoading(true);
    try {
      const ds = buildDataset(sheet!, plan, name.trim() || 'Planilha importada', `Arquivo: ${raw!.fileName}${raw!.sheets.length > 1 ? ` · aba ${sheet!.name}` : ''}`);
      await saveDataset(ds);
      setResult({ ds }); setStep('done');
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  const fin = useFinanceData();
  const confirmFinance = async (accountId: string, createCategories: boolean, defaultStatus: 'realized' | 'pending') => {
    if (!fin) return;
    setLoading(true);
    try {
      const ds = buildDataset(sheet!, plan, name, '');
      const cats = [...fin.categories];
      const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
      const existing = new Set(fin.transactions.map((t) => `${t.date}|${t.amount.toFixed(2)}|${t.description.trim().toLowerCase()}`));
      const newCats: typeof cats = [];
      const txs: Transaction[] = [];
      let dup = 0, invalid = 0;
      const now = Date.now();
      for (const r of ds.rows) {
        const date = mapping.date ? (r[mapping.date] as string | null) : null;
        let amount: number | null = null;
        let type: 'income' | 'expense' | null = null;
        if (mapping.amount) { const v = r[mapping.amount]; amount = typeof v === 'number' ? v : parseNumber(v); }
        else if (mapping.income || mapping.expense) {
          const inc = mapping.income ? Number(r[mapping.income] ?? 0) || 0 : 0, exp = mapping.expense ? Number(r[mapping.expense] ?? 0) || 0 : 0;
          if (inc) { amount = Math.abs(inc); type = 'income'; } else if (exp) { amount = Math.abs(exp); type = 'expense'; }
        }
        if (mapping.type && r[mapping.type] != null) {
          const t = String(r[mapping.type]).toLowerCase();
          if (/receita|entrada|cr[eé]dito|^c$|recebid|income|\+/.test(t)) type = 'income';
          else if (/despesa|sa[ií]da|d[eé]bito|^d$|pag|gasto|expense|-/.test(t)) type = 'expense';
        }
        if (amount != null && type == null) type = amount < 0 ? 'expense' : 'income';
        if (!date || amount == null || amount === 0 || !type) { invalid++; continue; }
        const description = String((mapping.description && r[mapping.description]) ?? '').trim() || (type === 'income' ? 'Receita importada' : 'Despesa importada');
        const abs = Math.round(Math.abs(amount) * 100) / 100;
        const key = `${date}|${abs.toFixed(2)}|${description.toLowerCase()}`;
        if (existing.has(key)) { dup++; continue; }
        existing.add(key);
        let categoryId = 'cat_outros';
        const cn = mapping.category ? String(r[mapping.category] ?? '').trim() : '';
        if (cn) {
          let c = catByName.get(cn.toLowerCase());
          if (!c && createCategories) {
            c = { id: uid('cat'), name: cn, kind: type, color: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'][newCats.length % 6], icon: 'Tag', createdAt: now };
            newCats.push(c); catByName.set(cn.toLowerCase(), c);
          }
          if (c) categoryId = c.id;
        }
        const acc = mapping.account ? fin.accounts.find((a) => a.name.toLowerCase() === String(r[mapping.account!] ?? '').toLowerCase()) : undefined;
        const st = mapping.status ? String(r[mapping.status] ?? '').toLowerCase() : '';
        const realized = st ? /pag|receb|ok|sim|conclu|efetiv/.test(st) && !/n[aã]o|pend|aberto|atras/.test(st) : defaultStatus === 'realized' && date <= todayISO();
        txs.push({
          id: uid('tx'), description, amount: abs, type, categoryId, date, accountId: acc?.id ?? accountId,
          paymentMethod: mapping.method ? String(r[mapping.method] ?? '') : '', status: realized ? (type === 'income' ? 'received' : 'paid') : 'pending', createdAt: now, updatedAt: now,
        });
      }
      await tracked(() => db.transaction('rw', db.transactions, db.categories, async () => { if (newCats.length) await db.categories.bulkPut(newCats); await db.transactions.bulkPut(txs); }));
      setResult({ tx: { added: txs.length, dup, invalid } }); setStep('done');
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  const createSuggested = async () => {
    const ds = result?.ds; if (!ds) return;
    const sugg = suggestCharts(ds).slice(0, 6);
    const widgets = buildWidgets(ds.id, sugg.map((s) => [s.type, s.title, s.config, s.type === 'kpi' ? [3, 3] : [6, 7]]));
    const now = Date.now();
    const d = { id: uid('db'), name: `Análise: ${ds.name}`, description: 'Criado automaticamente a partir das sugestões.', widgets, filters: [], createdAt: now, updatedAt: now };
    await tracked(() => db.dashboards.put(d));
    close(); navigate(`/dashboards/${d.id}`);
  };

  const titles: Record<Step, string> = { source: 'Importar dados', columns: 'Revise as colunas', target: 'Onde salvar', done: 'Importação concluída' };

  return (
    <Modal open={open} onClose={close} title={titles[step]} size="xl"
      description={step === 'source' ? 'Excel (XLSX/XLS/ODS), CSV, JSON ou dados colados de outra planilha. Tudo é processado no seu navegador.' : undefined}
      footer={
        step === 'columns' ? <><Button onClick={reset}>Voltar</Button><Button variant="primary" disabled={!plan.some((p) => p.include)} onClick={toTarget}>Continuar</Button></>
        : step === 'target' ? <><Button onClick={() => setStep('columns')}>Voltar</Button>{target === 'dataset' && <Button variant="primary" loading={loading} onClick={confirmDataset}>Confirmar importação</Button>}</>
        : step === 'done' ? <><Button onClick={close}>Fechar</Button>{result?.ds ? <><Button onClick={() => { close(); navigate(`/planilhas/${result.ds!.id}`); }}>Abrir planilha</Button><Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={createSuggested}>Criar dashboard sugerido</Button></> : <Button variant="primary" onClick={() => { close(); navigate('/financas/lancamentos'); }}>Ver lançamentos</Button>}</>
        : <Button onClick={close}>Cancelar</Button>
      }>
      {error && <div className="mb-4 rounded-lg bg-expense-soft text-expense p-3 text-sm flex gap-2" role="alert"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />{error}</div>}

      {step === 'source' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0]); }}
            className={`rounded-xl border-2 border-dashed p-6 text-center flex flex-col items-center justify-center gap-3 min-h-[220px] transition ${dragOver ? 'border-primary bg-primary-soft' : 'border-border'}`}>
            <FileSpreadsheet className="h-10 w-10 text-primary" aria-hidden />
            <div><p className="font-medium">Arraste um arquivo aqui</p><p className="text-sm text-subtle">ou escolha no seu dispositivo</p></div>
            <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.json" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="primary" icon={<Upload className="h-4 w-4" />} loading={loading} onClick={() => fileRef.current?.click()}>Escolher arquivo</Button>
            <p className="text-xs text-subtle">XLSX, XLS, ODS, CSV, TSV ou JSON · até 50 MB</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="paste" className="label flex items-center gap-1.5"><ClipboardPaste className="h-4 w-4" aria-hidden />Colar dados</label>
            <textarea id="paste" className="input h-auto min-h-[160px] py-2 font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Copie células do Excel/Google Planilhas e cole aqui.\nA primeira linha deve conter os cabeçalhos.\n\nData\tDescrição\tValor\n05/03/2025\tMercado\t-152,30'} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={!paste.trim()} onClick={onPaste}>Ler dados colados</Button>
              <Button variant="ghost" icon={<Table className="h-4 w-4" />} onClick={() => { close(); navigate('/planilhas/nova'); }}>Digitar manualmente</Button>
            </div>
          </div>
        </div>
      )}

      {step === 'columns' && sheet && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label><span className="label">Nome da planilha</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
            {raw!.sheets.length > 1 && (
              <label><span className="label">Aba</span>
                <select className="input" value={sheetIdx} onChange={(e) => chooseSheet(+e.target.value)}>{raw!.sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.rows.length} linhas)</option>)}</select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="primary">{sheet.rows.length.toLocaleString('pt-BR')} linhas</Badge>
            <Badge>{plan.filter((p) => p.include).length} de {plan.length} colunas</Badge>
            {sheet.headerDetected ? <Badge tone="income"><CheckCircle2 className="h-3 w-3" aria-hidden />Cabeçalhos identificados</Badge> : <Badge tone="warn"><AlertTriangle className="h-3 w-3" aria-hidden />Cabeçalhos não encontrados — nomes gerados</Badge>}
            {totalInvalid > 0 ? <Badge tone="warn"><AlertTriangle className="h-3 w-3" aria-hidden />{totalInvalid} valor(es) não interpretado(s)</Badge> : <Badge tone="income"><CheckCircle2 className="h-3 w-3" aria-hidden />Nenhum valor inválido</Badge>}
          </div>
          {raw!.warnings.length > 0 && <ul className="text-xs text-warn list-disc pl-5">{raw!.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

          <div className="overflow-x-auto scrollbar-thin border border-border rounded-lg">
            <table className="text-sm min-w-full">
              <thead className="bg-muted">
                <tr>
                  {plan.map((p, i) => {
                    const rep = report.find((r) => r.name === p.name);
                    return (
                      <th key={i} className={`p-2 align-top text-left min-w-[150px] ${p.include ? '' : 'opacity-50'}`}>
                        <label className="flex items-center gap-1.5 mb-1"><input type="checkbox" checked={p.include} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} aria-label={`Incluir coluna ${p.name}`} />
                          <input className="bg-transparent font-semibold w-full focus:outline-none focus:ring-1 focus:ring-primary rounded px-1" value={p.name} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nome da coluna" />
                        </label>
                        <select className="input h-8 text-xs" value={p.type} disabled={!p.include} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, type: e.target.value as ColumnType } : x)))} aria-label={`Tipo da coluna ${p.name}`}>
                          {(Object.keys(TYPE_LABELS) as ColumnType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                        </select>
                        {p.include && rep && (
                          <div className="text-[11px] font-normal mt-1 space-y-0.5">
                            {rep.empty > 0 && <div className="text-subtle">{rep.empty} vazio(s)</div>}
                            {rep.invalid > 0 && <div className="text-warn" title={`Exemplos: ${rep.examples.join(' | ')}`}>⚠ {rep.invalid} inválido(s): “{rep.examples[0]}”</div>}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, 8).map((r, ri) => (
                  <tr key={ri} className="border-t border-border">
                    {plan.map((p, i) => {
                      const c = coerce(r[p.index], p.type);
                      return <td key={i} className={`px-2 py-1 whitespace-nowrap ${!p.include ? 'opacity-40' : ''} ${!c.ok ? 'bg-warn-soft text-warn' : ''}`} title={!c.ok ? 'Valor não interpretado para o tipo escolhido' : undefined}>{r[p.index] instanceof Date ? (r[p.index] as Date).toLocaleDateString('pt-BR') : String(r[p.index] ?? '')}{!c.ok && ' ⚠'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-subtle">Prévia das 8 primeiras linhas. Valores marcados com ⚠ não correspondem ao tipo escolhido e ficarão <b>vazios</b> — altere o tipo para “Texto” se quiser preservá-los como estão.</p>
        </div>
      )}

      {step === 'target' && (
        <div className="space-y-4">
          <Segmented label="Destino" value={target} onChange={setTarget} options={[{ value: 'dataset', label: <><Table className="h-4 w-4" aria-hidden />Nova planilha</> }, { value: 'finance', label: <><Wallet className="h-4 w-4" aria-hidden />Lançamentos financeiros</> }]} />
          {target === 'dataset' ? (
            <div className="text-sm text-subtle space-y-2">
              <p>Os dados serão salvos como a planilha <b className="text-fg">“{name || 'Planilha importada'}”</b>, com {plan.filter((p) => p.include).length} colunas e {sheet!.rows.length} linhas. Você poderá editá-la e usá-la em qualquer dashboard.</p>
              {detectFinanceMapping(buildDataset({ ...sheet!, rows: sheet!.rows.slice(0, 1) }, plan, '', '').columns).score >= 4 && (
                <p className="rounded-lg bg-primary-soft text-primary p-3 flex gap-2"><Sparkles className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />Esta planilha parece conter movimentações financeiras (data, descrição, valor). Você pode importá-la como <button className="underline font-semibold" onClick={() => setTarget('finance')}>lançamentos financeiros</button>.</p>
              )}
            </div>
          ) : fin ? <FinanceMappingForm cols={buildDataset({ ...sheet!, rows: [] }, plan, '', '').columns} mapping={mapping} setMapping={setMapping} accounts={fin.accounts} loading={loading} onConfirm={confirmFinance} /> : null}
        </div>
      )}

      {step === 'done' && result && (
        <div className="text-center py-6 space-y-2">
          <CheckCircle2 className="h-12 w-12 text-income mx-auto" aria-hidden />
          {result.ds && <><p className="font-semibold">Planilha “{result.ds.name}” salva</p><p className="text-sm text-subtle">{result.ds.rows.length} linhas e {result.ds.columns.length} colunas. {totalInvalid > 0 && `${totalInvalid} valor(es) que não puderam ser interpretados ficaram vazios.`}</p>
            <div className="text-left max-w-md mx-auto mt-4"><p className="text-sm font-medium mb-1 flex items-center gap-1"><Sparkles className="h-4 w-4 text-primary" aria-hidden />Gráficos sugeridos para estes dados</p><ul className="text-sm text-subtle list-disc pl-5">{suggestCharts(result.ds).slice(0, 6).map((s, i) => <li key={i}>{s.title} — {s.reason}</li>)}</ul></div></>}
          {result.tx && <><p className="font-semibold">{result.tx.added} lançamento(s) importado(s)</p>
            <p className="text-sm text-subtle">{result.tx.dup > 0 && `${result.tx.dup} ignorado(s) por já existirem (mesma data, valor e descrição). `}{result.tx.invalid > 0 && `${result.tx.invalid} linha(s) sem data ou valor válidos não foram importadas.`}</p></>}
        </div>
      )}
    </Modal>
  );
}

function FinanceMappingForm({ cols, mapping, setMapping, accounts, loading, onConfirm }: {
  cols: Dataset['columns']; mapping: FinanceMapping; setMapping: (m: FinanceMapping) => void; accounts: { id: string; name: string }[]; loading: boolean;
  onConfirm: (accountId: string, createCategories: boolean, status: 'realized' | 'pending') => void;
}) {
  const [account, setAccount] = useState(accounts[0]?.id ?? '');
  const [createCats, setCreateCats] = useState(true);
  const [status, setStatus] = useState<'realized' | 'pending'>('realized');
  const fields: [keyof FinanceMapping, string, string?][] = [
    ['date', 'Data *'], ['description', 'Descrição'], ['amount', 'Valor', 'Negativo = despesa, positivo = receita (se não houver coluna de tipo).'],
    ['income', 'Coluna de entradas', 'Use quando o extrato separa créditos e débitos.'], ['expense', 'Coluna de saídas'],
    ['type', 'Tipo (receita/despesa)'], ['category', 'Categoria'], ['account', 'Conta'], ['method', 'Forma de pagamento'], ['status', 'Situação'],
  ];
  const ok = !!mapping.date && !!(mapping.amount || mapping.income || mapping.expense);
  return (
    <div className="space-y-4">
      <p className="text-sm text-subtle">Indique qual coluna corresponde a cada informação. Detectamos automaticamente o que foi possível.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {fields.map(([k, l, hint]) => (
          <label key={k}><span className="label">{l}</span>
            <select className="input h-9" value={mapping[k] ?? ''} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value || undefined })}>
              <option value="">— não usar —</option>
              {cols.map((c) => <option key={c.key} value={c.key}>{c.name} ({TYPE_LABELS[c.type]})</option>)}
            </select>
            {hint && <span className="text-xs text-subtle">{hint}</span>}
          </label>
        ))}
        <label><span className="label">Conta padrão</span><select className="input h-9" value={account} onChange={(e) => setAccount(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label><span className="label">Situação padrão</span><select className="input h-9" value={status} onChange={(e) => setStatus(e.target.value as 'realized' | 'pending')}><option value="realized">Pago / recebido</option><option value="pending">Pendente</option></select></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} />Criar categorias que ainda não existem (senão, vão para “Outros”)</label>
      <p className="text-xs text-subtle">Lançamentos com mesma data, valor e descrição de um já existente são ignorados para evitar duplicações.</p>
      <Button variant="primary" disabled={!ok} loading={loading} onClick={() => onConfirm(account, createCats, status)}>Importar lançamentos</Button>
      {!ok && <p className="text-xs text-expense">Selecione ao menos a data e uma coluna de valor.</p>}
    </div>
  );
}
