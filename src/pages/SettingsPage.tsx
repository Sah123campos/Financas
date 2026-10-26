import { useEffect, useRef, useState } from 'react';
import { setPrefs, usePrefs } from '@/state/prefs';
import { clearFormatCache, fmtMoney } from '@/lib/format';
import { download, exportBackup, exportTransactionsCSV, restoreBackup, storageEstimate, wipeAll } from '@/db/backup';
import { db } from '@/db/schema';
import { tracked } from '@/state/saveStatus';
import { PageHeader, Segmented } from '@/components/ui/misc';
import { Button } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/confirm';
import { toast } from '@/state/toast';
import { AlertTriangle, Database, Download, HardDrive, Moon, Monitor, Sun, Upload, Trash2 } from 'lucide-react';

const CURRENCIES = [['BRL', 'Real (R$)'], ['USD', 'Dólar americano (US$)'], ['EUR', 'Euro (€)'], ['GBP', 'Libra (£)'], ['ARS', 'Peso argentino'], ['CLP', 'Peso chileno'], ['MXN', 'Peso mexicano'], ['JPY', 'Iene']];
const LOCALES = [['pt-BR', 'Português (Brasil)'], ['pt-PT', 'Português (Portugal)'], ['en-US', 'Inglês (EUA)'], ['es-ES', 'Espanhol'], ['de-DE', 'Alemão'], ['fr-FR', 'Francês']];

export function SettingsPage() {
  const prefs = usePrefs();
  const [est, setEst] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const refresh = async () => {
    setEst(await storageEstimate());
    setCounts({ 'Lançamentos': await db.transactions.count(), 'Planilhas': await db.datasets.count(), 'Dashboards': await db.dashboards.count(), 'Recorrências': await db.recurring.count(), 'Metas': await db.goals.count(), 'Orçamentos': await db.budgets.count() });
  };
  useEffect(() => { refresh(); }, []);

  const restore = async (f?: File) => {
    if (!f) return;
    if (mode === 'replace' && !(await confirmDialog({ title: 'Substituir todos os dados?', message: 'Todos os dados atuais deste navegador serão apagados e substituídos pelo backup.', danger: true, confirmLabel: 'Substituir' }))) return;
    try {
      const r = await restoreBackup(await f.text(), mode);
      const rej = Object.values(r.rejected).reduce((a, b) => a + b, 0);
      toast(`Backup restaurado: ${Object.values(r.counts).reduce((a, b) => a + b, 0)} registro(s).${rej ? ` ${rej} registro(s) inválidos foram ignorados.` : ''}`, rej ? 'warning' : 'success');
      refresh();
    } catch (e) { toast((e as Error).message, 'error'); } finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const wipe = async () => {
    if (await confirmDialog({ title: 'Excluir todos os dados?', message: 'Lançamentos, planilhas, dashboards, metas e orçamentos deste navegador serão apagados permanentemente. Recomendamos exportar um backup antes.', danger: true, confirmLabel: 'Excluir tudo', typeToConfirm: 'EXCLUIR' })) {
      await wipeAll(); toast('Todos os dados foram excluídos.'); refresh();
    }
  };
  const wipeFinance = async () => {
    if (await confirmDialog({ title: 'Apagar lançamentos financeiros?', message: 'Remove lançamentos, recorrências, orçamentos e metas. Planilhas e dashboards são mantidos.', danger: true, confirmLabel: 'Apagar' })) {
      await tracked(() => db.transaction('rw', db.transactions, db.recurring, db.budgets, db.goals, async () => { await db.transactions.clear(); await db.recurring.clear(); await db.budgets.clear(); await db.goals.clear(); }));
      toast('Dados financeiros apagados.'); refresh();
    }
  };
  const persist = async () => {
    const ok = await navigator.storage?.persist?.();
    toast(ok ? 'O navegador concedeu armazenamento persistente.' : 'O navegador não concedeu armazenamento persistente (ele decide com base no uso do site).', ok ? 'success' : 'info');
    refresh();
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader title="Configurações" />
      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Aparência e acessibilidade</h2>
        <div className="flex flex-wrap items-center gap-3"><span className="text-sm w-32">Tema</span>
          <Segmented label="Tema" value={prefs.theme} onChange={(theme) => setPrefs({ theme })} options={[{ value: 'light', label: <><Sun className="h-4 w-4" aria-hidden />Claro</> }, { value: 'dark', label: <><Moon className="h-4 w-4" aria-hidden />Escuro</> }, { value: 'system', label: <><Monitor className="h-4 w-4" aria-hidden />Sistema</> }]} />
        </div>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => setPrefs({ reducedMotion: e.target.checked })} />Reduzir animações e movimentos</label>
        <label className="flex flex-wrap items-center gap-3 text-sm"><span className="w-32">Seu nome</span><input className="input max-w-xs" value={prefs.userName} onChange={(e) => setPrefs({ userName: e.target.value })} placeholder="Opcional" /></label>
      </section>
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Moeda e região</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm"><span className="label">Moeda</span><select className="input" value={prefs.currency} onChange={(e) => { clearFormatCache(); setPrefs({ currency: e.target.value }); }}>{CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-sm"><span className="label">Formato regional</span><select className="input" value={prefs.locale} onChange={(e) => { clearFormatCache(); setPrefs({ locale: e.target.value }); }}>{LOCALES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <p className="text-sm text-subtle">Exemplo: {fmtMoney(1234.56)} · {new Date().toLocaleDateString(prefs.locale)}. Alterar a moeda muda apenas a exibição — os valores não são convertidos.</p>
      </section>
      <section className="card p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Database className="h-4 w-4" aria-hidden />Seus dados</h2>
        <div className="rounded-lg bg-warn-soft text-sm p-3 flex gap-2"><AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" aria-hidden /><span>Os dados ficam armazenados <b>somente neste navegador</b> (IndexedDB). Eles podem ser perdidos se você limpar os dados de navegação, usar o modo privado ou trocar de dispositivo. Exporte backups regularmente.</span></div>
        <div className="flex flex-wrap gap-2 text-xs">{Object.entries(counts).map(([k, v]) => <span key={k} className="chip">{k}: {v}</span>)}</div>
        {est && <p className="text-sm text-subtle flex items-center gap-2"><HardDrive className="h-4 w-4" aria-hidden />Uso: {(est.usage / 1048576).toFixed(1)} MB de ~{(est.quota / 1048576 / 1024).toFixed(1)} GB disponíveis · {est.persisted ? '✓ armazenamento persistente concedido' : 'armazenamento não persistente'}{!est.persisted && <button className="underline" onClick={persist}>Solicitar</button>}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={async () => { download(await exportBackup(), `backup-painel-financas-${new Date().toISOString().slice(0, 10)}.json`); toast('Backup exportado.'); }}>Exportar backup completo (JSON)</Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={async () => download(await exportTransactionsCSV(), 'lancamentos.csv')}>Exportar lançamentos (CSV)</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
          <Button icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Restaurar backup</Button>
          <Segmented size="sm" label="Modo de restauração" value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Mesclar com os atuais' }, { value: 'replace', label: 'Substituir tudo' }]} />
        </div>
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button variant="ghost" className="text-expense" icon={<Trash2 className="h-4 w-4" />} onClick={wipeFinance}>Apagar dados financeiros</Button>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={wipe}>Excluir todos os dados</Button>
        </div>
      </section>
      <section className="card p-4 text-sm text-subtle space-y-1">
        <h2 className="font-semibold text-fg">Sobre</h2>
        <p>Painel Finanças funciona offline depois do primeiro acesso e pode ser instalado como aplicativo (menu do navegador → “Instalar” ou “Adicionar à tela inicial”).</p>
        <p>Nenhum dado é enviado a servidores. O compartilhamento usa links que carregam uma cópia dos dados no próprio endereço, ou arquivos JSON.</p>
      </section>
    </div>
  );
}
