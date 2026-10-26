// Opções do ECharts específicas da Gestão financeira.
import type { EChartsOption } from 'echarts';
import { chrome, STATUS } from '@/charts/palette';
import { fmtMoney } from '@/lib/format';
import { grainLabel } from '@/data/engine';
import type { ProjectionPoint } from '@/finance/metrics';
import { esc } from '@/charts/buildChart';

const tip = (dark: boolean) => { const c = chrome(dark); return { backgroundColor: c.tooltipBg, borderColor: c.axis, textStyle: { color: c.ink, fontSize: 12 }, confine: true, extraCssText: 'border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.12)' }; };

export function donutOption(items: { name: string; value: number; color: string; id: string }[], dark: boolean, total: number, selected?: string): EChartsOption {
  const c = chrome(dark);
  return {
    tooltip: { ...tip(dark), trigger: 'item', formatter: (p: unknown) => { const q = p as { name: string; value: number; percent: number }; return `<b>${esc(q.name)}</b><br/>${fmtMoney(q.value)} · ${q.percent.toFixed(1).replace('.', ',')}%`; } },
    title: { text: fmtMoney(total, 0, total >= 100000), subtext: 'gastos', left: 'center', top: '40%', textStyle: { color: c.ink, fontSize: 16, fontWeight: 600 }, subtextStyle: { color: c.muted, fontSize: 11 }, itemGap: 2 },
    series: [{ type: 'pie', radius: ['56%', '80%'], center: ['50%', '50%'], itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 4 }, label: { show: false },
      data: items.map((i) => ({ name: i.name, value: Math.round(i.value * 100) / 100, id: i.id, itemStyle: { color: i.color, opacity: selected && selected !== i.id ? 0.3 : 1 } })) }],
  };
}

export function monthlyOption(rows: { month: string; income: number; expense: number; result: number }[], dark: boolean): EChartsOption {
  const c = chrome(dark);
  const labels = rows.map((r) => grainLabel(r.month, 'month'));
  return {
    grid: { left: 8, right: 8, top: 16, bottom: 28, containLabel: true },
    legend: { bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: c.ink2, fontSize: 11 } },
    tooltip: { ...tip(dark), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: unknown) => { const a = p as { dataIndex: number }[]; const r = rows[a[0].dataIndex]; return `<b>${labels[a[0].dataIndex]}</b><br/>▲ Receitas: ${fmtMoney(r.income)}<br/>▼ Despesas: ${fmtMoney(r.expense)}<br/><b>${r.result >= 0 ? 'Sobrou' : 'Faltou'}: ${fmtMoney(Math.abs(r.result))}</b>`; } },
    xAxis: { type: 'category', data: labels, axisLabel: { color: c.muted }, axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: c.muted, formatter: (v: number) => fmtMoney(v, 0, true) }, splitLine: { lineStyle: { color: c.grid } } },
    series: [
      { type: 'bar', name: 'Receitas', data: rows.map((r) => r.income), itemStyle: { color: STATUS.good, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26, barGap: '10%' },
      { type: 'bar', name: 'Despesas', data: rows.map((r) => r.expense), itemStyle: { color: STATUS.critical, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 26 },
      { type: 'line', name: 'Resultado', data: rows.map((r) => Math.round(r.result * 100) / 100), symbolSize: 7, lineStyle: { width: 2, color: dark ? '#3987e5' : '#2a78d6' }, itemStyle: { color: dark ? '#3987e5' : '#2a78d6' } },
    ],
  };
}

export function projectionOption(points: ProjectionPoint[], today: string, dark: boolean): EChartsOption {
  const c = chrome(dark);
  const blue = dark ? '#3987e5' : '#2a78d6';
  const labels = points.map((p) => p.date);
  const fmtD = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return {
    grid: { left: 8, right: 12, top: 16, bottom: 44, containLabel: true },
    legend: { bottom: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 3, textStyle: { color: c.ink2, fontSize: 11 } },
    tooltip: { ...tip(dark), trigger: 'axis', formatter: (p: unknown) => { const a = p as { dataIndex: number }[]; const pt = points[a[0].dataIndex]; return `<b>${fmtD(pt.date)}</b><br/>${pt.realized != null ? `Saldo: ${fmtMoney(pt.realized)}` : `Projeção: ${fmtMoney(pt.projected ?? 0)}<br/><span style="color:${c.muted}">Estimativa baseada em lançamentos previstos</span>`}`; } },
    xAxis: { type: 'category', data: labels, boundaryGap: false, axisLabel: { color: c.muted, formatter: (v: string) => fmtD(v), hideOverlap: true }, axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: c.muted, formatter: (v: number) => fmtMoney(v, 0, true) }, splitLine: { lineStyle: { color: c.grid } } },
    dataZoom: [{ type: 'inside', zoomOnMouseWheel: 'shift' }],
    series: [
      { type: 'line', name: 'Saldo realizado', data: points.map((p) => p.realized), showSymbol: false, lineStyle: { width: 2, color: blue }, itemStyle: { color: blue }, areaStyle: { color: blue, opacity: 0.08 },
        markLine: { silent: true, symbol: 'none', label: { formatter: 'hoje', color: c.muted, fontSize: 10 }, lineStyle: { color: c.muted, type: 'dashed' }, data: [{ xAxis: today }] } },
      { type: 'line', name: 'Projeção', data: points.map((p) => p.projected), showSymbol: false, lineStyle: { width: 2, type: 'dashed', color: blue }, itemStyle: { color: blue },
        markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: STATUS.critical, opacity: 0.6 }, data: [{ yAxis: 0 }] } },
    ],
  };
}

export function stackedCategoryOption(months: string[], series: { name: string; color: string; data: number[] }[], dark: boolean): EChartsOption {
  const c = chrome(dark);
  const labels = months.map((m) => grainLabel(m, 'month'));
  return {
    grid: { left: 8, right: 8, top: 16, bottom: 40, containLabel: true },
    legend: { type: 'scroll', bottom: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: c.ink2, fontSize: 11 } },
    tooltip: { ...tip(dark), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: unknown) => { const a = (p as { seriesName: string; value: number; color: string; dataIndex: number }[]).filter((x) => x.value); const tot = a.reduce((s, x) => s + x.value, 0); return `<b>${labels[(p as { dataIndex: number }[])[0].dataIndex]}</b><br/>${a.sort((x, y) => y.value - x.value).map((x) => `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${x.color};margin-right:6px"></span>${esc(x.seriesName)}: ${fmtMoney(x.value)}`).join('<br/>')}<br/><b>Total: ${fmtMoney(tot)}</b>`; } },
    xAxis: { type: 'category', data: labels, axisLabel: { color: c.muted }, axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: c.muted, formatter: (v: number) => fmtMoney(v, 0, true) }, splitLine: { lineStyle: { color: c.grid } } },
    series: series.map((s) => ({ type: 'bar', name: s.name, stack: 't', data: s.data.map((v) => Math.round(v * 100) / 100), itemStyle: { color: s.color, borderColor: c.surface, borderWidth: 1 }, barMaxWidth: 36, emphasis: { focus: 'series' } })),
  };
}

export function hbarOption(items: { name: string; value: number }[], dark: boolean): EChartsOption {
  const c = chrome(dark);
  return {
    grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...tip(dark), trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: unknown) => fmtMoney(Number(v)) },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: items.map((i) => i.name), axisLabel: { color: c.ink2 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'bar', name: 'Gasto', data: items.map((i) => Math.round(i.value * 100) / 100), itemStyle: { color: dark ? '#3987e5' : '#2a78d6', borderRadius: [0, 4, 4, 0] }, barMaxWidth: 18, label: { show: true, position: 'right', color: c.ink2, fontSize: 11, formatter: (p: unknown) => fmtMoney((p as { value: number }).value, 0, true) } }],
  };
}
