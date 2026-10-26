import { useMemo, useState } from 'react';
import type { Dashboard, Dataset } from '@/db/types';
import { buildPackage, encodePackage, LINK_MAX_LENGTH, LINK_SAFE_LENGTH, packageToFile, shareUrl, usedColumns } from '@/share/share';
import { saveShareRecord } from '@/db/repo';
import { download } from '@/db/backup';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/state/toast';
import { getPrefs } from '@/state/prefs';
import { uid } from '@/lib/id';
import { AlertTriangle, Check, Copy, Download, ExternalLink, Link2, Lock, Share2, ShieldCheck } from 'lucide-react';

export function ShareDialog({ open, onClose, dashboard, datasets }: { open: boolean; onClose: () => void; dashboard: Dashboard; datasets: Dataset[] }) {
  const [widgetIds, setWidgetIds] = useState(dashboard.widgets.map((w) => w.id));
  const [columnMode, setColumnMode] = useState<'used' | 'all'>('used');
  const [applyFilters, setApplyFilters] = useState(dashboard.filters.length > 0);
  const [hide, setHide] = useState<string[]>(() => dashboard.widgets.some((w) => w.datasetId === '__finance__') ? ['__finance__:descricao'] : []);
  const [note, setNote] = useState('');
  const [author, setAuthor] = useState(getPrefs().userName);
  const [consent, setConsent] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const involved = useMemo(() => [...new Set(dashboard.widgets.filter((w) => widgetIds.includes(w.id)).map((w) => w.datasetId))].map((id) => datasets.find((d) => d.id === id)).filter(Boolean) as Dataset[], [dashboard, widgetIds, datasets]);
  const pkg = useMemo(() => buildPackage(dashboard, datasets, { widgetIds, columnMode, applyDashboardFilters: applyFilters, hideColumns: hide, author, note }), [dashboard, datasets, widgetIds, columnMode, applyFilters, hide, author, note]);
  const payload = useMemo(() => encodePackage(pkg), [pkg]);
  const rowCount = pkg.datasets.reduce((a, d) => a + d.rows.length, 0);
  const tooBigForLink = payload.length > LINK_MAX_LENGTH;
  const longLink = payload.length > LINK_SAFE_LENGTH;

  const record = (method: 'link' | 'file') => saveShareRecord({ id: uid('sh'), direction: 'sent', name: dashboard.name, dashboardId: dashboard.id, createdAt: Date.now(), sizeBytes: payload.length, method }).catch(() => undefined);
  const generate = () => { setLink(shareUrl(payload)); record('link'); };
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); toast('Link copiado.'); setTimeout(() => setCopied(false), 2000); }
    catch { toast('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.', 'warning'); }
  };
  const nativeShare = async () => { if (link && navigator.share) { try { await navigator.share({ title: dashboard.name, text: `Dashboard "${dashboard.name}"`, url: link }); } catch { /* cancelado */ } } };
  const file = () => { download(packageToFile(pkg), `${dashboard.name.replace(/[^\w\-]+/g, '_')}.painel.json`); record('file'); toast('Arquivo gerado. Envie-o para quem deve visualizar o dashboard.'); };

  const toggleHide = (k: string) => setHide((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  const reset = () => setLink(null);

  return (
    <Modal open={open} onClose={onClose} title={`Compartilhar "${dashboard.name}"`} size="lg"
      footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="space-y-5">
        <div className="rounded-lg bg-primary-soft/60 border border-primary/20 p-3 text-sm flex gap-2.5">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" aria-hidden />
          <div className="space-y-1">
            <p><b>Como funciona:</b> uma cópia dos dados selecionados é compactada <b>dentro do próprio link</b> (após o “#”). Essa parte do endereço não é enviada a nenhum servidor — nem ao nosso, pois não usamos servidor.</p>
            <p>Quem abrir verá uma <b>cópia somente leitura</b>, que <b>não se atualiza</b> quando você alterar o original. Para atualizar, gere um novo link.</p>
            <p className="text-subtle">Atenção: qualquer pessoa com o link vê os dados incluídos. Não é possível revogar um link já enviado (não há servidor que controle o acesso); para limitar, compartilhe somente o necessário.</p>
          </div>
        </div>

        <fieldset onChange={reset}>
          <legend className="label">Gráficos incluídos</legend>
          <div className="grid sm:grid-cols-2 gap-1">
            {dashboard.widgets.map((w) => (
              <label key={w.id} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={widgetIds.includes(w.id)} onChange={(e) => setWidgetIds((ids) => (e.target.checked ? [...ids, w.id] : ids.filter((x) => x !== w.id)))} />{w.title}</label>
            ))}
          </div>
        </fieldset>

        <fieldset onChange={reset} className="space-y-2">
          <legend className="label">Dados incluídos</legend>
          <label className="flex items-start gap-2 text-sm"><input type="radio" className="mt-1" checked={columnMode === 'used'} onChange={() => setColumnMode('used')} /><span><b>Apenas colunas usadas nos gráficos</b> (recomendado — mais privado e link menor)</span></label>
          <label className="flex items-start gap-2 text-sm"><input type="radio" className="mt-1" checked={columnMode === 'all'} onChange={() => setColumnMode('all')} /><span><b>Todas as colunas</b> — permite ao destinatário ver os registros completos</span></label>
          {dashboard.filters.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={applyFilters} onChange={(e) => setApplyFilters(e.target.checked)} /><span>Incluir somente os registros que passam pelos filtros atuais do painel</span></label>}
          {involved.map((ds) => {
            const used = usedColumns(dashboard, ds.id);
            const cols = ds.columns.filter((c) => columnMode === 'all' || used.has(c.key));
            return (
              <details key={ds.id} className="rounded-lg border border-border p-2">
                <summary className="text-sm cursor-pointer">Colunas de <b>{ds.name}</b> ({cols.length - cols.filter((c) => hide.includes(`${ds.id}:${c.key}`)).length} incluída[s])</summary>
                <div className="grid sm:grid-cols-2 gap-1 mt-2">
                  {cols.map((c) => <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!hide.includes(`${ds.id}:${c.key}`)} onChange={() => toggleHide(`${ds.id}:${c.key}`)} />{c.name}{used.has(c.key) && <span className="text-[10px] text-subtle">(usada)</span>}</label>)}
                </div>
                {cols.some((c) => used.has(c.key) && hide.includes(`${ds.id}:${c.key}`)) && <p className="text-xs text-warn mt-1">Gráficos que dependem de colunas removidas podem aparecer incompletos.</p>}
              </details>
            );
          })}
        </fieldset>

        <div className="grid sm:grid-cols-2 gap-3" onChange={reset}>
          <label><span className="label">Seu nome <span className="font-normal text-subtle">(opcional)</span></span><input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
          <label><span className="label">Mensagem <span className="font-normal text-subtle">(opcional)</span></span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></label>
        </div>

        <div className="text-sm text-subtle">Resumo: {pkg.dashboard.widgets.length} gráfico(s), {pkg.datasets.length} planilha(s), {rowCount.toLocaleString('pt-BR')} registro(s) · link com {(payload.length / 1024).toFixed(1).replace('.', ',')} KB</div>

        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Entendo que os dados acima ficarão visíveis para qualquer pessoa que receber o link ou o arquivo.</span></label>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Link2 className="h-4 w-4" />} disabled={!consent || !widgetIds.length || tooBigForLink} onClick={generate}>Gerar link</Button>
          <Button icon={<Download className="h-4 w-4" />} disabled={!consent || !widgetIds.length} onClick={file}>Baixar arquivo para importar</Button>
        </div>
        {tooBigForLink && <p className="text-sm text-warn flex gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />Os dados são grandes demais para caber em um link. Use o arquivo, ou reduza colunas/registros com filtros.</p>}
        {longLink && !tooBigForLink && <p className="text-sm text-warn flex gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />Link longo: alguns aplicativos de mensagem podem cortá-lo. Prefira e-mail, ou envie o arquivo.</p>}

        {link && (
          <div className="rounded-lg border border-income/40 bg-income-soft/40 p-3 space-y-2 animate-in">
            <div className="text-sm font-medium flex items-center gap-1.5"><Lock className="h-4 w-4" aria-hidden />Link somente leitura gerado</div>
            <input readOnly className="input text-xs font-mono" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de compartilhamento" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy}>{copied ? 'Copiado' : 'Copiar link'}</Button>
              {typeof navigator.share === 'function' && <Button size="sm" icon={<Share2 className="h-4 w-4" />} onClick={nativeShare}>Enviar…</Button>}
              <Button size="sm" icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(link, '_blank', 'noopener')}>Abrir visualização</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
