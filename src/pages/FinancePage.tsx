import { navigate } from '@/state/router';
import { PageHeader } from '@/components/ui/misc';
import { FinanceOverview } from '@/features/finance/FinanceOverview';
import { TransactionsList } from '@/features/finance/TransactionsList';
import { BudgetsView, GoalsView, RecurringView } from '@/features/finance/Planning';
import { RegistryView } from '@/features/finance/Registry';

const TABS = [
  { id: '', label: 'Resumo' }, { id: 'lancamentos', label: 'Lançamentos' }, { id: 'orcamentos', label: 'Orçamentos' },
  { id: 'metas', label: 'Metas' }, { id: 'recorrentes', label: 'Recorrentes' }, { id: 'cadastros', label: 'Categorias e contas' },
];

export function FinancePage({ tab = '' }: { tab?: string }) {
  return (
    <div>
      <PageHeader title="Gestão financeira" description="Suas receitas, despesas, contas e metas — tudo salvo neste navegador." />
      <nav className="flex gap-1 overflow-x-auto scrollbar-thin -mx-1 px-1 mb-4 border-b border-border" aria-label="Seções da gestão financeira">
        {TABS.map((t) => (
          <a key={t.id} href={`#/financas${t.id ? '/' + t.id : ''}`} onClick={(e) => { e.preventDefault(); navigate(`/financas${t.id ? '/' + t.id : ''}`); }}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`shrink-0 px-3 h-10 inline-flex items-center text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-subtle hover:text-fg'}`}>{t.label}</a>
        ))}
      </nav>
      {tab === '' && <FinanceOverview />}
      {tab === 'lancamentos' && <TransactionsList />}
      {tab === 'orcamentos' && <BudgetsView />}
      {tab === 'metas' && <GoalsView />}
      {tab === 'recorrentes' && <RecurringView />}
      {tab === 'cadastros' && <RegistryView />}
    </div>
  );
}
