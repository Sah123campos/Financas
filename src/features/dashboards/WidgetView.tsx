import { memo, useMemo, useRef, useState } from 'react';
import type { ChartConfig, ChartType, Dataset, Filter, Row, Widget } from '@/db/types';
import { applyFilters, distinctValues, grainRange, NEXT_GRAIN, GRAIN_LABELS } from '@/data/engine';
import { buildChart, makeFormatter, pivotFor, type ClickInfo } from '@/charts/buildChart';
import { CHARTS, chartMeta, validateChart } from '@/charts/chartTypes';
import { EChart, type ChartInstance } from '@/charts/EChart';
import { KpiVisual, PivotTable, ProgressVisual, SummaryTable } from '@/charts/Visuals';
import { makeColorFor } from '@/charts/palette';
import { isDark, prefersReducedMotion, usePrefs } from '@/state/prefs';
import { Menu, MenuItem } from '@/components/ui/misc';
import { AlertTriangle, ArrowDownToLine, ChevronLeft, Copy, Eye, GripVertical, ImageDown, ListTree, MoreVertical, Pencil, RotateCcw, Shuffle, Table2, Trash2, X, ZoomIn } from 'lucide-react';
import { aggregate } from '@/data/engine';

export interface Selection { widgetId: string; filters: Filter[]; label: string; key: string }
interface Drill { label: string; filters: Filter[]; patch: Partial<ChartConfig> }

export interface WidgetViewProps {
  widget: Widget;
  dataset?: Dataset;
  externalFilters: Filter[]; // filtros do painel + seleções de outros widgets
  selection?: Selection;
  onSelect: (s: Selection | null) => void;
  onRecords: (title: string, rows: Row[], ds: Dataset) => void;
  editing?: boolean;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onChangeType?: (t: ChartType) => void;
  colorOverrides?: Record<string, string>;
  prevPeriodFilters?: Filter[] | null; // para comparação nos KPIs
}

export const WidgetView = memo(function WidgetView(props: WidgetViewProps) {
  const { widget, dataset, externalFilters, selection, onSelect, editing } = props;
  usePrefs(); // re-renderiza ao trocar tema/moeda
  const [drill, setDrill] = useState<Drill[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [tempType, setTempType] = useState<ChartType | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const type = tempType ?? widget.type;
  const meta = chartMeta(type);
  const dark = isDark();

  const cfg = useMemo<ChartConfig>(() => drill.reduce((c, d) => ({ ...c, ...d.patch }), widget.config), [widget.config, drill]);
  const drillFilters = useMemo(() => drill.flatMap((d) => d.filters), [drill]);

  const computed = useMemo(() => {
    if (!dataset) return null;
    const cols = dataset.columns;
    const baseRows = applyFilters(dataset.rows, [...cfg.filters, ...drillFilters], cols);
    const rows = applyFilters(baseRows, externalFilters, cols);
    // cores estáveis: chaves vindas dos dados sem filtros cruzados
    const colorCol = cols.find((c) => c.key === (cfg.series || cfg.category));
    const stable = colorCol ? distinctValues(dataset.rows, colorCol, colorCol.type === 'date' ? (cfg.series ? 'month' : cfg.grain) : 'none').map((d) => d.key) : [];
    const colorFor = makeColorFor(stable, dark, { ...props.colorOverrides, ...(cfg.colors ? Object.fromEntries(cfg.values.map((_v, i) => [`__s${i}`, cfg.colors![i]]).filter(([, c]) => c)) : {}) });
    const p = meta.needsCategory || cfg.category ? pivotFor(type, cfg, rows, cols) : undefined;
    const hasNeg = p ? p.series.some((s) => s.data.some((v) => v < 0)) : false;
    const validation = validateChart(type, cfg, cols, p?.keys.length, hasNeg);
    let built = null;
    if (validation.level !== 'error' && meta.echarts) {
      try {
        built = buildChart(type, cfg, rows, cols, { dark, selected: new Set(selection ? [selection.key] : []), colorFor, animation: !prefersReducedMotion(), compact: widget.layout.h <= 4 });
      } catch (e) { console.error(e); }
    }
    const prevRows = props.prevPeriodFilters ? applyFilters(applyFilters(dataset.rows, [...cfg.filters, ...drillFilters], cols), props.prevPeriodFilters, cols) : undefined;
    return { rows, cols, p, validation, built, prevRows };
  }, [dataset, cfg, drillFilters, externalFilters, type, dark, selection, props.colorOverrides, props.prevPeriodFilters, meta, widget.layout.h]);

  if (!dataset) {
    return <Shell {...props} title={widget.title}><div className="h-full flex items-center justify-center text-sm text-subtle text-center p-4">A planilha usada por este gráfico não foi encontrada.</div></Shell>;
  }
  if (!computed) return null;
  const { rows, cols, p, validation, built } = computed;

  const catCol = cols.find((c) => c.key === cfg.category);
  const canDrillDate = catCol?.type === 'date' && !!NEXT_GRAIN[cfg.grain];
  const canDrillCat = !!cfg.drillTo && cfg.drillTo !== cfg.category && catCol?.type !== 'date';
  const mySel = selection;

  const handleClick = (info: ClickInfo) => {
    const r = built?.toFilters(info);
    if (!r) return;
    if (mySel && mySel.key === r.key && mySel.label === r.label) onSelect(null);
    else onSelect({ widgetId: widget.id, ...r });
  };
  const htmlSelect = (i: number, seriesName?: string) => {
    if (!p || !cfg.category) return;
    const key = p.keys[i];
    if (key === 'Outros') return;
    const filters: Filter[] = [{ col: cfg.category, op: 'eq', value: key, grain: catCol?.type === 'date' ? cfg.grain : undefined }];
    let label = `${catCol?.name}: ${p.labels[i]}`;
    const serCol = cols.find((c) => c.key === cfg.series);
    if (seriesName && serCol) { const s = p.series.find((x) => x.name === seriesName); if (s) { filters.push({ col: serCol.key, op: 'eq', value: s.key, grain: serCol.type === 'date' ? 'month' : undefined }); label += ` · ${s.name}`; } }
    if (mySel && mySel.label === label) onSelect(null); else onSelect({ widgetId: widget.id, filters, label, key });
  };

  const drillDown = () => {
    if (!mySel) return;
    const key = mySel.key;
    if (canDrillDate) {
      const range = grainRange(key, cfg.grain);
      const next = NEXT_GRAIN[cfg.grain]!;
      if (range) setDrill((d) => [...d, { label: mySel.label, filters: [{ col: cfg.category!, op: 'between', value: range }], patch: { grain: next } }]);
    } else if (canDrillCat) {
      setDrill((d) => [...d, { label: mySel.label, filters: mySel.filters, patch: { category: cfg.drillTo, drillTo: undefined } }]);
    }
    onSelect(null);
  };
  const selRows = mySel ? applyFilters(rows, mySel.filters, cols) : rows;
  const records = () => props.onRecords(mySel ? `${widget.title} · ${mySel.label}` : widget.title, selRows, dataset);
  const exportPng = () => {
    const c = chartRef.current; if (!c) return;
    const url = c.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: dark ? '#1a1a1d' : '#ffffff' });
    const a = document.createElement('a'); a.href = url; a.download = `${widget.title || 'grafico'}.png`; a.click();
  };
  const alternatives = CHARTS.filter((c) => c.type !== type && c.needsCategory === meta.needsCategory && validateChart(c.type, cfg, cols, p?.keys.length).level !== 'error');
  const fmt = makeFormatter(cfg, cols);
  const total = cfg.showTotal && cfg.values[0] && !['table', 'pivot', 'kpi'].includes(type) ? aggregate(rows, cfg.values[0]) : null;

  const menu = (
    <Menu label="Opções do gráfico" trigger={<MoreVertical className="h-4 w-4" aria-hidden />}>
      {meta.echarts && <MenuItem icon={<Table2 className="h-4 w-4" />} onClick={() => setShowTable((s) => !s)}>{showTable ? 'Ver gráfico' : 'Ver dados (tabela)'}</MenuItem>}
      <MenuItem icon={<Eye className="h-4 w-4" />} onClick={records}>Ver registros de origem</MenuItem>
      {meta.echarts && built && <MenuItem icon={<ImageDown className="h-4 w-4" />} onClick={exportPng} disabled={showTable}>Exportar imagem (PNG)</MenuItem>}
      {alternatives.length > 0 && (
        <div className="border-t border-border mt-1 pt-1">
          <div className="px-2.5 py-1 text-xs text-subtle flex items-center gap-1"><Shuffle className="h-3 w-3" aria-hidden />Alternar visualização</div>
          <div className="max-h-48 overflow-y-auto">
            {tempType && <MenuItem onClick={() => setTempType(null)}>↺ Original ({chartMeta(widget.type).label})</MenuItem>}
            {alternatives.slice(0, 10).map((a) => <MenuItem key={a.type} onClick={() => (editing && props.onChangeType ? props.onChangeType(a.type) : setTempType(a.type))}>{a.label}</MenuItem>)}
          </div>
        </div>
      )}
      {editing && (
        <div className="border-t border-border mt-1 pt-1">
          <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => props.onEdit?.()}>Editar</MenuItem>
          <MenuItem icon={<Copy className="h-4 w-4" />} onClick={() => props.onDuplicate?.()}>Duplicar</MenuItem>
          <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => props.onDelete?.()}>Excluir</MenuItem>
        </div>
      )}
    </Menu>
  );

  let body: React.ReactNode;
  if (validation.level === 'error') {
    body = <ChartProblem reason={validation.reason!} suggest={validation.suggest} onSuggest={(t) => (editing && props.onChangeType ? props.onChangeType(t) : setTempType(t))} />;
  } else if (rows.length === 0) {
    body = <div className="h-full flex flex-col items-center justify-center text-sm text-subtle text-center gap-1 p-3"><span>Nenhum registro corresponde aos filtros atuais.</span>{(mySel || externalFilters.length > 0) && <span className="text-xs">Remova filtros para ver os dados.</span>}</div>;
  } else if (type === 'kpi') {
    body = <button className="w-full h-full text-left" onClick={records} title="Ver registros que compõem este indicador"><KpiVisual cfg={cfg} rows={rows} columns={cols} prevRows={computed.prevRows} /></button>;
  } else if (type === 'progress') {
    body = p ? <ProgressVisual cfg={cfg} pivot={p} columns={cols} onSelect={htmlSelect} selected={new Set(mySel ? [mySel.key] : [])} /> : <ProgressSingle cfg={cfg} rows={rows} cols={cols} />;
  } else if (type === 'table' && p) {
    body = <SummaryTable cfg={cfg} pivot={p} columns={cols} onSelect={htmlSelect} selected={new Set(mySel ? [mySel.key] : [])} />;
  } else if (type === 'pivot' && p) {
    body = <PivotTable cfg={cfg} pivot={p} columns={cols} rows={rows} onSelect={htmlSelect} />;
  } else if (built) {
    body = showTable ? <DataTableView table={built.table} /> : <EChart option={built.option} onClick={handleClick} ariaLabel={`${widget.title}. ${built.summary}`} onReady={(c) => (chartRef.current = c)} />;
  } else body = <div className="text-sm text-expense p-3">Não foi possível desenhar este gráfico.</div>;

  return (
    <Shell {...props} title={widget.title} menu={menu}>
      {(drill.length > 0 || validation.level === 'warn' || tempType) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-xs">
          {drill.length > 0 && (
            <>
              <button className="chip hover:bg-muted" onClick={() => setDrill((d) => d.slice(0, -1))}><ChevronLeft className="h-3 w-3" aria-hidden />Voltar</button>
              <span className="text-subtle truncate">Detalhando: {drill.map((d) => d.label).join(' › ')}{catCol?.type === 'date' ? ` · por ${GRAIN_LABELS[cfg.grain].toLowerCase()}` : ''}</span>
              <button className="chip hover:bg-muted" onClick={() => setDrill([])}><RotateCcw className="h-3 w-3" aria-hidden />Topo</button>
            </>
          )}
          {tempType && <span className="chip">Visualização temporária: {meta.label} <button aria-label="Voltar ao tipo original" onClick={() => setTempType(null)}><X className="h-3 w-3" /></button></span>}
          {validation.level === 'warn' && (
            <span className="inline-flex items-start gap-1 text-warn" title={validation.reason}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden /><span className="line-clamp-2">{validation.reason}</span>
              {validation.suggest && <button className="underline font-medium shrink-0" onClick={() => (editing && props.onChangeType ? props.onChangeType(validation.suggest!) : setTempType(validation.suggest!))}>Usar {chartMeta(validation.suggest).label.toLowerCase()}</button>}
            </span>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">{body}</div>
      {(mySel || total != null) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 mt-1 border-t border-border/70 text-xs">
          {total != null && <span className="text-subtle mr-auto">Total: <b className="text-fg tabular">{fmt(total)}</b></span>}
          {mySel && (
            <>
              <span className="chip bg-primary-soft text-primary border-primary/30 max-w-full"><span className="truncate">{mySel.label}</span><button aria-label="Remover seleção" onClick={() => onSelect(null)}><X className="h-3 w-3" /></button></span>
              {(canDrillDate || canDrillCat) && <button className="chip hover:bg-muted" onClick={drillDown}><ZoomIn className="h-3 w-3" aria-hidden />Detalhar</button>}
              <button className="chip hover:bg-muted" onClick={records}><ListTree className="h-3 w-3" aria-hidden />Ver {selRows.length} registro(s)</button>
            </>
          )}
        </div>
      )}
    </Shell>
  );
});

function Shell({ widget, title, children, menu, editing }: WidgetViewProps & { title: string; children: React.ReactNode; menu?: React.ReactNode }) {
  return (
    <section className="card h-full flex flex-col p-3 sm:p-4 overflow-hidden" aria-label={title}>
      <header className="flex items-start gap-1 mb-2">
        {editing && <span className="drag-handle cursor-move -ml-1 p-1 text-subtle hover:text-fg touch-none" title="Arraste para mover" aria-hidden><GripVertical className="h-4 w-4" /></span>}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate" title={title}>{title}</h3>
          {widget.subtitle && <p className="text-xs text-subtle truncate">{widget.subtitle}</p>}
        </div>
        {menu}
      </header>
      {children}
    </section>
  );
}

function ChartProblem({ reason, suggest, onSuggest }: { reason: string; suggest?: ChartType; onSuggest: (t: ChartType) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 p-3">
      <AlertTriangle className="h-6 w-6 text-warn" aria-hidden />
      <p className="text-sm text-subtle max-w-xs">{reason}</p>
      {suggest && <button className="chip hover:bg-muted text-primary" onClick={() => onSuggest(suggest)}><ArrowDownToLine className="h-3 w-3" aria-hidden />Experimentar {chartMeta(suggest).label.toLowerCase()}</button>}
    </div>
  );
}

function ProgressSingle({ cfg, rows, cols }: { cfg: ChartConfig; rows: Row[]; cols: Dataset['columns'] }) {
  const v = aggregate(rows, cfg.values[0]);
  const target = cfg.target || Math.max(1, v);
  const fmt = makeFormatter(cfg, cols);
  const r = v / target;
  return (
    <div className="h-full flex flex-col justify-center gap-2">
      <div className="flex justify-between text-sm"><span className="font-semibold text-lg">{fmt(v)}</span><span className="text-subtle">meta {fmt(target)}</span></div>
      <div className="h-3 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r * 100)}%` }} /></div>
      <span className="text-xs text-subtle">{Math.round(r * 100)}% concluído{r >= 1 ? ' ✓ meta atingida' : ''}</span>
    </div>
  );
}

export function DataTableView({ table }: { table: { headers: string[]; rows: (string | number)[][] } }) {
  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <table className="w-full text-xs tabular">
        <thead className="sticky top-0 bg-surface"><tr className="border-b border-border">{table.headers.map((h) => <th key={h} className="text-left font-medium py-1.5 px-2">{h}</th>)}</tr></thead>
        <tbody>{table.rows.map((r, i) => <tr key={i} className="border-b border-border/50">{r.map((c, j) => <td key={j} className={`py-1 px-2 ${typeof c === 'number' ? 'text-right' : ''}`}>{typeof c === 'number' ? c.toLocaleString('pt-BR') : c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
