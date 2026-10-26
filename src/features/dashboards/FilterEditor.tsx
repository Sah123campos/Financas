import type { CellValue, Column, Filter, FilterOp, Row } from '@/db/types';
import { distinctValues, GRAIN_LABELS } from '@/data/engine';
import { isNumericType } from '@/data/values';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const OPS: { op: FilterOp; label: string; for: 'all' | 'num' | 'text' }[] = [
  { op: 'in', label: 'é um de', for: 'all' }, { op: 'eq', label: 'é igual a', for: 'all' }, { op: 'neq', label: 'é diferente de', for: 'all' },
  { op: 'contains', label: 'contém', for: 'text' }, { op: 'gt', label: 'maior que', for: 'num' }, { op: 'gte', label: 'maior ou igual a', for: 'num' },
  { op: 'lt', label: 'menor que', for: 'num' }, { op: 'lte', label: 'menor ou igual a', for: 'num' }, { op: 'between', label: 'entre', for: 'num' },
];

export function FilterEditor({ filters, onChange, columns, rows }: { filters: Filter[]; onChange: (f: Filter[]) => void; columns: Column[]; rows: Row[] }) {
  const set = (i: number, f: Filter) => onChange(filters.map((x, j) => (j === i ? f : x)));
  const add = () => { const c = columns[0]; if (c) onChange([...filters, { col: c.key, op: c.type === 'date' ? 'between' : isNumericType(c.type) ? 'gte' : 'in', value: c.type === 'date' || isNumericType(c.type) ? (c.type === 'date' ? ['', ''] : null) : [] }]); };
  return (
    <div className="space-y-2">
      {filters.map((f, i) => {
        const col = columns.find((c) => c.key === f.col);
        const numeric = col && (isNumericType(col.type) || col.type === 'date');
        const ops = OPS.filter((o) => o.for === 'all' || (o.for === 'num' && numeric) || (o.for === 'text' && !numeric));
        return (
          <div key={i} className="rounded-lg border border-border p-2 space-y-2 bg-muted/40">
            <div className="flex gap-2">
              <select className="input h-9" aria-label="Coluna do filtro" value={f.col} onChange={(e) => { const c = columns.find((x) => x.key === e.target.value)!; set(i, { col: c.key, op: c.type === 'date' ? 'between' : isNumericType(c.type) ? 'gte' : 'in', value: c.type === 'date' ? ['', ''] : isNumericType(c.type) ? null : [] }); }}>
                {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                {!col && <option value={f.col}>{f.col} (indisponível)</option>}
              </select>
              <Button size="icon" variant="ghost" aria-label="Remover filtro" onClick={() => onChange(filters.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
            </div>
            <select className="input h-9" aria-label="Condição" value={f.op} onChange={(e) => { const op = e.target.value as FilterOp; set(i, { ...f, op, value: op === 'in' ? [] : op === 'between' ? ['', ''] : null }); }}>
              {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {col && <ValueInput f={f} col={col} rows={rows} onChange={(value) => set(i, { ...f, value })} />}
          </div>
        );
      })}
      <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={add} disabled={!columns.length}>Adicionar filtro</Button>
    </div>
  );
}

function ValueInput({ f, col, rows, onChange }: { f: Filter; col: Column; rows: Row[]; onChange: (v: CellValue | CellValue[]) => void }) {
  const inputType = col.type === 'date' ? 'date' : isNumericType(col.type) ? 'number' : 'text';
  if (f.op === 'between') {
    const [a, b] = Array.isArray(f.value) ? f.value : ['', ''];
    const conv = (v: string) => (inputType === 'number' ? (v === '' ? null : Number(v)) : v);
    return (
      <div className="flex gap-2 items-center">
        <input className="input h-9" type={inputType} aria-label="De" value={String(a ?? '')} onChange={(e) => onChange([conv(e.target.value), b])} />
        <span className="text-xs text-subtle">até</span>
        <input className="input h-9" type={inputType} aria-label="Até" value={String(b ?? '')} onChange={(e) => onChange([a, conv(e.target.value)])} />
      </div>
    );
  }
  if (f.op === 'in' || f.op === 'eq' || f.op === 'neq') {
    const grain = col.type === 'date' ? (f.grain ?? 'month') : 'none';
    const opts = distinctValues(rows, col, grain).slice(0, 300);
    if (f.op === 'in') {
      const sel = new Set((Array.isArray(f.value) ? f.value : []).map(String));
      return (
        <div>
          {col.type === 'date' && <p className="text-xs text-subtle mb-1">Valores agrupados por {GRAIN_LABELS[f.grain ?? 'month'].toLowerCase()}</p>}
          <div className="max-h-40 overflow-y-auto scrollbar-thin rounded-md border border-border bg-surface p-1">
            {opts.map((o) => (
              <label key={o.key} className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-muted cursor-pointer">
                <input type="checkbox" checked={sel.has(o.key)} onChange={(e) => { const s = new Set(sel); e.target.checked ? s.add(o.key) : s.delete(o.key); onChange([...s]); }} />
                <span className="flex-1 truncate">{o.key}</span><span className="text-xs text-subtle">{o.count}</span>
              </label>
            ))}
            {!opts.length && <p className="text-xs text-subtle p-2">Sem valores.</p>}
          </div>
        </div>
      );
    }
    return (
      <select className="input h-9" aria-label="Valor" value={String(f.value ?? '')} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione…</option>
        {opts.map((o) => <option key={o.key} value={o.key}>{o.key}</option>)}
      </select>
    );
  }
  return <input className="input h-9" type={f.op === 'contains' ? 'text' : inputType} aria-label="Valor" value={String(f.value ?? '')} onChange={(e) => onChange(inputType === 'number' && f.op !== 'contains' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />;
}

/** Normaliza filtros "in" de datas para comparar a chave do mês. */
export function normalizeFilters(filters: Filter[], columns: Column[]): Filter[] {
  return filters.map((f) => { const c = columns.find((x) => x.key === f.col); return c?.type === 'date' && (f.op === 'in' || f.op === 'eq' || f.op === 'neq') && !f.grain ? { ...f, grain: 'month' } : f; });
}

export function describeFilter(f: Filter, columns: Column[]): string {
  const c = columns.find((x) => x.key === f.col);
  const name = c?.name ?? f.col;
  const v = Array.isArray(f.value) ? f.value.filter((x) => x !== '' && x != null) : f.value;
  const op = OPS.find((o) => o.op === f.op)?.label ?? f.op;
  if (f.op === 'between' && Array.isArray(v)) return `${name} entre ${f.value && (f.value as CellValue[])[0] || '…'} e ${(f.value as CellValue[])[1] || '…'}`;
  if (Array.isArray(v)) return `${name}: ${v.length > 3 ? `${v.slice(0, 3).join(', ')} +${v.length - 3}` : v.join(', ') || '(nenhum)'}`;
  return `${name} ${op} ${v ?? ''}`;
}
