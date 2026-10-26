import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { navigate } from '@/state/router';
import { PageHeader, EmptyState, Spinner, Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { ImportWizard } from '@/features/datasets/ImportWizard';
import { FileSpreadsheet, Plus, Upload, Wallet } from 'lucide-react';
import { TYPE_LABELS } from '@/data/values';

export function DatasetsPage() {
  const list = useLiveQuery(() => db.datasets.orderBy('updatedAt').reverse().toArray(), []);
  const txCount = useLiveQuery(() => db.transactions.count(), []);
  const [importing, setImporting] = useState(false);
  if (!list) return <Spinner />;
  return (
    <div>
      <PageHeader title="Planilhas e tabelas" description="Importe, edite e organize seus dados. Alterações atualizam automaticamente os dashboards."
        actions={<><Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/planilhas/nova')}>Nova planilha</Button><Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>Importar</Button></>} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <button onClick={() => navigate('/financas/lancamentos')} className="card p-4 text-left hover:border-primary/50 transition">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-income-soft text-income flex items-center justify-center"><Wallet className="h-5 w-5" aria-hidden /></div>
            <div><h3 className="font-semibold">Lançamentos financeiros</h3><p className="text-xs text-subtle">{txCount ?? 0} registro(s) · tabela automática da Gestão financeira</p></div>
          </div>
        </button>
        {list.map((d) => (
          <button key={d.id} onClick={() => navigate(`/planilhas/${d.id}`)} className="card p-4 text-left hover:border-primary/50 transition">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center"><FileSpreadsheet className="h-5 w-5" aria-hidden /></div>
              <div className="min-w-0"><h3 className="font-semibold truncate">{d.name}</h3><p className="text-xs text-subtle truncate">{d.source} · {new Date(d.updatedAt).toLocaleDateString('pt-BR')}</p></div>
            </div>
            <div className="flex flex-wrap gap-1 mt-3"><Badge tone="primary">{d.rows.length} linhas</Badge>{d.columns.slice(0, 4).map((c) => <Badge key={c.key}>{c.name} · {TYPE_LABELS[c.type]}</Badge>)}{d.columns.length > 4 && <Badge>+{d.columns.length - 4}</Badge>}</div>
          </button>
        ))}
      </div>
      {list.length === 0 && <div className="mt-4"><EmptyState icon={<FileSpreadsheet className="h-6 w-6" />} title="Nenhuma planilha importada" action={<Button variant="primary" onClick={() => setImporting(true)}>Importar planilha</Button>}>Importe arquivos Excel, CSV ou JSON, cole dados de outra planilha ou digite manualmente.</EmptyState></div>}
      <ImportWizard open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
