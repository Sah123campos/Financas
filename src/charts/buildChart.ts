// Converte (tipo + configuração + linhas) em uma opção do ECharts, uma tabela acessível
// e um mapeador de cliques → filtros (usado nos filtros cruzados).
import type { EChartsOption } from 'echarts';
import type { ChartConfig, ChartType, Column, Filter, Row } from '@/db/types';
import { aggregate, histogram, pivot, valueLabel, type Pivot } from '@/data/engine';
import { fmtValue } from '@/lib/format';
import { chrome, SEQ_BLUE } from './palette';

export interface BuildCtx {
  dark: boolean;
  selected: Set<string>; // chaves de categoria selecionadas neste widget
  colorFor: (key: string, i?: number) => string;
  animation: boolean;
  compact: boolean;
}
export interface DataTable { headers: string[]; rows: (string | number)[][] }
export interface ClickInfo { name?: string; seriesName?: string; dataIndex?: number; seriesIndex?: number; value?: unknown; componentType?: string }
export interface BuildResult {
  option: EChartsOption;
  table: DataTable;
  pivot?: Pivot;
  toFilters: (p: ClickInfo) => { filters: Filter[]; label: string; key: string } | null;
  summary: string; // descrição textual (leitores de tela)
}

type Fmt = (v: number, compact?: boolean) => string;

export function makeFormatter(cfg: ChartConfig, columns: Column[], specIndex = 0): Fmt {
  const col = columns.find((c) => c.key === cfg.values[specIndex]?.col);
  const agg = cfg.values[specIndex]?.agg;
  const t = agg === 'count' || agg === 'countDistinct' ? 'number' : col?.type;
  return (v, compact = false) => fmtValue(v, cfg.format, cfg.decimals, t, compact);
}

export function pivotFor(type: ChartType, cfg: ChartConfig, rows: Row[], columns: Column[]): Pivot {
  const many = ['pie', 'donut', 'funnel'].includes(type);
  const sort = type === 'pareto' || type === 'funnel' ? 'valueDesc' : cfg.sort;
  const est = many && !cfg.limit ? 7 : cfg.limit;
  const series = ['pie', 'donut', 'funnel', 'waterfall', 'pareto', 'combo'].includes(type) ? undefined : cfg.series;
  const p = pivot(rows, columns, { category: cfg.category, grain: cfg.grain, values: cfg.values, series, sort, limit: undefined });
  if (est && p.keys.length > est + 1) return pivot(rows, columns, { category: cfg.category, grain: cfg.grain, values: cfg.values, series, sort: many ? 'valueDesc' : sort, limit: est });
  return p;
}

export function buildChart(type: ChartType, cfg: ChartConfig, rows: Row[], columns: Column[], ctx: BuildCtx): BuildResult {
  const c = chrome(ctx.dark);
  const fmt = makeFormatter(cfg, columns);
  const catCol = columns.find((x) => x.key === cfg.category);
  const serCol = columns.find((x) => x.key === cfg.series);
  const base: EChartsOption = {
    animation: ctx.animation,
    animationDuration: 350,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: c.ink2 },
    tooltip: {
      backgroundColor: c.tooltipBg, borderColor: c.axis, textStyle: { color: c.ink, fontSize: 12 },
      confine: true, extraCssText: 'box-shadow:0 4px 14px rgba(0,0,0,.12);border-radius:8px;',
    },
  };
  const catFilter = (key: string): Filter => ({ col: cfg.category!, op: 'eq', value: key, grain: catCol?.type === 'date' ? cfg.grain : undefined });
  const dim = (key: string, _i?: number) => ctx.selected.size > 0 && !ctx.selected.has(key) ? 0.28 : 1;

  // ---------- Indicadores e histograma ----------
  if (type === 'histogram') {
    const spec = cfg.values[0];
    const h = histogram(rows, spec.col, cfg.bins ?? 10);
    const colName = columns.find((x) => x.key === spec.col)?.name ?? '';
    return {
      option: {
        ...base,
        grid: grid(ctx),
        tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: { type: 'category', data: h.labels, name: colName, nameLocation: 'middle', nameGap: 28, axisLabel: { color: c.muted, hideOverlap: true }, axisLine: { lineStyle: { color: c.axis } }, show: cfg.showAxis },
        yAxis: { type: 'value', name: 'Frequência', axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } }, show: cfg.showAxis },
        series: [{ type: 'bar', name: 'Registros', data: h.counts.map((v, i) => ({ value: v, itemStyle: { opacity: dim(h.labels[i], i) } })), barCategoryGap: '4%', itemStyle: { color: ctx.colorFor('__s0', 0), borderRadius: [4, 4, 0, 0] }, label: { show: cfg.showLabels, position: 'top', color: c.ink2 } }],
      },
      table: { headers: ['Faixa', 'Registros'], rows: h.labels.map((l, i) => [l, h.counts[i]]) },
      toFilters: (p) => {
        if (p.dataIndex == null) return null;
        const lo = h.edges[p.dataIndex], hi = h.edges[p.dataIndex + 1];
        return { filters: [{ col: spec.col, op: 'between', value: [lo, p.dataIndex === h.counts.length - 1 ? hi : hi - 1e-9] }], label: `${colName}: ${h.labels[p.dataIndex]}`, key: h.labels[p.dataIndex] };
      },
      summary: `Histograma de ${colName} em ${h.counts.length} faixas.`,
    };
  }

  if (type === 'gauge') {
    const v = aggregate(rows, cfg.values[0]);
    const max = cfg.target && cfg.target > 0 ? cfg.target : Math.max(1, Math.abs(v) * 1.25);
    const pct = max ? v / max : 0;
    const color = pct >= 1 ? '#0ca30c' : pct >= 0.7 ? '#2a78d6' : pct >= 0.4 ? '#eda100' : '#d03b3b';
    return {
      option: {
        ...base,
        series: [{
          type: 'gauge', min: 0, max, startAngle: 210, endAngle: -30, radius: ctx.compact ? '120%' : '92%', center: ['50%', ctx.compact ? '75%' : '58%'],
          progress: { show: true, width: 14, itemStyle: { color } }, axisLine: { lineStyle: { width: 14, color: [[1, c.grid]] } },
          pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { show: !ctx.compact, distance: 20, color: c.muted, fontSize: 10, formatter: (x: number) => (x === 0 || Math.abs(x - max) < max / 1000 ? fmt(x, true) : '') },
          anchor: { show: false }, title: { offsetCenter: [0, '32%'], color: c.ink2, fontSize: 12 },
          detail: { valueAnimation: ctx.animation, offsetCenter: [0, '0%'], fontSize: ctx.compact ? 18 : 24, fontWeight: 600, color: c.ink, formatter: (x: number) => fmt(x) },
          data: [{ value: v, name: `${Math.round(pct * 100)}% da meta` }],
        }],
      },
      table: { headers: ['Indicador', 'Valor', 'Meta', '% da meta'], rows: [[valueLabel(cfg.values[0], columns), fmt(v), fmt(max), `${Math.round(pct * 100)}%`]] },
      toFilters: () => null,
      summary: `Valor ${fmt(v)} de uma meta de ${fmt(max)} (${Math.round(pct * 100)}%).`,
    };
  }

  if (type === 'scatter') {
    const [sx, sy] = cfg.values;
    const xc = columns.find((x) => x.key === sx.col), yc = columns.find((x) => x.key === sy.col);
    const fx = makeFormatter(cfg, columns, 0), fy = makeFormatter(cfg, columns, 1);
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      if (typeof r[sx.col] !== 'number' || typeof r[sy.col] !== 'number') continue;
      const k = serCol ? String(r[serCol.key] ?? '(vazio)') : (yc?.name ?? 'Pontos');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const keys = [...groups.keys()].sort();
    return {
      option: {
        ...base,
        grid: grid(ctx, cfg.zoom, false, cfg.showLegend && keys.length > 1),
        legend: legend(cfg, keys.length, c),
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (p: unknown) => { const q = p as { seriesName: string; value: number[] }; return `<b>${esc(q.seriesName)}</b><br/>${esc(xc?.name ?? 'X')}: ${fx(q.value[0])}<br/>${esc(yc?.name ?? 'Y')}: ${fy(q.value[1])}`; } },
        xAxis: { type: 'value', name: xc?.name, nameLocation: 'middle', nameGap: 26, scale: true, axisLabel: { color: c.muted, formatter: (v: number) => fx(v, true) }, splitLine: { lineStyle: { color: c.grid } }, show: cfg.showAxis },
        yAxis: { type: 'value', name: yc?.name, scale: true, axisLabel: { color: c.muted, formatter: (v: number) => fy(v, true) }, splitLine: { lineStyle: { color: c.grid } }, show: cfg.showAxis },
        dataZoom: cfg.zoom ? [{ type: 'inside', xAxisIndex: 0 }, { type: 'inside', yAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 16, bottom: cfg.showLegend && keys.length > 1 ? 28 : 4 }] : undefined,
        series: keys.map((k, i) => ({
          type: 'scatter', name: k, symbolSize: 9,
          itemStyle: { color: ctx.colorFor(k, i), opacity: ctx.selected.size && !ctx.selected.has(k) ? 0.2 : 0.75, borderColor: c.surface, borderWidth: 1 },
          data: groups.get(k)!.map((r) => [r[sx.col] as number, r[sy.col] as number]),
          emphasis: { focus: 'series' },
        })),
      },
      table: { headers: [serCol?.name ?? 'Série', xc?.name ?? 'X', yc?.name ?? 'Y'], rows: keys.flatMap((k) => groups.get(k)!.slice(0, 500).map((r) => [k, r[sx.col] as number, r[sy.col] as number])) },
      toFilters: (p) => (serCol && p.seriesName ? { filters: [{ col: serCol.key, op: 'eq', value: p.seriesName }], label: `${serCol.name}: ${p.seriesName}`, key: p.seriesName } : null),
      summary: `Dispersão de ${xc?.name} por ${yc?.name} com ${rows.length} registros.`,
    };
  }

  // ---------- Gráficos baseados em categoria ----------
  const p = pivotFor(type, cfg, rows, columns);
  const table: DataTable = { headers: [catCol?.name ?? 'Categoria', ...p.series.map((s) => s.name)], rows: p.labels.map((l, i) => [l, ...p.series.map((s) => round2(s.data[i]))]) };
  const keyOf = (i?: number) => (i == null ? undefined : p.keys[i]);
  const toFilters: BuildResult['toFilters'] = (q) => {
    const key = keyOf(q.dataIndex);
    if (!cfg.category || key == null || key === 'Outros') return null;
    const filters = [catFilter(key)];
    let label = `${catCol?.name}: ${p.labels[q.dataIndex!]}`;
    if (serCol && q.seriesName && p.series.length > 1) {
      const s = p.series.find((x) => x.name === q.seriesName);
      if (s && ['stackedBar', 'groupedBar', 'bar', 'hbar', 'heatmap'].includes(type)) {
        filters.push({ col: serCol.key, op: 'eq', value: s.key, grain: serCol.type === 'date' ? 'month' : undefined });
        label += ` · ${serCol.name}: ${s.name}`;
      }
    }
    return { filters, label, key };
  };
  const total = p.totals.reduce((a, b) => a + b, 0);
  const top = p.keys.length ? p.labels[p.totals.indexOf(Math.max(...p.totals))] : '';
  const summary = `${p.keys.length} categorias em ${catCol?.name ?? ''}. Total ${fmt(total)}. Maior valor: ${top}.`;

  if (type === 'pie' || type === 'donut') {
    const s = p.series[0];
    const totalPie = s.data.reduce((a, b) => a + b, 0);
    return {
      option: {
        ...base,
        legend: { ...legend(cfg, p.keys.length, c), type: 'scroll' },
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (x: unknown) => { const q = x as { name: string; value: number; percent: number }; return `<b>${esc(q.name)}</b><br/>${fmt(q.value)} · ${q.percent.toFixed(1).replace('.', ',')}%`; } },
        title: type === 'donut' ? { text: fmt(totalPie, true), subtext: 'Total', left: 'center', top: cfg.showLegend ? '38%' : '42%', textStyle: { color: c.ink, fontSize: ctx.compact ? 14 : 18, fontWeight: 600 }, subtextStyle: { color: c.muted, fontSize: 11 }, itemGap: 2 } : undefined,
        series: [{
          type: 'pie', name: s.name, radius: type === 'donut' ? ['52%', '76%'] : ['0%', '76%'], center: ['50%', cfg.showLegend ? '45%' : '50%'],
          itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: type === 'donut' ? 4 : 2 },
          label: { show: cfg.showLabels, color: c.ink2, formatter: (x: unknown) => { const q = x as { name: string; percent: number }; return `${q.name}\n${q.percent.toFixed(0)}%`; } },
          labelLine: { show: cfg.showLabels },
          selectedMode: false,
          data: p.keys.map((k, i) => ({ name: p.labels[i], value: Math.max(0, s.data[i]), itemStyle: { color: ctx.colorFor(k, i), opacity: dim(k, i) } })),
        }],
      },
      table, pivot: p, toFilters, summary,
    };
  }

  if (type === 'funnel') {
    const s = p.series[0];
    return {
      option: {
        ...base,
        legend: { ...legend(cfg, p.keys.length, c), type: 'scroll' },
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (x: unknown) => { const q = x as { name: string; value: number; dataIndex: number }; const first = s.data[0] || 1; return `<b>${esc(q.name)}</b><br/>${fmt(q.value)} · ${Math.round((q.value / first) * 100)}% da 1ª etapa`; } },
        series: [{
          type: 'funnel', name: s.name, left: '8%', right: '8%', top: 10, bottom: cfg.showLegend ? 40 : 10, minSize: '12%', gap: 2, sort: 'descending',
          label: { show: true, position: 'inside', color: '#fff', formatter: (x: unknown) => { const q = x as { name: string; value: number }; return ctx.compact ? q.name : `${q.name}: ${fmt(q.value, true)}`; } },
          itemStyle: { borderColor: c.surface, borderWidth: 1 },
          data: p.keys.map((k, i) => ({ name: p.labels[i], value: s.data[i], itemStyle: { color: ctx.colorFor(k, i), opacity: dim(k, i) } })),
        }],
      },
      table, pivot: p, toFilters, summary,
    };
  }

  if (type === 'radar') {
    const max = Math.max(1, ...p.series.flatMap((s) => s.data)) * 1.1;
    return {
      option: {
        ...base,
        legend: legend(cfg, p.series.length, c),
        tooltip: { ...base.tooltip, trigger: 'item' },
        radar: { indicator: p.labels.map((l) => ({ name: l, max })), radius: ctx.compact ? '58%' : '66%', center: ['50%', cfg.showLegend && p.series.length > 1 ? '48%' : '52%'], axisName: { color: c.ink2, fontSize: 11 }, splitLine: { lineStyle: { color: c.grid } }, splitArea: { show: false }, axisLine: { lineStyle: { color: c.grid } } },
        series: [{ type: 'radar', symbolSize: 6, data: p.series.map((s, i) => ({ name: s.name, value: s.data, lineStyle: { width: 2, color: ctx.colorFor(s.key, i) }, itemStyle: { color: ctx.colorFor(s.key, i) }, areaStyle: { color: ctx.colorFor(s.key, i), opacity: 0.12 } })) }],
      },
      table, pivot: p, toFilters: () => null, summary,
    };
  }

  if (type === 'heatmap') {
    const s = p.series;
    const data: [number, number, number][] = [];
    s.forEach((ser, yi) => ser.data.forEach((v, xi) => data.push([xi, yi, round2(v)])));
    const max = Math.max(0, ...data.map((d) => d[2]));
    const min = Math.min(0, ...data.map((d) => d[2]));
    return {
      option: {
        ...base,
        grid: { left: 8, right: 16, top: 12, bottom: 56, containLabel: true },
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (x: unknown) => { const q = x as { value: number[] }; return `<b>${esc(p.labels[q.value[0]])}</b> · ${esc(s[q.value[1]].name)}<br/>${fmt(q.value[2])}`; } },
        xAxis: { type: 'category', data: p.labels, axisLabel: { color: c.muted, hideOverlap: true }, splitArea: { show: false }, axisLine: { lineStyle: { color: c.axis } } },
        yAxis: { type: 'category', data: s.map((x) => x.name), axisLabel: { color: c.muted }, axisLine: { lineStyle: { color: c.axis } } },
        visualMap: { min, max: max || 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 120, itemWidth: 10, inRange: { color: ctx.dark ? [...SEQ_BLUE].reverse().slice(1) : SEQ_BLUE }, textStyle: { color: c.muted }, formatter: (v: unknown) => fmt(Number(v), true) },
        series: [{ type: 'heatmap', data, itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 }, label: { show: cfg.showLabels, color: c.ink, fontSize: 10, formatter: (x: unknown) => fmt((x as { value: number[] }).value[2], true) }, emphasis: { itemStyle: { borderColor: c.ink, borderWidth: 1 } } }],
      },
      table, pivot: p,
      toFilters: (q) => {
        const v = q.value as number[] | undefined;
        if (!v) return null;
        const key = p.keys[v[0]], ser = s[v[1]];
        if (!key || !ser || !serCol) return null;
        return { filters: [catFilter(key), { col: serCol.key, op: 'eq', value: ser.key, grain: serCol.type === 'date' ? 'month' : undefined }], label: `${p.labels[v[0]]} · ${ser.name}`, key };
      },
      summary,
    };
  }

  if (type === 'waterfall') {
    const vals = p.series[0].data;
    let cum = 0;
    const items = vals.map((v, i) => { const start = cum; cum += v; return { value: [i, start, cum, v], itemStyle: { color: v >= 0 ? '#0ca30c' : '#d03b3b', opacity: dim(p.keys[i], i) } }; });
    items.push({ value: [vals.length, 0, cum, cum], itemStyle: { color: ctx.colorFor('__s0', 0), opacity: 1 } });
    const labels = [...p.labels, 'Total'];
    return {
      option: {
        ...base,
        grid: grid(ctx),
        tooltip: { ...base.tooltip, trigger: 'item', formatter: (x: unknown) => { const q = x as { value: number[] }; const v = q.value[3]; return `<b>${esc(labels[q.value[0]])}</b><br/>${q.value[0] === vals.length ? 'Resultado' : v >= 0 ? '▲ Aumento' : '▼ Redução'}: ${fmt(v)}<br/>Acumulado: ${fmt(q.value[2])}`; } },
        xAxis: { type: 'category', data: labels, axisLabel: { color: c.muted, hideOverlap: true }, axisLine: { lineStyle: { color: c.axis } }, show: cfg.showAxis },
        yAxis: { type: 'value', axisLabel: { color: c.muted, formatter: (v: number) => fmt(v, true) }, splitLine: { lineStyle: { color: c.grid } }, show: cfg.showAxis },
        series: [{
          type: 'custom', name: p.series[0].name,
          renderItem: ((_params: unknown, api: { value: (i: number) => number; coord: (v: number[]) => number[]; size: (v: number[]) => number[]; style: () => unknown }) => {
            const x = api.value(0), s = api.value(1), e = api.value(2);
            const p1 = api.coord([x, s]), p2 = api.coord([x, e]);
            const w = Math.min(48, api.size([1, 0])[0] * 0.62);
            return { type: 'rect', shape: { x: p1[0] - w / 2, y: Math.min(p1[1], p2[1]), width: w, height: Math.max(1, Math.abs(p1[1] - p2[1])), r: 3 }, style: api.style() };
          }) as never,
          encode: { x: 0, y: [1, 2] },
          label: { show: cfg.showLabels, position: 'top', color: c.ink2, formatter: (x: unknown) => fmt((x as { value: number[] }).value[3], true) },
          data: items,
        } as never],
      },
      table: { headers: [catCol?.name ?? 'Etapa', 'Variação', 'Acumulado'], rows: items.map((it, i) => [labels[i], round2(it.value[3]), round2(it.value[2])]) },
      pivot: p, toFilters: (q) => (q.dataIndex != null && q.dataIndex < vals.length ? toFilters(q) : null), summary: `Cascata com ${vals.length} etapas. Resultado final ${fmt(cum)}.`,
    };
  }

  if (type === 'pareto') {
    const vals = p.series[0].data;
    const tot = vals.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const cumPct = vals.map((v) => { acc += v; return +((acc / tot) * 100).toFixed(1); });
    return {
      option: {
        ...base,
        grid: { ...grid(ctx, false, false, cfg.showLegend), right: 44 },
        legend: { ...legend(cfg, 2, c) },
        tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (x: unknown) => { const arr = x as { dataIndex: number }[]; const i = arr[0].dataIndex; return `<b>${esc(p.labels[i])}</b><br/>${esc(p.series[0].name)}: ${fmt(vals[i])}<br/>Acumulado: ${cumPct[i].toLocaleString('pt-BR')}%`; } },
        xAxis: { type: 'category', data: p.labels, axisLabel: { color: c.muted, hideOverlap: true, interval: 0, rotate: p.keys.length > 6 ? 30 : 0 }, axisLine: { lineStyle: { color: c.axis } }, show: cfg.showAxis },
        yAxis: [
          { type: 'value', axisLabel: { color: c.muted, formatter: (v: number) => fmt(v, true) }, splitLine: { lineStyle: { color: c.grid } }, show: cfg.showAxis },
          { type: 'value', min: 0, max: 100, axisLabel: { color: c.muted, formatter: '{value}%' }, splitLine: { show: false }, show: cfg.showAxis },
        ],
        series: [
          { type: 'bar', name: p.series[0].name, barMaxWidth: 40, itemStyle: { borderRadius: [4, 4, 0, 0] }, data: vals.map((v, i) => ({ value: v, itemStyle: { color: ctx.colorFor('__s0', 0), opacity: dim(p.keys[i], i) } })), label: { show: cfg.showLabels, position: 'top', color: c.ink2, formatter: (x: unknown) => fmt((x as { value: number }).value, true) } },
          { type: 'line', name: '% acumulado', yAxisIndex: 1, data: cumPct, symbolSize: 6, lineStyle: { width: 2, color: ctx.colorFor('__s1', 1) }, itemStyle: { color: ctx.colorFor('__s1', 1) }, markLine: { silent: true, symbol: 'none', data: [{ yAxis: 80 }], lineStyle: { color: c.muted, type: 'dashed' }, label: { show: false } } },
        ],
      },
      table: { headers: [catCol?.name ?? 'Item', p.series[0].name, '% acumulado'], rows: p.labels.map((l, i) => [l, round2(vals[i]), cumPct[i]]) },
      pivot: p, toFilters, summary,
    };
  }

  // ---------- Cartesianos: barras, linhas, áreas, combinado, evolução ----------
  const horizontal = type === 'hbar';
  const stacked = type === 'stackedBar' || type === 'stackedArea';
  const isLineLike = type === 'line' || type === 'area' || type === 'stackedArea' || type === 'timeline';
  const multi = p.series.length > 1;
  const zoom = cfg.zoom || type === 'timeline';
  const catAxis = {
    type: 'category' as const, data: p.labels, inverse: horizontal, boundaryGap: !isLineLike,
    axisLabel: { color: c.muted, hideOverlap: true, ...(horizontal ? { width: 110, overflow: 'truncate' as const } : {}) },
    axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false }, show: cfg.showAxis,
  };
  const valAxis = { type: 'value' as const, axisLabel: { color: c.muted, hideOverlap: true, formatter: (v: number) => fmt(v, true) }, splitLine: { lineStyle: { color: c.grid } }, show: cfg.showAxis };
  const series = p.series.map((s, si) => {
    const color = ctx.colorFor(multi ? s.key : '__s0', si);
    const asLine = type === 'combo' ? (cfg.values[si]?.as ?? (si === 0 ? 'bar' : 'line')) === 'line' : isLineLike;
    const sfmt = makeFormatter(cfg, columns, serCol ? 0 : si);
    if (asLine) {
      return {
        type: 'line' as const, name: s.name, stack: type === 'stackedArea' ? 'total' : undefined, smooth: false, showSymbol: p.keys.length <= 40, symbolSize: 7,
        lineStyle: { width: 2, color }, itemStyle: { color },
        areaStyle: type === 'area' || type === 'stackedArea' ? { color, opacity: type === 'stackedArea' ? 0.55 : 0.14 } : undefined,
        emphasis: { focus: multi ? ('series' as const) : ('none' as const) },
        label: { show: cfg.showLabels, position: 'top' as const, color: c.ink2, formatter: (x: unknown) => sfmt((x as { value: number }).value, true) },
        data: s.data.map((v, i) => ({ value: round2(v), itemStyle: { color, opacity: dim(p.keys[i], i) }, symbolSize: ctx.selected.has(p.keys[i]) ? 12 : 7 })),
      };
    }
    const last = si === p.series.length - 1;
    return {
      type: 'bar' as const, name: s.name, stack: stacked ? 'total' : undefined, barMaxWidth: horizontal ? 28 : 44, barGap: '8%',
      itemStyle: { color, borderRadius: stacked && !last ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0], borderColor: stacked ? c.surface : undefined, borderWidth: stacked ? 1 : 0 },
      emphasis: { focus: multi ? ('series' as const) : ('none' as const) },
      label: { show: cfg.showLabels, position: stacked ? ('inside' as const) : horizontal ? ('right' as const) : ('top' as const), color: stacked ? '#fff' : c.ink2, fontSize: 11, formatter: (x: unknown) => sfmt((x as { value: number }).value, true) },
      data: s.data.map((v, i) => ({ value: round2(v), itemStyle: { opacity: dim(p.keys[i], i) } })),
    };
  });
  const option: EChartsOption = {
    ...base,
    grid: { ...grid(ctx, zoom, horizontal, cfg.showLegend && p.series.length > 1), right: horizontal ? (cfg.showLabels ? 72 : 32) : 16 },
    legend: legend(cfg, p.series.length, c),
    tooltip: {
      ...base.tooltip, trigger: 'axis', axisPointer: { type: isLineLike ? 'line' : 'shadow', lineStyle: { color: c.axis } },
      formatter: (x: unknown) => {
        const arr = x as { dataIndex: number; seriesName: string; value: number; color: string; seriesIndex: number }[];
        if (!arr.length) return '';
        const i = arr[0].dataIndex;
        const lines = arr.map((a) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${a.color};margin-right:6px"></span>${esc(a.seriesName)}: <b>${makeFormatter(cfg, columns, serCol ? 0 : a.seriesIndex)(Number(a.value))}</b>`);
        if (arr.length > 1 && (stacked || serCol)) lines.push(`<span style="color:${c.muted}">Total: ${fmt(arr.reduce((t, a) => t + Number(a.value || 0), 0))}</span>`);
        return `<b>${esc(p.labels[i])}</b><br/>${lines.join('<br/>')}`;
      },
    },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    dataZoom: zoom ? [{ type: 'inside', [horizontal ? 'yAxisIndex' : 'xAxisIndex']: 0, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false } as never, { type: 'slider', [horizontal ? 'yAxisIndex' : 'xAxisIndex']: 0, height: 16, bottom: cfg.showLegend && p.series.length > 1 ? 28 : 6, borderColor: c.grid, textStyle: { color: c.muted }, brushSelect: false } as never] : undefined,
    series,
  };
  return { option, table, pivot: p, toFilters, summary };
}

function grid(ctx: BuildCtx, zoom = false, horizontal = false, legendShown = false) {
  return { left: 8, right: horizontal ? 24 : 12, top: 16, bottom: (zoom ? 30 : ctx.compact ? 8 : 12) + (legendShown ? 26 : 0), containLabel: true };
}
function legend(cfg: ChartConfig, n: number, c: ReturnType<typeof chrome>) {
  return { show: cfg.showLegend && n > 1, type: 'scroll' as const, bottom: 0, left: 'center', icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: c.ink2, fontSize: 11 }, pageTextStyle: { color: c.muted }, pageIconColor: c.ink2 };
}
const round2 = (v: number) => Math.round(v * 100) / 100;
export function esc(s: string) { return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!)); }
