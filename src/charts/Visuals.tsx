// Visualizações em HTML: KPI, progresso, tabela resumida e tabela dinâmica.
import type { ChartConfig, Column, Row } from '@/db/types';
import { aggregate, valueLabel, type Pivot } from '@/data/engine';
import { makeFormatter } from './buildChart';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

export function KpiVisual({ cfg, rows, columns, prevRows }: { cfg: ChartConfig; rows: Row[]; columns: Column[]; prevRows?: Row[] }) {
  const spec = cfg.values[0];
  const v = aggregate(rows, spec);
  const fmt = makeFormatter(cfg, columns);
  const prev = prevRows ? aggregate(prevRows, spec) : null;
  const delta = prev != null && prev !== 0 ? (v - prev) / Math.abs(prev) : null;
  const pct = cfg.target ? v / cfg.target : null;
  const negative = v < 0;
  return (
    <div className="h-full flex flex-col justify-center px-1">
      <div className={`text-2xl sm:text-[28px] font-semibold tracking-tight leading-tight truncate ${negative ? 'text-expense' : ''}`} title={fmt(v)}>
        {negative && <span className="sr-only">negativo </span>}{fmt(v)}
      </div>
      <div className="text-xs text-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{rows.length.toLocaleString('pt-BR')} registro(s)</span>
        {delta != null && (
          <span className={`inline-flex items-center gap-1 font-medium ${delta >= 0 ? 'text-income' : 'text-expense'}`}>
            {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
            {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(1).replace('.', ',')}% vs. período anterior
          </span>
        )}
        {pct != null && <span className="inline-flex items-center gap-1"><Target className="h-3.5 w-3.5" aria-hidden />{Math.round(pct * 100)}% da meta ({fmt(cfg.target!)})</span>}
      </div>
    </div>
  );
}

export function ProgressVisual({ cfg, pivot, columns, onSelect, selected }: { cfg: ChartConfig; pivot: Pivot; columns: Column[]; onSelect: (i: number) => void; selected: Set<string> }) {
  const fmt = makeFormatter(cfg, columns);
  const data = pivot.series[0]?.data ?? [];
  const target = cfg.target || Math.max(1, ...data);
  return (
    <ul className="h-full overflow-y-auto scrollbar-thin space-y-3 pr-1">
      {pivot.labels.map((l, i) => {
        const r = data[i] / target;
        const color = r >= 1 ? '#0ca30c' : r >= 0.7 ? '#2a78d6' : r >= 0.4 ? '#eda100' : '#d03b3b';
        const dim = selected.size > 0 && !selected.has(pivot.keys[i]);
        return (
          <li key={pivot.keys[i]} className={dim ? 'opacity-40' : ''}>
            <button className="w-full text-left" onClick={() => onSelect(i)} aria-label={`${l}: ${fmt(data[i])} de ${fmt(target)}`}>
              <div className="flex justify-between text-sm mb-1 gap-2"><span className="truncate">{l}</span><span className="tabular text-subtle shrink-0">{fmt(data[i])} · {Math.round(r * 100)}%{r >= 1 ? ' ✓' : ''}</span></div>
              <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: color }} /></div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SummaryTable({ cfg, pivot, columns, onSelect, selected }: { cfg: ChartConfig; pivot: Pivot; columns: Column[]; onSelect: (i: number) => void; selected: Set<string> }) {
  const catName = columns.find((c) => c.key === cfg.category)?.name ?? 'Categoria';
  const fmts = pivot.series.map((_, i) => makeFormatter(cfg, columns, i));
  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <table className="w-full text-sm tabular">
        <thead className="sticky top-0 bg-surface"><tr className="text-left text-subtle border-b border-border">
          <th className="py-2 pr-3 font-medium">{catName}</th>
          {pivot.series.map((s) => <th key={s.key} className="py-2 px-2 font-medium text-right">{s.name}</th>)}
        </tr></thead>
        <tbody>
          {pivot.labels.map((l, i) => (
            <tr key={pivot.keys[i]} onClick={() => onSelect(i)} className={`border-b border-border/60 cursor-pointer hover:bg-muted ${selected.has(pivot.keys[i]) ? 'bg-primary-soft' : ''}`}>
              <td className="py-1.5 pr-3"><button className="text-left w-full" onClick={(e) => { e.stopPropagation(); onSelect(i); }}>{l}</button></td>
              {pivot.series.map((s, si) => <td key={s.key} className="py-1.5 px-2 text-right">{fmts[si](s.data[i])}</td>)}
            </tr>
          ))}
        </tbody>
        {cfg.showTotal && (
          <tfoot><tr className="font-semibold"><td className="py-2 pr-3">Total</td>
            {pivot.series.map((s, si) => <td key={s.key} className="py-2 px-2 text-right">{s.spec.agg === 'sum' || s.spec.agg === 'count' ? fmts[si](s.data.reduce((a, b) => a + b, 0)) : '—'}</td>)}
          </tr></tfoot>
        )}
      </table>
    </div>
  );
}

export function PivotTable({ cfg, pivot, columns, rows, onSelect }: { cfg: ChartConfig; pivot: Pivot; columns: Column[]; rows: Row[]; onSelect: (i: number, seriesName?: string) => void }) {
  const fmt = makeFormatter(cfg, columns);
  const catName = columns.find((c) => c.key === cfg.category)?.name ?? '';
  const max = Math.max(1, ...pivot.series.flatMap((s) => s.data.map(Math.abs)));
  const canTotal = cfg.values[0]?.agg === 'sum' || cfg.values[0]?.agg === 'count';
  return (
    <div className="h-full overflow-auto scrollbar-thin">
      <table className="text-sm tabular min-w-full">
        <thead className="sticky top-0 bg-surface z-10"><tr className="text-subtle border-b border-border">
          <th className="py-2 pr-3 text-left font-medium sticky left-0 bg-surface">{catName}</th>
          {pivot.series.map((s) => <th key={s.key} className="py-2 px-2 text-right font-medium whitespace-nowrap">{s.name}</th>)}
          {canTotal && <th className="py-2 pl-2 text-right font-semibold">Total</th>}
        </tr></thead>
        <tbody>
          {pivot.labels.map((l, i) => (
            <tr key={pivot.keys[i]} className="border-b border-border/60">
              <td className="py-1.5 pr-3 sticky left-0 bg-surface whitespace-nowrap">{l}</td>
              {pivot.series.map((s) => (
                <td key={s.key} className="py-1.5 px-2 text-right cursor-pointer hover:outline hover:outline-1 hover:outline-primary/40" onClick={() => onSelect(i, s.name)}
                  style={{ background: s.data[i] ? `rgba(42,120,214,${0.06 + 0.3 * (Math.abs(s.data[i]) / max)})` : undefined }}>
                  {s.data[i] ? fmt(s.data[i]) : '—'}
                </td>
              ))}
              {canTotal && <td className="py-1.5 pl-2 text-right font-medium">{fmt(pivot.totals[i])}</td>}
            </tr>
          ))}
        </tbody>
        {canTotal && (
          <tfoot><tr className="font-semibold border-t border-border">
            <td className="py-2 pr-3 sticky left-0 bg-surface">Total</td>
            {pivot.series.map((s) => <td key={s.key} className="py-2 px-2 text-right">{fmt(s.data.reduce((a, b) => a + b, 0))}</td>)}
            <td className="py-2 pl-2 text-right">{fmt(aggregate(rows, cfg.values[0]))}</td>
          </tr></tfoot>
        )}
      </table>
      <p className="sr-only">{valueLabel(cfg.values[0], columns)}</p>
    </div>
  );
}
