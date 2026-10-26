import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { saveDashboard } from '@/db/repo';
import { navigate } from '@/state/router';
import { toast } from '@/state/toast';
import { tracked } from '@/state/saveStatus';
import { confirmDialog } from '@/components/ui/confirm';
import { PageHeader, EmptyState, Spinner, Badge, Menu, MenuItem } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ImportWizard } from '@/features/datasets/ImportWizard';
import { ImportProjectButton } from '@/features/share/ImportProject';
import { agruparProjetos, criarProjeto, excluirProjeto, type Projeto } from '@/features/projects/projects';
import { FileSpreadsheet, FolderOpen, LayoutDashboard, MoreVertical, Pencil, Plus, Search, Sparkles, Table, Trash2, Upload, Wallet } from 'lucide-react';

export function ProjectsPage() {
  const dashboards = useLiveQuery(() => db.dashboards.toArray(), []);
  const datasets = useLiveQuery(() => db.datasets.toArray(), []);
  const [importing, setImporting] = useState(false);
  const [busca, setBusca] = useState('');
  const [renomear, setRenomear] = useState<Projeto | null>(null);
  const [nome, setNome] = useState('');
  const grupos = useMemo(() => (dashboards && datasets ? agruparProjetos(dashboards, datasets) : null), [dashboards, datasets]);
  if (!grupos) return <Spinner />;

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? grupos.projetos.filter((p) => p.dashboard.name.toLowerCase().includes(termo) || p.planilhas.some((pl) => pl.name.toLowerCase().includes(termo)))
    : grupos.projetos;

  const novoProjeto = async (id: string) => {
    const ds = await db.datasets.get(id);
    if (!ds) return;
    const d = await criarProjeto(ds);
    toast(`Projeto "${d.name}" criado.`);
    navigate(`/dashboards/${d.id}`);
  };

  const excluir = async (p: Projeto) => {
    const planilhas = p.planilhas.filter((pl) => !pl.financeiro);
    const ok = await confirmDialog({
      title: 'Excluir projeto?',
      message: planilhas.length
        ? `"${p.dashboard.name}" e seus gráficos serão excluídos, junto com a planilha ${planilhas.map((pl) => `"${pl.name}"`).join(', ')} (se nenhum outro projeto usar).`
        : `"${p.dashboard.name}" e seus gráficos serão excluídos.`,
      danger: true, confirmLabel: 'Excluir',
    });
    if (!ok) return;
    await tracked(() => excluirProjeto(p, true));
    toast('Projeto excluído.');
  };

  const salvarNome = async () => {
    if (!renomear) return;
    await saveDashboard({ ...renomear.dashboard, name: nome.trim() || renomear.dashboard.name });
    setRenomear(null);
    toast('Nome alterado.');
  };

  const vazio = grupos.projetos.length === 0 && grupos.soltas.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Meus projetos" description="Cada planilha importada vira um projeto, com a planilha e um dashboard prontos. Ficam salvos neste aparelho."
        actions={<><ImportProjectButton /><Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>Importar planilha</Button></>} />

      {vazio ? (
        <EmptyState icon={<FolderOpen className="h-6 w-6" />} title="Nenhum projeto ainda"
          action={<><Button variant="primary" icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>Importar planilha</Button><Button onClick={() => navigate('/modelos')}>Começar de um modelo</Button></>}>
          Importe uma planilha (Excel, CSV ou JSON): o projeto é criado e aberto na hora.
        </EmptyState>
      ) : (
        <>
          {grupos.projetos.length > 4 && (
            <label className="relative block max-w-sm">
              <span className="sr-only">Buscar projeto</span>
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
              <input className="input pl-9" placeholder="Buscar projeto ou planilha…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
          )}
          {grupos.projetos.length > 0 && (
            <section aria-label="Projetos">
              {visiveis.length === 0 && <p className="text-sm text-subtle">Nenhum projeto com “{busca}”.</p>}
              <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {visiveis.map((p) => (
                  <li key={p.dashboard.id} className="card p-4 flex flex-col gap-3 hover:border-primary/50 transition">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0"><FolderOpen className="h-5 w-5" aria-hidden /></div>
                      <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/dashboards/${p.dashboard.id}`)}>
                        <h3 className="font-semibold truncate hover:text-primary">{p.dashboard.name}</h3>
                        <p className="text-xs text-subtle mt-0.5">{p.dashboard.widgets.length} gráfico(s) · atualizado {new Date(p.atualizado).toLocaleDateString('pt-BR')}</p>
                      </button>
                      <Menu label={`Opções de ${p.dashboard.name}`} trigger={<MoreVertical className="h-4 w-4" />}>
                        <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => { setRenomear(p); setNome(p.dashboard.name); }}>Renomear</MenuItem>
                        <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => excluir(p)}>Excluir projeto</MenuItem>
                      </Menu>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {p.planilhas.length === 0 && <Badge>Sem planilha</Badge>}
                      {p.planilhas.map((pl) => (
                        <Badge key={pl.id} tone={pl.financeiro ? 'income' : 'primary'}>
                          {pl.financeiro ? <Wallet className="h-3 w-3" aria-hidden /> : <FileSpreadsheet className="h-3 w-3" aria-hidden />}
                          {pl.name}{pl.financeiro ? '' : ` · ${pl.rows} linhas`}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <Button size="sm" variant="primary" icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => navigate(`/dashboards/${p.dashboard.id}`)}>Abrir</Button>
                      {p.planilhas.filter((pl) => !pl.financeiro).slice(0, 1).map((pl) => (
                        <Button key={pl.id} size="sm" icon={<Table className="h-4 w-4" />} onClick={() => navigate(`/planilhas/${pl.id}`)}>Planilha</Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {grupos.soltas.length > 0 && (
            <section aria-label="Planilhas sem projeto">
              <h2 className="font-semibold mb-1">Planilhas sem projeto</h2>
              <p className="text-sm text-subtle mb-2">Crie um projeto para ver os gráficos dessas planilhas.</p>
              <ul className="card divide-y divide-border">
                {grupos.soltas.map((d) => (
                  <li key={d.id} className="p-3 flex flex-wrap items-center gap-3">
                    <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden />
                    <button className="flex-1 min-w-0 text-left" onClick={() => navigate(`/planilhas/${d.id}`)}>
                      <span className="block truncate font-medium text-sm">{d.name}</span>
                      <span className="text-xs text-subtle">{d.rows.length} linhas</span>
                    </button>
                    <Button size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => novoProjeto(d.id)}>Criar projeto</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setImporting(true)}>Novo projeto a partir de uma planilha</Button>
        </>
      )}

      <Modal open={!!renomear} onClose={() => setRenomear(null)} title="Renomear projeto" size="sm"
        footer={<><Button onClick={() => setRenomear(null)}>Cancelar</Button><Button variant="primary" onClick={salvarNome}>Salvar</Button></>}>
        <label className="label" htmlFor="projnome">Nome</label>
        <input id="projnome" data-autofocus className="input" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && salvarNome()} />
      </Modal>
      <ImportWizard open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
