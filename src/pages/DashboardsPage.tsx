import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/db/schema';
import { saveDashboard } from '@/db/repo';
import { navigate } from '@/state/router';
import { PageHeader, EmptyState, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { uid } from '@/lib/id';
import { LayoutDashboard, LayoutTemplate, Plus, Upload } from 'lucide-react';
import { chartMeta } from '@/charts/chartTypes';
import { ImportProjectButton } from '@/features/share/ImportProject';

export function DashboardsPage() {
  const list = useLiveQuery(() => db.dashboards.orderBy('updatedAt').reverse().toArray(), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  if (!list) return <Spinner />;
  const create = async () => {
    const now = Date.now();
    const d = { id: uid('db'), name: name.trim() || 'Novo dashboard', description: '', widgets: [], filters: [], createdAt: now, updatedAt: now };
    await saveDashboard(d);
    setCreating(false); setName('');
    navigate(`/dashboards/${d.id}?edit=1`);
  };
  return (
    <div>
      <PageHeader title="Dashboards" description="Painéis interativos com filtros cruzados, detalhamento e compartilhamento."
        actions={<><ImportProjectButton /><Button icon={<LayoutTemplate className="h-4 w-4" />} onClick={() => navigate('/modelos')}>Modelos</Button><Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Novo dashboard</Button></>} />
      {list.length === 0 ? (
        <EmptyState icon={<LayoutDashboard className="h-6 w-6" />} title="Nenhum dashboard ainda" action={<><Button variant="primary" onClick={() => setCreating(true)}>Criar em branco</Button><Button onClick={() => navigate('/modelos')}>Começar de um modelo</Button></>}>
          Crie um painel do zero ou parta de um modelo pronto (finanças, vendas, estoque…).
        </EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((d) => (
            <button key={d.id} onClick={() => navigate(`/dashboards/${d.id}`)} className="card p-4 text-left hover:border-primary/50 hover:shadow-md transition group">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0"><LayoutDashboard className="h-5 w-5" aria-hidden /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate group-hover:text-primary">{d.name}</h3>
                  <p className="text-xs text-subtle mt-0.5">{d.widgets.length} gráfico(s) · atualizado {new Date(d.updatedAt).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              {d.description && <p className="text-sm text-subtle mt-2 line-clamp-2">{d.description}</p>}
              <div className="flex flex-wrap gap-1 mt-3">{[...new Set(d.widgets.map((w) => w.type))].slice(0, 5).map((t) => <span key={t} className="chip text-[11px] h-6">{chartMeta(t)?.label}</span>)}</div>
            </button>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Novo dashboard" size="sm" footer={<><Button onClick={() => setCreating(false)}>Cancelar</Button><Button variant="primary" onClick={create}>Criar</Button></>}>
        <label className="label" htmlFor="dbname">Nome</label>
        <input id="dbname" data-autofocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Controle mensal" onKeyDown={(e) => e.key === 'Enter' && create()} />
        <p className="text-xs text-subtle mt-2 flex items-center gap-1"><Upload className="h-3 w-3" aria-hidden />Você poderá usar qualquer planilha importada ou os seus lançamentos financeiros.</p>
      </Modal>
    </div>
  );
}
