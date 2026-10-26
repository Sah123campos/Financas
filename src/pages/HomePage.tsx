import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useFinanceData } from '@/finance/financeDataset';
import { balanceAt, summarize } from '@/finance/metrics';
import { resolvePeriod, todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { navigate } from '@/state/router';
import { setPrefs, usePrefs } from '@/state/prefs';
import { openTxForm } from '@/features/finance/txFormStore';
import { ImportWizard } from '@/features/datasets/ImportWizard';
import { TEMPLATES } from '@/templates/templates';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ArrowDownCircle, ArrowUpCircle, FileSpreadsheet, LayoutDashboard, Plus, Upload, Wallet, X, ShieldCheck, Sparkles, Table } from 'lucide-react';

export function HomePage() {
  const prefs = usePrefs();
  const fin = useFinanceData();
  const dashboards = useLiveQuery(() => db.dashboards.orderBy('updatedAt').reverse().limit(4).toArray(), []);
  const datasets = useLiveQuery(() => db.datasets.orderBy('updatedAt').reverse().limit(4).toArray(), []);
  const [importing, setImporting] = useState(false);
  const month = useMemo(() => (fin ? summarize(fin.transactions, resolvePeriod('thisMonth')) : null), [fin]);
  const balance = fin ? balanceAt(fin.transactions, fin.accounts, todayISO()) : 0;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const hasFinance = (fin?.transactions.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{greet}{prefs.userName ? `, ${prefs.userName}` : ''}!</h1>
        <p className="text-sm text-subtle">Organize suas finanças, analise planilhas e crie dashboards — tudo no seu navegador.</p>
      </div>

      {!prefs.onboardingDone && (
        <section className="card p-5 relative border-primary/30 bg-gradient-to-br from-primary-soft/60 to-transparent animate-in" aria-label="Primeiros passos">
          <button className="absolute right-3 top-3 h-8 w-8 rounded-lg hover:bg-muted inline-flex items-center justify-center" onClick={() => setPrefs({ onboardingDone: true })} aria-label="Fechar boas-vindas"><X className="h-4 w-4" /></button>
          <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" aria-hidden />Bem-vindo! Por onde começar?</h2>
          <ol className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
            <li className="flex gap-2"><span className="h-6 w-6 rounded-full bg-primary text-primary-fg text-xs flex items-center justify-center shrink-0">1</span><span><b>Registre</b> uma despesa ou receita — só o valor é obrigatório.</span></li>
            <li className="flex gap-2"><span className="h-6 w-6 rounded-full bg-primary text-primary-fg text-xs flex items-center justify-center shrink-0">2</span><span><b>Importe</b> um extrato ou planilha (Excel, CSV, JSON).</span></li>
            <li className="flex gap-2"><span className="h-6 w-6 rounded-full bg-primary text-primary-fg text-xs flex items-center justify-center shrink-0">3</span><span><b>Monte</b> um dashboard ou use um modelo pronto.</span></li>
          </ol>
          <p className="text-xs text-subtle mt-3 flex items-start gap-1.5"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />Não é preciso criar conta. Seus dados ficam salvos somente neste navegador — faça backups em Configurações.</p>
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <QuickAction icon={<ArrowDownCircle className="h-5 w-5 text-expense" />} label="Adicionar despesa" onClick={() => openTxForm('expense')} />
        <QuickAction icon={<ArrowUpCircle className="h-5 w-5 text-income" />} label="Adicionar receita" onClick={() => openTxForm('income')} />
        <QuickAction icon={<Upload className="h-5 w-5 text-primary" />} label="Importar planilha" onClick={() => setImporting(true)} />
        <QuickAction icon={<Plus className="h-5 w-5 text-primary" />} label="Novo dashboard" onClick={() => navigate('/dashboards')} />
      </div>

      <section className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3"><Wallet className="h-5 w-5 text-primary" aria-hidden /><h2 className="font-semibold flex-1">Finanças deste mês</h2><Button size="sm" onClick={() => navigate('/financas')}>Abrir gestão financeira</Button></div>
        {hasFinance && month ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Saldo atual" value={fmtMoney(balance)} tone={balance < 0 ? 'expense' : undefined} />
            <Stat label="▲ Receitas" value={fmtMoney(month.income)} tone="income" />
            <Stat label="▼ Despesas" value={fmtMoney(month.expense)} tone="expense" />
            <Stat label="Resultado" value={fmtMoney(month.result)} tone={month.result >= 0 ? 'income' : 'expense'} hint={month.expensePending ? `${fmtMoney(month.expensePending)} a pagar` : undefined} />
          </div>
        ) : <p className="text-sm text-subtle">Nenhum lançamento ainda. Comece adicionando uma despesa ou receita, ou importe um extrato.</p>}
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section>
          <div className="flex items-center mb-2"><h2 className="font-semibold flex-1 flex items-center gap-2"><LayoutDashboard className="h-4 w-4" aria-hidden />Dashboards recentes</h2><Button size="sm" variant="ghost" onClick={() => navigate('/dashboards')}>Ver todos</Button></div>
          {dashboards?.length ? (
            <ul className="card divide-y divide-border">{dashboards.map((d) => <li key={d.id}><button className="w-full text-left p-3 hover:bg-muted flex items-center gap-3" onClick={() => navigate(`/dashboards/${d.id}`)}><LayoutDashboard className="h-4 w-4 text-primary" aria-hidden /><span className="flex-1 truncate font-medium text-sm">{d.name}</span><span className="text-xs text-subtle">{d.widgets.length} gráficos</span></button></li>)}</ul>
          ) : <EmptyBox text="Nenhum dashboard criado." action={<Button size="sm" onClick={() => navigate('/modelos')}>Usar um modelo</Button>} />}
        </section>
        <section>
          <div className="flex items-center mb-2"><h2 className="font-semibold flex-1 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" aria-hidden />Planilhas importadas</h2><Button size="sm" variant="ghost" onClick={() => navigate('/planilhas')}>Ver todas</Button></div>
          {datasets?.length ? (
            <ul className="card divide-y divide-border">{datasets.map((d) => <li key={d.id}><button className="w-full text-left p-3 hover:bg-muted flex items-center gap-3" onClick={() => navigate(`/planilhas/${d.id}`)}><Table className="h-4 w-4 text-primary" aria-hidden /><span className="flex-1 truncate font-medium text-sm">{d.name}</span><span className="text-xs text-subtle">{d.rows.length} linhas</span></button></li>)}</ul>
          ) : <EmptyBox text="Nenhuma planilha importada." action={<><Button size="sm" onClick={() => setImporting(true)}>Importar</Button><Button size="sm" variant="ghost" onClick={() => navigate('/planilhas/nova')}>Digitar dados</Button></>} />}
        </section>
      </div>

      <section>
        <div className="flex items-center mb-2"><h2 className="font-semibold flex-1">Modelos prontos</h2><Button size="sm" variant="ghost" onClick={() => navigate('/modelos')}>Ver todos</Button></div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {TEMPLATES.map((t) => <button key={t.id} onClick={() => navigate('/modelos')} className="card p-3 text-left hover:border-primary/50 transition"><Icon name={t.icon} className="h-5 w-5 text-primary mb-1.5" /><div className="text-sm font-medium">{t.name}</div><div className="text-[11px] text-subtle">{t.tags.join(' · ')}</div></button>)}
        </div>
      </section>
      <ImportWizard open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="card p-3 flex flex-col sm:flex-row items-center gap-2 text-sm font-medium hover:border-primary/50 hover:shadow-md transition active:scale-[.98] min-h-[64px]">{icon}<span className="text-center sm:text-left">{label}</span></button>;
}
function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'income' | 'expense'; hint?: string }) {
  return <div><div className="text-xs text-subtle">{label}</div><div className={`text-lg sm:text-xl font-semibold tabular ${tone === 'expense' && value.includes('-') ? 'text-expense' : ''}`}>{value}</div>{hint && <div className="text-[11px] text-subtle">{hint}</div>}</div>;
}
function EmptyBox({ text, action }: { text: string; action: React.ReactNode }) {
  return <div className="card p-4 text-sm text-subtle flex flex-wrap items-center gap-2 justify-between"><span>{text}</span><span className="flex gap-2">{action}</span></div>;
}
