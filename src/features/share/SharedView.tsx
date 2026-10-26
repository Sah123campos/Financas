// Visualização de um dashboard recebido por link (somente leitura) + importação de cópia.
import { useMemo, useState } from 'react';
import { decodePackage, materialize, type SharePackage } from '@/share/share';
import { DashboardBoard } from '@/features/dashboards/DashboardPage';
import { db } from '@/db/schema';
import { saveShareRecord } from '@/db/repo';
import { tracked } from '@/state/saveStatus';
import { navigate } from '@/state/router';
import { toast } from '@/state/toast';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';
import { uid } from '@/lib/id';
import { AlertTriangle, Info } from 'lucide-react';

export async function importPackage(p: SharePackage, method: 'link' | 'file') {
  const { dashboard, datasets } = materialize(p);
  await tracked(() => db.transaction('rw', db.dashboards, db.datasets, db.shares, async () => {
    await db.datasets.bulkPut(datasets);
    await db.dashboards.put({ ...dashboard, name: dashboard.name + (p.author ? ` (de ${p.author})` : ' (importado)') });
  }));
  await saveShareRecord({ id: uid('sh'), direction: 'received', name: dashboard.name, dashboardId: dashboard.id, createdAt: Date.now(), sizeBytes: 0, method });
  return dashboard.id;
}

export function SharedView({ payload }: { payload: string }) {
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => { try { return { pkg: decodePackage(payload) }; } catch (e) { return { error: (e as Error).message }; } }, [payload]);
  if ('error' in result) {
    return <div className="max-w-lg mx-auto mt-10"><EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Não foi possível abrir o compartilhamento" action={<Button onClick={() => navigate('/')}>Ir para o início</Button>}>{result.error}</EmptyState></div>;
  }
  const p = result.pkg!;
  const doImport = async () => {
    setBusy(true);
    try { const id = await importPackage(p, 'link'); toast('Cópia importada para seus dashboards.'); navigate(`/dashboards/${id}`, true); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="rounded-lg border border-border bg-surface p-3 mb-4 text-sm flex gap-2.5 items-start">
        <Info className="h-5 w-5 text-primary shrink-0" aria-hidden />
        <div className="flex-1">
          <b>Dashboard compartilhado{p.author ? ` por ${p.author}` : ''}</b> · gerado em {new Date(p.createdAt).toLocaleString('pt-BR')}.
          {p.note && <p className="mt-1 italic">“{p.note}”</p>}
          <p className="text-subtle mt-1">Você está vendo uma cópia somente leitura. Ela não se atualiza automaticamente com as alterações de quem compartilhou. Você pode filtrar e explorar; para editar, importe uma cópia (fica salva apenas neste navegador).</p>
        </div>
      </div>
      <DashboardBoard dashboard={p.dashboard} datasets={p.datasets} readOnly onImport={busy ? undefined : doImport} />
    </div>
  );
}
