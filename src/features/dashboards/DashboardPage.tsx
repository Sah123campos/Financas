import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { db } from '@/db/schema';
import type { ChartType, Column, Dashboard, Dataset, Filter, Row, Widget } from '@/db/types';
import { deleteDashboard, duplicateDashboard, saveDashboard } from '@/db/repo';
import { useAllDatasets } from '@/finance/financeDataset';
import { WidgetView, type Selection } from './WidgetView';
import { ChartEditor } from './ChartEditor';
import { RecordsModal } from './RecordsModal';
import { FilterEditor, describeFilter } from './FilterEditor';
import { DataPanel } from './DataPanel';
import { ShareDialog } from '@/features/share/ShareDialog';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Menu, MenuItem, Spinner, EmptyState, Segmented } from '@/components/ui/misc';
import { confirmDialog } from '@/components/ui/confirm';
import { navigate, query, useRoute } from '@/state/router';
import { toast } from '@/state/toast';
import { makeWidget } from '@/templates/layout';
import { PERIOD_PRESETS, previousPeriod, resolvePeriod } from '@/lib/dates';
import { uid } from '@/lib/id';
import { ArrowLeft, Copy, Database, Eye, Filter as FilterIcon, Maximize2, Minimize2, MoreHorizontal, Pencil, Plus, RotateCcw, Share2, Trash2, X, LayoutDashboard } from 'lucide-react';

const Grid = WidthProvider(Responsive);

export function DashboardPage({ id }: { id: string }) {
  const stored = useLiveQuery(() => db.dashboards.get(id), [id]);
  const all = useAllDatasets();
  const startEditing = query(useRoute()).get('edit') === '1';
  if (stored === undefined || !all) return <Spinner />;
  if (stored === null || !stored) return <EmptyState title="Dashboard não encontrado" action={<Button onClick={() => navigate('/projetos')}>Voltar aos projetos</Button>}>Ele pode ter sido excluído.</EmptyState>;
  return <DashboardBoard key={id} dashboard={stored} datasets={all.datasets} colors={all.colors} initialEditing={startEditing} />;
}

export function DashboardBoard({ dashboard: initial, datasets, colors, readOnly = false, onImport, initialEditing = false }: {
  dashboard: Dashboard; datasets: Dataset[]; colors?: Record<string, string>; readOnly?: boolean; onImport?: () => void; initialEditing?: boolean;
}) {
  const [d, setD] = useState<Dashboard>(initial);
  const [editing, setEditing] = useState(initialEditing && !readOnly);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [editor, setEditor] = useState<Widget | null>(null);
  const [records, setRecords] = useState<{ title: string; rows: Row[]; ds: Dataset } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<string>('');
  const [dataOpen, setDataOpen] = useState(() => { try { return !readOnly && localStorage.getItem('pf.dataPanelOpen') === '1'; } catch { return false; } });
  const [bp, setBp] = useState('lg');
  const toggleData = (open: boolean) => { setDataOpen(open); try { localStorage.setItem('pf.dataPanelOpen', open ? '1' : '0'); } catch { /* ignora */ } };
  const boxRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number>();

  // sincroniza alterações vindas do banco (ex.: outra aba), exceto durante a edição
  useEffect(() => { if (!editing) setD(initial); }, [initial, editing]);

  const persist = useCallback((next: Dashboard, immediate = false) => {
    setD(next);
    if (readOnly) return;
    window.clearTimeout(saveTimer.current);
    const run = () => saveDashboard(next).catch((e) => toast(e.message, 'error'));
    if (immediate) run(); else saveTimer.current = window.setTimeout(run, 500);
  }, [readOnly]);

  const dsMap = useMemo(() => new Map(datasets.map((x) => [x.id, x])), [datasets]);
  const usedDatasets = useMemo(() => [...new Set(d.widgets.map((w) => w.datasetId))].map((i) => dsMap.get(i)).filter(Boolean) as Dataset[], [d.widgets, dsMap]);
  const unionCols = useMemo(() => { const m = new Map<string, Column>(); usedDatasets.forEach((x) => x.columns.forEach((c) => !m.has(c.key) && m.set(c.key, c))); return [...m.values()]; }, [usedDatasets]);
  const unionRows = useMemo(() => usedDatasets.flatMap((x) => x.rows), [usedDatasets]);
  const dateCols = unionCols.filter((c) => c.type === 'date');
  const periodFilter = d.filters.find((f) => f.op === 'between' && dateCols.some((c) => c.key === f.col));
  const periodCol = periodFilter?.col ?? dateCols[0]?.key;

  const setPeriod = (preset: string) => {
    setPeriodPreset(preset);
    const others = d.filters.filter((f) => f !== periodFilter);
    if (!preset || !periodCol) return persist({ ...d, filters: others }, true);
    if (preset === 'custom') return setFiltersOpen(true);
    const p = resolvePeriod(preset);
    persist({ ...d, filters: [...others, { col: periodCol, op: 'between', value: [p.start, p.end] }] }, true);
  };
  const prevPeriodFilters = useMemo<Filter[] | null>(() => {
    if (!periodFilter || !Array.isArray(periodFilter.value) || !periodFilter.value[0] || !periodFilter.value[1]) return null;
    const prev = previousPeriod({ start: String(periodFilter.value[0]), end: String(periodFilter.value[1]), label: '' });
    return [...d.filters.filter((f) => f !== periodFilter), { col: periodFilter.col, op: 'between', value: [prev.start, prev.end] }];
  }, [periodFilter, d.filters]);

  const externalFor = useCallback((wid: string) => [...d.filters, ...selections.filter((s) => s.widgetId !== wid).flatMap((s) => s.filters)], [d.filters, selections]);
  const select = useCallback((wid: string, s: Selection | null) => setSelections((cur) => [...cur.filter((x) => x.widgetId !== wid), ...(s ? [s] : [])]), []);

  // ----- layout -----
  const layouts: Layouts = useMemo(() => {
    const lg = d.widgets.map((w) => ({ i: w.id, ...w.layout, minW: 2, minH: 3 }));
    const sorted = [...d.widgets].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
    let y = 0;
    const sm = sorted.map((w) => { const h = w.type === 'kpi' ? 3 : Math.max(6, w.layout.h); const it = { i: w.id, x: 0, y, w: 1, h }; y += h; return it; });
    // tablet: duas colunas por linha (6 de 6)
    const md: Layout[] = []; const colY = [0, 0];
    sorted.forEach((w) => { const full = w.layout.w > 6; const ww = full ? 6 : 3; const col = full ? 0 : colY[0] <= colY[1] ? 0 : 1; const yy = full ? Math.max(...colY) : colY[col]; md.push({ i: w.id, x: col * 3, y: yy, w: ww, h: w.layout.h }); if (full) { colY[0] = colY[1] = yy + w.layout.h; } else colY[col] = yy + w.layout.h; });
    return { lg, md, sm };
  }, [d.widgets]);
  const onLayoutChange = (cur: Layout[], all: Layouts) => {
    if (!editing || !all.lg) return;
    const lg = all.lg;
    let changed = false;
    const widgets = d.widgets.map((w) => { const l = lg.find((x) => x.i === w.id); if (!l) return w; if (l.x !== w.layout.x || l.y !== w.layout.y || l.w !== w.layout.w || l.h !== w.layout.h) changed = true; return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }; });
    void cur;
    if (changed) persist({ ...d, widgets });
  };
  // Redimensionar pelo canto funciona também no modo apresentação.
  // No computador salva a posição de todos; em telas menores, só a nova altura do gráfico.
  const onResizeStop = (cur: Layout[], _old: Layout, item: Layout) => {
    if (readOnly) return;
    if (bp === 'lg') {
      persist({ ...d, widgets: d.widgets.map((w) => { const l = cur.find((x) => x.i === w.id); return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w; }) }, true);
    } else {
      persist({ ...d, widgets: d.widgets.map((w) => (w.id === item.i && !(bp === 'sm' && w.type === 'kpi') ? { ...w, layout: { ...w.layout, h: item.h } } : w)) }, true);
    }
  };

  // ----- widgets -----
  const newWidget = () => {
    const ds = usedDatasets[0] ?? datasets[1] ?? datasets[0];
    setEditor(makeWidget(d.widgets, 'bar', '', ds?.id ?? '', {}));
  };
  const saveWidget = (w: Widget) => {
    const exists = d.widgets.some((x) => x.id === w.id);
    persist({ ...d, widgets: exists ? d.widgets.map((x) => (x.id === w.id ? w : x)) : [...d.widgets, w] }, true);
    setEditor(null);
    toast(exists ? 'Gráfico atualizado.' : 'Gráfico adicionado ao painel.');
  };
  const removeWidget = async (w: Widget) => {
    const before = d;
    persist({ ...d, widgets: d.widgets.filter((x) => x.id !== w.id) }, true);
    setSelections((s) => s.filter((x) => x.widgetId !== w.id));
    toast(`"${w.title}" excluído.`, 'info', { label: 'Desfazer', run: () => persist(before, true) });
  };
  const duplicateWidget = (w: Widget) => {
    const copy = makeWidget(d.widgets, w.type, w.title + ' (cópia)', w.datasetId, w.config, [w.layout.w, w.layout.h], w.subtitle);
    persist({ ...d, widgets: [...d.widgets, { ...copy, id: uid('w') }] }, true);
  };
  const changeType = (w: Widget, t: ChartType) => persist({ ...d, widgets: d.widgets.map((x) => (x.id === w.id ? { ...x, type: t } : x)) }, true);

  // ----- tela cheia -----
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (boxRef.current?.requestFullscreen) await boxRef.current.requestFullscreen();
      else setFullscreen((f) => !f); // iOS Safari: modo apresentação dentro da página
    } catch { setFullscreen((f) => !f); }
  };

  const remove = async () => {
    if (await confirmDialog({ title: 'Excluir dashboard?', message: `"${d.name}" e seus gráficos serão excluídos. As planilhas de origem não são afetadas.`, danger: true, confirmLabel: 'Excluir' })) {
      await deleteDashboard(d.id); toast('Dashboard excluído.'); navigate('/projetos');
    }
  };

  const activeFilterCount = d.filters.length + selections.length;

  const showData = dataOpen && !readOnly && !fullscreen;
  return (
    <div className={showData ? 'lg:flex lg:items-start lg:gap-1' : ''}>
    <div ref={boxRef} className={`${fullscreen ? 'fixed inset-0 z-40 bg-bg overflow-y-auto p-3 sm:p-5' : 'flex-1 min-w-0'}`}>
      {/* Barra superior */}
      <div className="flex flex-wrap items-start gap-2 mb-3">
        {!readOnly && !fullscreen && <Button size="icon" variant="ghost" aria-label="Voltar aos projetos" onClick={() => navigate('/projetos')}><ArrowLeft className="h-5 w-5" /></Button>}
        <div className="flex-1 min-w-[180px]">
          {editing ? (
            <>
              <input className="input h-9 font-semibold text-lg" value={d.name} onChange={(e) => persist({ ...d, name: e.target.value })} aria-label="Nome do dashboard" />
              <input className="input h-8 mt-1 text-sm" value={d.description ?? ''} placeholder="Descrição (opcional)" onChange={(e) => persist({ ...d, description: e.target.value })} aria-label="Descrição" />
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">{d.name}</h1>
              {d.description && <p className="text-sm text-subtle">{d.description}</p>}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!readOnly && (
            <Segmented label="Modo" value={editing ? 'edit' : 'view'} onChange={(v) => setEditing(v === 'edit')}
              options={[{ value: 'view', label: <><Eye className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Apresentação</span></> }, { value: 'edit', label: <><Pencil className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Edição</span></> }]} />
          )}
          {editing && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={newWidget}>Gráfico</Button>}
          {!readOnly && <Button icon={<Database className="h-4 w-4" />} aria-pressed={dataOpen} variant={dataOpen ? 'primary' : 'secondary'} onClick={() => toggleData(!dataOpen)} title="Ver e atualizar os dados dos gráficos"><span className="hidden sm:inline">Dados</span></Button>}
          {!readOnly && <Button icon={<Share2 className="h-4 w-4" />} onClick={() => setShareOpen(true)}><span className="hidden sm:inline">Compartilhar</span></Button>}
          {readOnly && onImport && <Button variant="primary" icon={<Copy className="h-4 w-4" />} onClick={onImport}>Importar uma cópia</Button>}
          <Button size="icon" aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
          {!readOnly && (
            <Menu label="Mais ações" triggerClass="h-10 w-10 border border-border bg-surface" trigger={<MoreHorizontal className="h-4 w-4" />}>
              <MenuItem icon={<Copy className="h-4 w-4" />} onClick={async () => { const nid = await duplicateDashboard(d.id); if (nid) { toast('Cópia criada.'); navigate(`/dashboards/${nid}`); } }}>Duplicar dashboard</MenuItem>
              <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={remove}>Excluir dashboard</MenuItem>
            </Menu>
          )}
        </div>
      </div>

      {/* Filtros do painel */}
      {d.widgets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {dateCols.length > 0 && (
            <div className="flex items-center gap-1.5">
              {dateCols.length > 1 && (
                <select className="input h-8 w-auto text-sm" aria-label="Coluna de data do período" value={periodCol} onChange={(e) => { const f = periodFilter ? { ...periodFilter, col: e.target.value } : null; persist({ ...d, filters: [...d.filters.filter((x) => x !== periodFilter), ...(f ? [f] : [])] }, true); }}>
                  {dateCols.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
              )}
              <select className="input h-8 w-auto text-sm" aria-label="Período" value={periodFilter ? periodPreset || 'custom' : ''} onChange={(e) => setPeriod(e.target.value)}>
                <option value="">Todo o período</option>
                {PERIOD_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          )}
          <Button size="sm" icon={<FilterIcon className="h-4 w-4" />} onClick={() => setFiltersOpen(true)}>Filtros{d.filters.length ? ` (${d.filters.length})` : ''}</Button>
          {d.filters.map((f, i) => (
            <span key={'f' + i} className="chip"><span className="truncate max-w-[220px]">{describeFilter(f, unionCols)}</span>
              <button aria-label="Remover filtro" onClick={() => persist({ ...d, filters: d.filters.filter((_, j) => j !== i) }, true)}><X className="h-3 w-3" /></button></span>
          ))}
          {selections.map((s) => (
            <span key={s.widgetId} className="chip bg-primary-soft text-primary border-primary/30"><span className="truncate max-w-[220px]">{s.label}</span>
              <button aria-label="Remover seleção" onClick={() => select(s.widgetId, null)}><X className="h-3 w-3" /></button></span>
          ))}
          {activeFilterCount > 0 && <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { setSelections([]); persist({ ...d, filters: [] }, true); setPeriodPreset(''); }}>Redefinir filtros</Button>}
          {selections.length > 0 && <span className="text-xs text-subtle">Clique novamente no item para desmarcar.</span>}
        </div>
      )}

      {d.widgets.length === 0 ? (
        <EmptyState icon={<LayoutDashboard className="h-6 w-6" />} title="Painel vazio" action={!readOnly && <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(true); newWidget(); }}>Adicionar o primeiro gráfico</Button>}>
          Adicione gráficos, KPIs e tabelas. Depois, arraste e redimensione para montar o layout.
        </EmptyState>
      ) : (
        <Grid className="-mx-2" layouts={layouts} breakpoints={{ lg: 1024, md: 640, sm: 0 }} cols={{ lg: 12, md: 6, sm: 1 }} rowHeight={42} margin={[12, 12]}
          isDraggable={editing} isResizable={!readOnly} resizeHandles={['se']} draggableHandle=".drag-handle" onLayoutChange={onLayoutChange} onResizeStop={onResizeStop} onBreakpointChange={(b) => setBp(b)} compactType="vertical" useCSSTransforms>
          {d.widgets.map((w) => (
            <div key={w.id}>
              <WidgetView widget={w} dataset={dsMap.get(w.datasetId)} externalFilters={externalFor(w.id)} selection={selections.find((s) => s.widgetId === w.id)}
                onSelect={(s) => select(w.id, s)} onRecords={(title, rows, ds) => setRecords({ title, rows, ds })}
                editing={editing} onEdit={() => setEditor(w)} onDuplicate={() => duplicateWidget(w)} onDelete={() => removeWidget(w)} onChangeType={(t) => changeType(w, t)}
                colorOverrides={colors} prevPeriodFilters={w.type === 'kpi' ? prevPeriodFilters : null} />
            </div>
          ))}
        </Grid>
      )}
      {!readOnly && d.widgets.length > 0 && <p className="text-xs text-subtle mt-2">Dica: arraste o canto inferior direito de um gráfico para deixá-lo maior ou menor.{editing ? ' Arraste pelo ícone ⋮⋮ para mover.' : ''} Use “Dados” para atualizar os valores.</p>}

      {editor && <ChartEditor open onClose={() => setEditor(null)} initial={editor} datasets={datasets} onSave={saveWidget} colorOverrides={colors} />}
      {records && <RecordsModal open onClose={() => setRecords(null)} title={records.title} rows={records.rows} columns={records.ds.columns} />}
      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros do painel" description="Aplicados a todos os gráficos cujas planilhas possuem a coluna filtrada. Ficam salvos com o dashboard."
        footer={<Button variant="primary" onClick={() => setFiltersOpen(false)}>Concluir</Button>}>
        <FilterEditor filters={d.filters} onChange={(filters) => persist({ ...d, filters })} columns={unionCols} rows={unionRows} />
      </Modal>
      {shareOpen && <ShareDialog open onClose={() => setShareOpen(false)} dashboard={d} datasets={datasets} />}
    </div>
    {showData && <DataPanel datasets={usedDatasets} onClose={() => toggleData(false)} />}
    </div>
  );
}
