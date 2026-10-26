// Painel "Dados" ao lado do dashboard: edita as planilhas usadas pelos gráficos sem sair da tela.
// No computador fica à direita (arraste a borda esquerda para mudar a largura);
// no celular/tablet aparece embaixo (arraste a barra de cima para mudar a altura).
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import type { Dataset } from '@/db/types';
import { FINANCE_DATASET_ID } from '@/finance/financeDataset';
import { DatasetEditor } from '@/features/datasets/DatasetEditor';
import { TransactionsList } from '@/features/finance/TransactionsList';
import { openTxForm } from '@/features/finance/txFormStore';
import { Button } from '@/components/ui/Button';
import { Database, GripVertical, GripHorizontal, Plus, X } from 'lucide-react';

const KEY = 'pf.dataPanel';
interface Saved { width: number; height: number; tab?: string }
function load(): Saved {
  try { return { width: 520, height: 0, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { width: 520, height: 0 }; }
}
function store(s: Saved) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: só nesta sessão */ } }

const MIN_W = 320, MIN_H = 180;
const maxW = () => Math.max(MIN_W, window.innerWidth - 240 - 360); // deixa espaço para a barra lateral e o dashboard
const maxH = () => Math.max(MIN_H, window.innerHeight - 140);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function useIsWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q); const h = () => setWide(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return wide;
}

export function DataPanel({ datasets, onClose }: { datasets: Dataset[]; onClose: () => void }) {
  const wide = useIsWide();
  const [size, setSize] = useState<Saved>(() => { const s = load(); return { ...s, height: s.height || Math.round(window.innerHeight * 0.45) }; });
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const tab = datasets.find((d) => d.id === size.tab)?.id ?? datasets[0]?.id;
  const current = datasets.find((d) => d.id === tab);

  useEffect(() => { store(size); }, [size]);
  // mantém o tamanho dentro da tela ao girar o aparelho / redimensionar a janela
  useEffect(() => {
    const h = () => setSize((s) => ({ ...s, width: clamp(s.width, MIN_W, maxW()), height: clamp(s.height, MIN_H, maxH()) }));
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h);
  }, []);

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };
    setDragging(true);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = start.current; if (!s) return;
    if (wide) setSize((z) => ({ ...z, width: clamp(s.w + (s.x - e.clientX), MIN_W, maxW()) }));
    else setSize((z) => ({ ...z, height: clamp(s.h + (s.y - e.clientY), MIN_H, maxH()) }));
  };
  const onUp = () => { start.current = null; setDragging(false); };
  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 24;
    const grow = wide ? (e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0) : (e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0);
    if (!grow) return;
    e.preventDefault();
    setSize((z) => (wide ? { ...z, width: clamp(z.width + grow * step, MIN_W, maxW()) } : { ...z, height: clamp(z.height + grow * step, MIN_H, maxH()) }));
  };

  const handle = (
    <div role="separator" tabIndex={0} aria-orientation={wide ? 'vertical' : 'horizontal'} aria-label="Arraste para mudar o tamanho do painel de dados"
      aria-valuenow={wide ? size.width : size.height} aria-valuemin={wide ? MIN_W : MIN_H}
      title="Arraste para aumentar ou diminuir"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
      onDoubleClick={() => setSize((z) => (wide ? { ...z, width: z.width > 600 ? 420 : Math.min(maxW(), 800) } : { ...z, height: z.height > window.innerHeight * 0.5 ? Math.round(window.innerHeight * 0.35) : Math.round(window.innerHeight * 0.7) }))}
      className={`group touch-none select-none flex items-center justify-center shrink-0 ${wide ? 'w-3 cursor-col-resize self-stretch' : 'h-6 cursor-row-resize w-full'}`}>
      <span className={`rounded-full flex items-center justify-center transition ${dragging ? 'bg-primary text-primary-fg' : 'bg-muted text-subtle group-hover:bg-primary-soft group-hover:text-primary'} ${wide ? 'h-14 w-2.5' : 'w-14 h-2.5'}`}>
        {wide ? <GripVertical className="h-3.5 w-3.5" aria-hidden /> : <GripHorizontal className="h-3.5 w-3.5" aria-hidden />}
      </span>
    </div>
  );

  const body = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 px-3 pt-2 pb-2 border-b border-border">
        <Database className="h-4 w-4 text-primary shrink-0" aria-hidden />
        <h2 className="font-semibold text-sm">Dados do dashboard</h2>
        <span className="text-xs text-subtle hidden sm:inline truncate">Alterações atualizam os gráficos na hora.</span>
        <div className="flex-1" />
        <Button size="iconSm" variant="ghost" aria-label="Fechar painel de dados" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      {datasets.length > 1 && (
        <div className="flex gap-1 px-3 pt-2 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Planilhas usadas">
          {datasets.map((d) => (
            <button key={d.id} role="tab" aria-selected={d.id === tab} onClick={() => setSize((z) => ({ ...z, tab: d.id }))}
              className={`chip shrink-0 ${d.id === tab ? 'bg-primary-soft text-primary border-primary/30' : 'hover:bg-muted'}`}>{d.name}</button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin p-3">
        {!current ? (
          <p className="text-sm text-subtle">Este dashboard ainda não tem gráficos. Adicione um gráfico para editar os dados dele aqui.</p>
        ) : current.id === FINANCE_DATASET_ID ? (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
              <span className="text-subtle flex-1 min-w-[180px]">Estes dados vêm dos seus lançamentos. Adicione, edite ou exclua e os gráficos mudam na hora.</span>
              <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openTxForm('expense')}>Lançamento</Button>
            </div>
            <TransactionsList />
          </div>
        ) : (
          <DatasetEditor key={current.id} dataset={current} embedded />
        )}
      </div>
    </div>
  );

  if (wide) {
    return (
      <aside aria-label="Dados do dashboard" className="sticky top-[72px] self-start flex h-[calc(100dvh-88px)] shrink-0" style={{ width: size.width }}>
        {handle}
        <div className="card flex-1 min-w-0 overflow-hidden">{body}</div>
      </aside>
    );
  }
  return (
    <>
      {/* espaço para o conteúdo do dashboard não ficar escondido atrás do painel */}
      <div aria-hidden style={{ height: size.height }} />
      <aside aria-label="Dados do dashboard" className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 bg-surface border-t border-border rounded-t-2xl shadow-[0_-8px_24px_rgb(15_23_42/0.12)] flex flex-col" style={{ height: size.height }}>
        {handle}
        <div className="flex-1 min-h-0">{body}</div>
      </aside>
    </>
  );
}
