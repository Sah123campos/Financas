import { useState } from 'react';
import { Download, Share, PlusSquare, MoreVertical, MonitorDown, CheckCircle2 } from 'lucide-react';
import { promptInstall, useInstall } from '@/state/install';
import { Button } from '@/components/ui/Button';

/** Botão do cabeçalho: aparece só quando dá para instalar (Chrome/Edge/Android) ou no iPhone. */
export function InstallButton({ onHelp }: { onHelp: () => void }) {
  const st = useInstall();
  if (st === 'installed' || st === 'manual') return null;
  return (
    <button onClick={() => (st === 'available' ? promptInstall() : onHelp())}
      className="h-9 px-3 rounded-lg bg-primary-soft text-primary text-sm font-medium inline-flex items-center gap-1.5 hover:brightness-95"
      title="Instalar como aplicativo">
      <Download className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Instalar app</span><span className="sm:hidden">Instalar</span>
    </button>
  );
}

/** Seção de configurações com o botão e o passo a passo por aparelho. */
export function InstallSection() {
  const st = useInstall();
  const [busy, setBusy] = useState(false);
  return (
    <section id="instalar" className="card p-4 space-y-3 scroll-mt-20">
      <h2 className="font-semibold flex items-center gap-2"><MonitorDown className="h-4 w-4" aria-hidden />Instalar como aplicativo</h2>
      {st === 'installed' ? (
        <p className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-income" aria-hidden />O app já está instalado neste aparelho.</p>
      ) : (
        <>
          <p className="text-sm text-subtle">Instale para abrir o Painel Finanças pelo ícone na tela inicial ou na área de trabalho, em janela própria e funcionando sem internet.</p>
          {st === 'available' && <Button variant="primary" icon={<Download className="h-4 w-4" />} loading={busy} onClick={async () => { setBusy(true); try { await promptInstall(); } finally { setBusy(false); } }}>Instalar agora</Button>}
        </>
      )}
      <InstallSteps />
    </section>
  );
}

export function InstallSteps() {
  return (
    <div className="grid sm:grid-cols-3 gap-3 text-sm">
      <div className="rounded-lg border border-border p-3 space-y-1">
        <h3 className="font-medium">iPhone / iPad (Safari)</h3>
        <ol className="list-decimal pl-4 text-subtle space-y-0.5">
          <li>Abra o site no <b>Safari</b>.</li>
          <li>Toque em <Share className="inline h-3.5 w-3.5" aria-label="Compartilhar" /> <b>Compartilhar</b>.</li>
          <li>Escolha <PlusSquare className="inline h-3.5 w-3.5" aria-hidden /> <b>Adicionar à Tela de Início</b>.</li>
        </ol>
      </div>
      <div className="rounded-lg border border-border p-3 space-y-1">
        <h3 className="font-medium">Android (Chrome)</h3>
        <ol className="list-decimal pl-4 text-subtle space-y-0.5">
          <li>Toque em <MoreVertical className="inline h-3.5 w-3.5" aria-label="menu" /> no canto.</li>
          <li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
        </ol>
      </div>
      <div className="rounded-lg border border-border p-3 space-y-1">
        <h3 className="font-medium">Computador (Chrome / Edge)</h3>
        <ol className="list-decimal pl-4 text-subtle space-y-0.5">
          <li>Clique no ícone <MonitorDown className="inline h-3.5 w-3.5" aria-hidden /> na barra de endereço, ou no menu → <b>Instalar Painel Finanças</b>.</li>
          <li>O atalho aparece na área de trabalho e no menu Iniciar.</li>
        </ol>
      </div>
    </div>
  );
}
