import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { deleteShareRecord } from '@/db/repo';
import { PageHeader, EmptyState, Spinner, Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { navigate } from '@/state/router';
import { ImportProjectButton } from '@/features/share/ImportProject';
import { Inbox, Send, Trash2, Share2, Info } from 'lucide-react';

export function SharedPage() {
  const list = useLiveQuery(() => db.shares.orderBy('createdAt').reverse().toArray(), []);
  if (!list) return <Spinner />;
  const sent = list.filter((s) => s.direction === 'sent'), received = list.filter((s) => s.direction === 'received');
  return (
    <div className="space-y-6">
      <PageHeader title="Projetos compartilhados" description="Histórico do que você enviou e recebeu. Para compartilhar, abra um dashboard e toque em “Compartilhar”." actions={<ImportProjectButton label="Importar arquivo recebido" />} />
      <div className="card p-4 text-sm flex gap-3">
        <Info className="h-5 w-5 text-primary shrink-0" aria-hidden />
        <div className="space-y-1 text-subtle">
          <p><b className="text-fg">Sem servidor, sem conta.</b> Os links levam uma cópia compactada dos dados no próprio endereço; arquivos levam a mesma cópia em JSON.</p>
          <p>Cópias recebidas não se atualizam sozinhas. Links enviados não podem ser revogados — por isso, revise o que será incluído antes de compartilhar.</p>
        </div>
      </div>
      <Section title="Recebidos e importados" icon={<Inbox className="h-4 w-4" />} items={received} empty="Nenhum projeto importado. Abra um link recebido ou importe um arquivo .painel.json." />
      <Section title="Enviados por você" icon={<Send className="h-4 w-4" />} items={sent} empty="Você ainda não compartilhou nenhum dashboard." />
    </div>
  );
}

function Section({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: { id: string; name: string; dashboardId?: string; createdAt: number; method: string; sizeBytes: number }[]; empty: string }) {
  return (
    <section>
      <h2 className="font-semibold mb-2 flex items-center gap-2">{icon}{title}</h2>
      {items.length === 0 ? <EmptyState icon={<Share2 className="h-5 w-5" />} title="Nada por aqui">{empty}</EmptyState> : (
        <ul className="card divide-y divide-border">
          {items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.name}</div>
                <div className="text-xs text-subtle flex gap-2 items-center"><Badge>{s.method === 'link' ? 'Link' : 'Arquivo'}</Badge>{new Date(s.createdAt).toLocaleString('pt-BR')}{s.sizeBytes ? ` · ${(s.sizeBytes / 1024).toFixed(1)} KB` : ''}</div>
              </div>
              {s.dashboardId && <Button size="sm" onClick={() => navigate(`/dashboards/${s.dashboardId}`)}>Abrir</Button>}
              <Button size="iconSm" variant="ghost" aria-label="Remover do histórico" onClick={() => deleteShareRecord(s.id)}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
