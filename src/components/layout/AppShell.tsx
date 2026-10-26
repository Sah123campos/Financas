import { useEffect, useState, type ReactNode } from 'react';
import { navigate, useRoute } from '@/state/router';
import { useSaveState } from '@/state/saveStatus';
import { isDark, setPrefs, usePrefs } from '@/state/prefs';
import { openTxForm } from '@/features/finance/txFormStore';
import { InstallButton } from '@/components/InstallApp';
import { FolderOpen, Home, Wallet, Table, LayoutDashboard, LayoutTemplate, Share2, Settings, Plus, Moon, Sun, Check, Loader2, AlertCircle, CloudOff, MoreHorizontal, ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';

const NAV = [
  { path: '/', label: 'Visão geral', icon: Home },
  { path: '/projetos', label: 'Meus projetos', curto: 'Projetos', icon: FolderOpen },
  { path: '/financas', label: 'Gestão financeira', icon: Wallet },
  { path: '/planilhas', label: 'Planilhas e tabelas', icon: Table },
  { path: '/dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { path: '/modelos', label: 'Modelos prontos', icon: LayoutTemplate },
  { path: '/compartilhados', label: 'Projetos compartilhados', icon: Share2 },
  { path: '/config', label: 'Configurações', icon: Settings },
];
const nav = (path: string) => NAV.find((n) => n.path === path)!;
// Itens que ficam no "Mais" da barra inferior do celular
const MAIS = NAV.filter((n) => !['/', '/projetos', '/financas'].includes(n.path));
const isActive = (route: string, path: string) => {
  // um dashboard aberto é um projeto: destaca "Meus projetos", não "Dashboards"
  if (route.startsWith('/dashboards/')) return path === '/projetos';
  return path === '/' ? route === '/' || route === '' : route === path || route.startsWith(path + '/') || route.startsWith(path + '?');
};

export function AppShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  usePrefs();
  const [more, setMore] = useState(false);
  const [quick, setQuick] = useState(false);
  const online = useOnline();
  useEffect(() => { setMore(false); setQuick(false); window.scrollTo(0, 0); }, [route.split('?')[0]]);

  const link = (n: (typeof NAV)[number], compact = false) => {
    const active = isActive(route, n.path);
    const I = n.icon;
    return (
      <a key={n.path} href={`#${n.path}`} aria-current={active ? 'page' : undefined}
        className={compact ? `flex flex-col items-center justify-center gap-0.5 flex-1 h-14 text-[11px] ${active ? 'text-primary font-semibold' : 'text-subtle'}`
          : `flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition ${active ? 'bg-primary-soft text-primary' : 'text-subtle hover:bg-muted hover:text-fg'}`}>
        <I className="h-5 w-5 shrink-0" aria-hidden />{compact ? ('curto' in n ? n.curto : n.label.split(' ')[0]) : n.label}
      </a>
    );
  };

  return (
    <div className="min-h-full">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 bg-primary text-primary-fg px-3 py-2 rounded-lg">Pular para o conteúdo</a>
      {/* Barra lateral (desktop) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-border bg-surface z-30" aria-label="Navegação principal">
        <div className="h-16 flex items-center gap-2.5 px-5">
          <Logo /><span className="font-semibold tracking-tight">Painel Finanças</span>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">{NAV.map((n) => link(n))}</nav>
        <div className="p-3 space-y-2">
          <button onClick={() => setQuick(true)} className="w-full h-10 rounded-lg bg-primary text-primary-fg text-sm font-medium inline-flex items-center justify-center gap-2 hover:brightness-110"><Plus className="h-4 w-4" aria-hidden />Novo lançamento</button>
          <p className="text-[11px] text-subtle px-1">Dados salvos neste navegador.</p>
        </div>
      </aside>

      {/* Cabeçalho */}
      <header className="sticky top-0 z-20 h-14 bg-bg/85 backdrop-blur border-b border-border lg:ml-60 flex items-center gap-3 px-4">
        <a href="#/" className="lg:hidden flex items-center gap-2 font-semibold" aria-label="Painel Finanças — início"><Logo /><span className="text-sm">Painel Finanças</span></a>
        <div className="flex-1" />
        {!online && <span className="chip text-warn border-warn/40" title="Sem conexão: tudo continua funcionando localmente; apenas abrir links externos exige internet."><CloudOff className="h-3.5 w-3.5" aria-hidden />Offline</span>}
        <SaveIndicator />
        <InstallButton onHelp={() => { navigate('/config'); setTimeout(() => document.getElementById('instalar')?.scrollIntoView({ behavior: 'smooth' }), 150); }} />
        <button className="h-9 w-9 rounded-lg hover:bg-muted inline-flex items-center justify-center" onClick={() => setPrefs({ theme: isDark() ? 'light' : 'dark' })} aria-label={isDark() ? 'Usar tema claro' : 'Usar tema escuro'} title="Alternar tema">
          {isDark() ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </header>

      <main id="main" tabIndex={-1} className="lg:ml-60 px-4 sm:px-6 py-5 pb-28 lg:pb-10 max-w-[1600px] focus:outline-none">{children}</main>

      {/* Navegação inferior (celular) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-border flex items-stretch safe-bottom" aria-label="Navegação principal">
        {link(nav('/'), true)}{link(nav('/projetos'), true)}
        <div className="flex-1 flex items-center justify-center">
          <button onClick={() => setQuick(true)} className="h-12 w-12 -mt-5 rounded-full bg-primary text-primary-fg shadow-lg inline-flex items-center justify-center active:scale-95" aria-label="Novo lançamento"><Plus className="h-6 w-6" /></button>
        </div>
        {link(nav('/financas'), true)}
        <button onClick={() => setMore(true)} className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-14 text-[11px] ${MAIS.some((n) => isActive(route, n.path)) ? 'text-primary font-semibold' : 'text-subtle'}`} aria-haspopup="dialog"><MoreHorizontal className="h-5 w-5" aria-hidden />Mais</button>
      </nav>

      {more && (
        <Sheet onClose={() => setMore(false)} title="Mais opções">
          <nav className="grid grid-cols-1 gap-1">{MAIS.map((n) => link(n))}</nav>
        </Sheet>
      )}
      {quick && (
        <Sheet onClose={() => setQuick(false)} title="Adicionar">
          <div className="grid grid-cols-2 gap-2">
            <button className="card p-4 flex flex-col items-center gap-2 font-medium" onClick={() => { setQuick(false); openTxForm('expense'); }}><ArrowDownCircle className="h-7 w-7 text-expense" aria-hidden />Despesa</button>
            <button className="card p-4 flex flex-col items-center gap-2 font-medium" onClick={() => { setQuick(false); openTxForm('income'); }}><ArrowUpCircle className="h-7 w-7 text-income" aria-hidden />Receita</button>
            <button className="card p-3 text-sm" onClick={() => navigate('/projetos')}>Importar planilha</button>
            <button className="card p-3 text-sm" onClick={() => navigate('/dashboards')}>Novo dashboard</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ onClose, title, children }: { onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end lg:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full lg:max-w-sm bg-surface rounded-t-2xl lg:rounded-2xl p-4 pb-6 safe-bottom animate-in">
        <div className="flex items-center mb-3"><h2 className="font-semibold flex-1">{title}</h2><button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-muted inline-flex items-center justify-center" aria-label="Fechar" autoFocus><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function SaveIndicator() {
  const s = useSaveState();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (s.status === 'idle') return;
    setVisible(true);
    if (s.status === 'saved') { const t = setTimeout(() => setVisible(false), 2500); return () => clearTimeout(t); }
  }, [s]);
  if (!visible || s.status === 'idle') return null;
  return (
    <span className={`text-xs inline-flex items-center gap-1.5 ${s.status === 'error' ? 'text-expense' : 'text-subtle'}`} role="status" aria-live="polite" title={s.message}>
      {s.status === 'saving' && <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Salvando…</>}
      {s.status === 'saved' && <><Check className="h-3.5 w-3.5 text-income" aria-hidden />Salvo</>}
      {s.status === 'error' && <><AlertCircle className="h-3.5 w-3.5" aria-hidden /><span className="max-w-[180px] truncate">Erro ao salvar</span></>}
    </span>
  );
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b); }; }, []);
  return on;
}

export function Logo() {
  return <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden><rect width="64" height="64" rx="14" fill="#1e3a8a" /><rect x="14" y="34" width="8" height="16" rx="2" fill="#86efac" /><rect x="28" y="24" width="8" height="26" rx="2" fill="#bfdbfe" /><rect x="42" y="14" width="8" height="36" rx="2" fill="#fff" /></svg>;
}
