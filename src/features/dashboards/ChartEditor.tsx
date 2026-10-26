// Editor visual de gráficos: tipo, campos (com arrastar e soltar), formatação e filtros, com prévia imediata.
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import type { Agg, ChartConfig, ChartType, Column, Dataset, ValueSpec, Widget } from '@/db/types';
import { CHARTS, chartMeta, validateChart } from '@/charts/chartTypes';
import { AGG_LABELS, GRAIN_LABELS } from '@/data/engine';
import { isNumericType, TYPE_LABELS } from '@/data/values';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { WidgetView } from './WidgetView';
import { FilterEditor } from './FilterEditor';
import { suggestCharts } from '@/data/suggest';
import { Plus, X, GripVertical, Sparkles, Hash, Calendar, Type, Percent, DollarSign, ToggleLeft } from 'lucide-react';
import { PALETTE_LIGHT } from '@/charts/palette';

const TYPE_ICON: Record<string, ReactNode> = {
  text: <Type className="h-3.5 w-3.5" />, number: <Hash className="h-3.5 w-3.5" />, currency: <DollarSign className="h-3.5 w-3.5" />,
  percent: <Percent className="h-3.5 w-3.5" />, date: <Calendar className="h-3.5 w-3.5" />, boolean: <ToggleLeft className="h-3.5 w-3.5" />,
};

export function ChartEditor({ open, onClose, initial, datasets, onSave, colorOverrides }: {
  open: boolean; onClose: () => void; initial: Widget; datasets: Dataset[]; onSave: (w: Widget) => void; colorOverrides?: Record<string, string>;
}) {
  const [w, setW] = useState<Widget>(initial);
  const [tab, setTab] = useState<'dados' | 'formato' | 'filtros'>('dados');
  useEffect(() => { if (open) { setW(initial); setTab('dados'); } }, [open, initial]);
  const ds = datasets.find((d) => d.id === w.datasetId);
  const cols = ds?.columns ?? [];
  const cfg = w.config;
  const setCfg = (patch: Partial<ChartConfig>) => setW((x) => ({ ...x, config: { ...x.config, ...patch } }));
  const meta = chartMeta(w.type);
  const validation = useMemo(() => validateChart(w.type, cfg, cols), [w.type, cfg, cols]);
  const suggestions = useMemo(() => (ds ? suggestCharts(ds).slice(0, 4) : []), [ds]);

  const setType = (t: ChartType) => {
    const m = chartMeta(t);
    let values = cfg.values;
    if (m.rawValues || t === 'scatter') values = values.filter((v) => cols.find((c) => c.key === v.col && isNumericType(c.type)));
    if (t === 'scatter' && values.length < 2) { const nums = cols.filter((c) => isNumericType(c.type)); values = nums.slice(0, 2).map((c) => ({ col: c.key, agg: 'sum' as Agg })); }
    if (values.length > m.maxValues) values = values.slice(0, m.maxValues);
    if (t === 'combo' && values.length < 2) { const n = cols.filter((c) => isNumericType(c.type) && !values.some((v) => v.col === c.key)); if (n[0]) values = [...values, { col: n[0].key, agg: 'sum', as: 'line' }]; }
    let category = cfg.category;
    if (t === 'timeline' && cols.find((c) => c.key === category)?.type !== 'date') category = cols.find((c) => c.type === 'date')?.key;
    if (m.needsCategory && !category) category = cols.find((c) => c.type === 'text')?.key ?? cols[0]?.key;
    setW((x) => ({ ...x, type: t, config: { ...x.config, values, category, series: m.series === 'none' ? undefined : x.config.series } }));
  };

  const setValue = (i: number, patch: Partial<ValueSpec>) => setCfg({ values: cfg.values.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const addValue = (col?: string) => {
    if (cfg.values.length >= meta.maxValues) return;
    const c = cols.find((x) => x.key === col) ?? cols.find((x) => isNumericType(x.type) && !cfg.values.some((v) => v.col === x.key));
    setCfg({ values: [...cfg.values, { col: c?.key ?? '', agg: c && isNumericType(c.type) ? 'sum' : 'count' }] });
  };

  // ---- arrastar e soltar campos ----
  const onDrop = (zone: 'category' | 'values' | 'series' | 'filters') => (e: DragEvent) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/x-col');
    const c = cols.find((x) => x.key === key);
    if (!c) return;
    if (zone === 'category') setCfg({ category: key, grain: c.type === 'date' ? (cfg.grain === 'none' ? 'month' : cfg.grain) : cfg.grain });
    if (zone === 'series') setCfg({ series: key });
    if (zone === 'values') { if (cfg.values.length < meta.maxValues) setCfg({ values: [...cfg.values, { col: key, agg: isNumericType(c.type) ? 'sum' : 'count' }] }); else setValue(cfg.values.length - 1, { col: key, agg: isNumericType(c.type) ? 'sum' : 'count' }); }
    if (zone === 'filters') { setCfg({ filters: [...cfg.filters, { col: key, op: c.type === 'date' ? 'between' : isNumericType(c.type) ? 'gte' : 'in', value: c.type === 'date' ? ['', ''] : isNumericType(c.type) ? null : [] }] }); setTab('filtros'); }
  };
  const dropProps = (zone: Parameters<typeof onDrop>[0]) => ({ onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: onDrop(zone) });

  const catCol = cols.find((c) => c.key === cfg.category);
  const groups = [...new Set(CHARTS.map((c) => c.group))];

  return (
    <Modal open={open} onClose={onClose} title={initial.title ? `Editar: ${initial.title}` : 'Novo gráfico'} size="xl"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={validation.level === 'error' || !ds} onClick={() => onSave({ ...w, title: w.title.trim() || meta.label })}>Salvar gráfico</Button></>}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5">
        <div className="space-y-4 min-w-0">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="label">Planilha (fonte de dados)</span>
              <select className="input" value={w.datasetId} onChange={(e) => setW((x) => ({ ...x, datasetId: e.target.value, config: { ...x.config, category: undefined, series: undefined, values: [], filters: [] } }))}>
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.rows.length})</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Título</span><input className="input" value={w.title} onChange={(e) => setW((x) => ({ ...x, title: e.target.value }))} placeholder={meta.label} /></label>
          </div>
          <label className="block"><span className="label">Subtítulo <span className="text-subtle font-normal">(opcional)</span></span><input className="input" value={w.subtitle ?? ''} onChange={(e) => setW((x) => ({ ...x, subtitle: e.target.value }))} /></label>

          <div>
            <span className="label">Tipo de gráfico</span>
            <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
              {groups.map((g) => (
                <div key={g}>
                  <div className="text-[11px] uppercase tracking-wide text-subtle mb-1">{g}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {CHARTS.filter((c) => c.group === g).map((c) => {
                      const v = validateChart(c.type, cfg, cols);
                      return (
                        <button key={c.type} onClick={() => setType(c.type)} title={c.description + (v.level === 'error' ? ` — ${v.reason}` : '')}
                          aria-pressed={w.type === c.type}
                          className={`h-8 px-2.5 rounded-lg text-xs border transition ${w.type === c.type ? 'bg-primary text-primary-fg border-primary' : 'border-border hover:bg-muted'} ${v.level === 'error' && w.type !== c.type ? 'opacity-60' : ''}`}>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-subtle mt-1.5">{meta.description}</p>
          </div>

          <div role="tablist" className="flex gap-1 border-b border-border">
            {(['dados', 'formato', 'filtros'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 h-9 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-primary text-primary' : 'border-transparent text-subtle hover:text-fg'}`}>
                {t}{t === 'filtros' && cfg.filters.length ? ` (${cfg.filters.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'dados' && (
            <div className="space-y-3">
              <div>
                <span className="text-xs text-subtle">Campos — arraste para as áreas abaixo ou use os seletores</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {cols.map((c) => (
                    <span key={c.key} draggable onDragStart={(e) => e.dataTransfer.setData('text/x-col', c.key)} className="chip cursor-grab active:cursor-grabbing select-none" title={TYPE_LABELS[c.type]}>
                      <GripVertical className="h-3 w-3 text-subtle" aria-hidden />{TYPE_ICON[c.type]}{c.name}
                    </span>
                  ))}
                </div>
              </div>

              {(meta.needsCategory || ['kpi', 'gauge', 'progress'].includes(w.type)) && !meta.rawValues && (
                <Well label={meta.needsCategory ? 'Categoria (eixo)' : 'Categoria (opcional)'} {...dropProps('category')}>
                  <div className="flex gap-2">
                    <select className="input h-9" value={cfg.category ?? ''} onChange={(e) => { const c = cols.find((x) => x.key === e.target.value); setCfg({ category: e.target.value || undefined, grain: c?.type === 'date' && cfg.grain === 'none' ? 'month' : cfg.grain }); }} aria-label="Coluna de categoria">
                      <option value="">{meta.needsCategory ? 'Selecione…' : 'Nenhuma (valor único)'}</option>
                      {cols.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                    </select>
                    {catCol?.type === 'date' && (
                      <select className="input h-9 w-36" value={cfg.grain} onChange={(e) => setCfg({ grain: e.target.value as ChartConfig['grain'] })} aria-label="Agrupar datas por">
                        {(['day', 'month', 'quarter', 'year', 'none'] as const).map((g) => <option key={g} value={g}>{GRAIN_LABELS[g]}</option>)}
                      </select>
                    )}
                  </div>
                </Well>
              )}

              <Well label={meta.type === 'scatter' ? 'Eixos X e Y (numéricos)' : meta.type === 'histogram' ? 'Coluna numérica' : `Valores${meta.maxValues > 1 ? ` (até ${meta.maxValues})` : ''}`} {...dropProps('values')}>
                <div className="space-y-2">
                  {cfg.values.map((v, i) => (
                    <div key={i} className="flex flex-wrap gap-2 items-center">
                      {meta.type === 'scatter' && <span className="text-xs font-semibold w-4">{i === 0 ? 'X' : 'Y'}</span>}
                      <select className="input h-9 flex-1 min-w-[120px]" value={v.col} aria-label={`Coluna do valor ${i + 1}`} onChange={(e) => { const c = cols.find((x) => x.key === e.target.value); setValue(i, { col: e.target.value, agg: !c ? 'count' : isNumericType(c.type) ? (v.agg === 'count' || v.agg === 'countDistinct' ? 'sum' : v.agg) : v.agg === 'countDistinct' ? 'countDistinct' : 'count' }); }}>
                        {!meta.rawValues && <option value="">Registros (contagem)</option>}
                        {cols.filter((c) => !meta.rawValues || isNumericType(c.type)).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                      </select>
                      {!meta.rawValues && (
                        <select className="input h-9 w-36" value={v.agg} aria-label="Agregação" onChange={(e) => setValue(i, { agg: e.target.value as Agg })}>
                          {(Object.keys(AGG_LABELS) as Agg[]).filter((a) => { const c = cols.find((x) => x.key === v.col); return !v.col ? a === 'count' : c && isNumericType(c.type) ? true : a === 'count' || a === 'countDistinct'; }).map((a) => <option key={a} value={a}>{AGG_LABELS[a]}</option>)}
                        </select>
                      )}
                      {w.type === 'combo' && (
                        <select className="input h-9 w-24" value={v.as ?? (i === 0 ? 'bar' : 'line')} onChange={(e) => setValue(i, { as: e.target.value as 'bar' | 'line' })} aria-label="Exibir como"><option value="bar">Barra</option><option value="line">Linha</option></select>
                      )}
                      {cfg.values.length > meta.minValues && <Button size="iconSm" variant="ghost" aria-label="Remover valor" onClick={() => setCfg({ values: cfg.values.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>}
                      {cfg.values.length > 1 && !cfg.series && <input className="input h-9 basis-full" placeholder="Rótulo da série (opcional)" value={v.label ?? ''} onChange={(e) => setValue(i, { label: e.target.value || undefined })} aria-label="Rótulo da série" />}
                    </div>
                  ))}
                  {cfg.values.length < meta.maxValues && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => addValue()}>Adicionar valor</Button>}
                </div>
              </Well>

              {meta.series !== 'none' && (
                <Well label={`Legenda / série ${meta.series === 'required' ? '(obrigatória)' : '(opcional)'}`} {...dropProps('series')}>
                  <select className="input h-9" value={cfg.series ?? ''} onChange={(e) => setCfg({ series: e.target.value || undefined })} aria-label="Coluna de legenda">
                    <option value="">Nenhuma</option>
                    {cols.filter((c) => c.key !== cfg.category).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                  </select>
                  {cfg.series && cfg.values.length > 1 && <p className="text-xs text-warn mt-1">Com legenda, apenas o primeiro valor é usado.</p>}
                </Well>
              )}

              {meta.needsCategory && catCol?.type !== 'date' && (
                <label className="block"><span className="label">Detalhar (drill-down) para <span className="text-subtle font-normal">(opcional)</span></span>
                  <select className="input h-9" value={cfg.drillTo ?? ''} onChange={(e) => setCfg({ drillTo: e.target.value || undefined })}>
                    <option value="">Sem detalhamento</option>
                    {cols.filter((c) => c.key !== cfg.category && c.type !== 'date').map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                  </select>
                  <span className="text-xs text-subtle">Ao selecionar um item, "Detalhar" mostra a quebra por esta coluna. Datas sempre permitem detalhar ano → trimestre → mês → dia.</span>
                </label>
              )}

              <div {...dropProps('filters')} className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-subtle">Solte um campo aqui para criar um filtro</div>
            </div>
          )}

          {tab === 'formato' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <label><span className="label">Formato dos valores</span>
                <select className="input h-9" value={cfg.format} onChange={(e) => setCfg({ format: e.target.value as ChartConfig['format'] })}>
                  <option value="auto">Automático (pelo tipo da coluna)</option><option value="number">Número</option><option value="currency">Moeda</option><option value="percent">Percentual</option>
                </select>
              </label>
              <label><span className="label">Casas decimais</span><input type="number" min={0} max={6} className="input h-9" value={cfg.decimals} onChange={(e) => setCfg({ decimals: Math.max(0, Math.min(6, +e.target.value || 0)) })} /></label>
              {meta.needsCategory && (
                <>
                  <label><span className="label">Ordenação</span>
                    <select className="input h-9" value={cfg.sort} onChange={(e) => setCfg({ sort: e.target.value as ChartConfig['sort'] })}>
                      <option value="none">Natural</option><option value="valueDesc">Maior valor primeiro</option><option value="valueAsc">Menor valor primeiro</option><option value="labelAsc">A → Z</option><option value="labelDesc">Z → A</option>
                    </select>
                  </label>
                  <label><span className="label">Limitar categorias</span><input type="number" min={0} className="input h-9" placeholder="Sem limite" value={cfg.limit ?? ''} onChange={(e) => setCfg({ limit: e.target.value ? Math.max(1, +e.target.value) : undefined })} /><span className="text-xs text-subtle">O restante é somado em "Outros".</span></label>
                </>
              )}
              {['gauge', 'progress', 'kpi'].includes(w.type) && <label><span className="label">Meta</span><input type="number" className="input h-9" value={cfg.target ?? ''} onChange={(e) => setCfg({ target: e.target.value ? +e.target.value : undefined })} /></label>}
              {w.type === 'histogram' && <label><span className="label">Número de faixas</span><input type="number" min={2} max={50} className="input h-9" value={cfg.bins ?? 10} onChange={(e) => setCfg({ bins: +e.target.value || 10 })} /></label>}
              <fieldset className="sm:col-span-2 grid grid-cols-2 gap-2">
                <legend className="label">Exibição</legend>
                {([['showLegend', 'Legenda'], ['showLabels', 'Rótulos de valores'], ['showAxis', 'Eixos'], ['showTotal', 'Mostrar total'], ['zoom', 'Zoom / rolagem']] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cfg[k]} onChange={(e) => setCfg({ [k]: e.target.checked })} />{l}</label>
                ))}
              </fieldset>
              {!cfg.series && meta.echarts && cfg.values.length > 0 && !['pie', 'donut', 'funnel', 'heatmap', 'gauge'].includes(w.type) && (
                <div className="sm:col-span-2">
                  <span className="label">Cores das séries</span>
                  <div className="flex flex-wrap gap-3">
                    {cfg.values.map((v, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm">
                        <input type="color" className="h-8 w-10 rounded border border-border bg-surface" value={cfg.colors?.[i] ?? PALETTE_LIGHT[i % 8]} onChange={(e) => { const c = [...(cfg.colors ?? [])]; c[i] = e.target.value; setCfg({ colors: c }); }} aria-label={`Cor da série ${i + 1}`} />
                        {v.label || cols.find((c) => c.key === v.col)?.name || 'Registros'}
                      </label>
                    ))}
                    {cfg.colors?.length ? <button className="text-xs underline text-subtle" onClick={() => setCfg({ colors: undefined })}>Restaurar paleta</button> : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'filtros' && ds && (
            <div>
              <p className="text-xs text-subtle mb-2">Filtros fixos deste gráfico (aplicados antes dos filtros do painel).</p>
              <FilterEditor filters={cfg.filters} onChange={(filters) => setCfg({ filters })} columns={cols} rows={ds.rows} />
            </div>
          )}
        </div>

        <div className="min-w-0 lg:sticky lg:top-0 self-start space-y-3">
          <div className="text-xs text-subtle">Prévia (atualiza imediatamente)</div>
          <div className="h-[320px] sm:h-[380px]">
            <WidgetView widget={{ ...w, title: w.title || meta.label }} dataset={ds} externalFilters={[]} onSelect={() => undefined} onRecords={() => undefined} colorOverrides={colorOverrides} />
          </div>
          {validation.level !== 'ok' && <p className={`text-sm ${validation.level === 'error' ? 'text-expense' : 'text-warn'}`} role="alert">⚠ {validation.reason}</p>}
          {suggestions.length > 0 && (
            <div>
              <div className="text-xs text-subtle flex items-center gap-1 mb-1"><Sparkles className="h-3.5 w-3.5" aria-hidden />Sugestões para estes dados</div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => <button key={i} className="chip hover:bg-muted" onClick={() => setW((x) => ({ ...x, type: s.type, title: s.title, config: { ...x.config, ...s.config } }))}>{s.title}</button>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Well({ label, children, ...drop }: { label: string; children: ReactNode; onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div {...drop} onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDropCapture={() => setOver(false)}
      className={`rounded-lg border p-2.5 transition ${over ? 'border-primary bg-primary-soft' : 'border-border'}`}>
      <div className="text-xs font-medium mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export function columnLabel(c: Column) { return `${c.name} · ${TYPE_LABELS[c.type]}`; }
