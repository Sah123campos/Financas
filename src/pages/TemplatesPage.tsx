import { useState } from 'react';
import { TEMPLATES, type Template } from '@/templates/templates';
import { applyTemplate, loadSampleFinance } from '@/templates/apply';
import { PageHeader } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { navigate } from '@/state/router';
import { toast } from '@/state/toast';
import { db } from '@/db/schema';
import { confirmDialog } from '@/components/ui/confirm';

export function TemplatesPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const use = async (t: Template) => {
    setBusy(t.id);
    try {
      if (t.id === 'finance' && (await db.transactions.count()) === 0) {
        if (await confirmDialog({ title: 'Carregar dados de exemplo?', message: 'Você ainda não tem lançamentos. Deseja carregar 6 meses de lançamentos fictícios para explorar o modelo? Você pode apagá-los depois em Configurações.', confirmLabel: 'Carregar exemplos' })) await loadSampleFinance();
      }
      const id = await applyTemplate(t);
      toast(`Modelo "${t.name}" criado.`);
      navigate(`/dashboards/${id}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Modelos prontos" description="Comece com um dashboard configurado. Os modelos de exemplo criam uma planilha fictícia que você pode editar ou substituir pelos seus dados." />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => (
          <article key={t.id} className="card p-4 flex flex-col">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center"><Icon name={t.icon} className="h-5 w-5" /></div>
              <h3 className="font-semibold">{t.name}</h3>
            </div>
            <p className="text-sm text-subtle flex-1">{t.description}</p>
            <div className="flex flex-wrap gap-1 mt-3">{t.tags.map((g) => <span key={g} className="chip h-6 text-[11px]">{g}</span>)}</div>
            <Button variant="primary" className="mt-4 self-start" loading={busy === t.id} onClick={() => use(t)}>Usar modelo</Button>
          </article>
        ))}
      </div>
    </div>
  );
}
