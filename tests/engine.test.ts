import { describe, expect, it } from 'vitest';
import { aggregate, applyFilters, grainKey, histogram, pivot } from '../src/data/engine';
import type { Column, Row } from '../src/db/types';

const cols: Column[] = [{ key: 'd', name: 'Data', type: 'date' }, { key: 'c', name: 'Cat', type: 'text' }, { key: 'v', name: 'Valor', type: 'currency' }];
const rows: Row[] = [
  { _id: '1', d: '2025-01-10', c: 'A', v: 10 }, { _id: '2', d: '2025-01-20', c: 'B', v: 30 },
  { _id: '3', d: '2025-02-05', c: 'A', v: 5 }, { _id: '4', d: '2025-04-01', c: null, v: 7 },
];

describe('engine', () => {
  it('grainKey', () => { expect(grainKey('2025-05-10', 'month')).toBe('2025-05'); expect(grainKey('2025-05-10', 'quarter')).toBe('2025-T2'); expect(grainKey('2025-05-10', 'year')).toBe('2025'); });
  it('agrega', () => {
    expect(aggregate(rows, { col: 'v', agg: 'sum' })).toBe(52);
    expect(aggregate(rows, { col: 'v', agg: 'avg' })).toBe(13);
    expect(aggregate(rows, { col: '', agg: 'count' })).toBe(4);
    expect(aggregate(rows, { col: 'c', agg: 'countDistinct' })).toBe(2);
    expect(aggregate(rows, { col: 'v', agg: 'max' })).toBe(30);
  });
  it('pivota por mês com ordenação cronológica', () => {
    const p = pivot(rows, cols, { category: 'd', grain: 'month', values: [{ col: 'v', agg: 'sum' }], sort: 'none' });
    expect(p.keys).toEqual(['2025-01', '2025-02', '2025-04']);
    expect(p.series[0].data).toEqual([40, 5, 7]);
  });
  it('pivota com série e agrupa "Outros"', () => {
    const p = pivot(rows, cols, { category: 'c', grain: 'none', values: [{ col: 'v', agg: 'sum' }], sort: 'valueDesc', limit: 1 });
    expect(p.keys).toEqual(['B', 'Outros']);
    expect(p.series[0].data).toEqual([30, 22]);
    const s = pivot(rows, cols, { category: 'd', grain: 'year', values: [{ col: 'v', agg: 'sum' }], series: 'c', sort: 'none' });
    expect(s.series.map((x) => x.name).sort()).toEqual(['(vazio)', 'A', 'B']);
  });
  it('filtra (inclusive por período inferido e intervalo)', () => {
    expect(applyFilters(rows, [{ col: 'c', op: 'eq', value: 'A' }], cols)).toHaveLength(2);
    expect(applyFilters(rows, [{ col: 'd', op: 'eq', value: '2025-01' }], cols)).toHaveLength(2);
    expect(applyFilters(rows, [{ col: 'd', op: 'between', value: ['2025-01-15', '2025-02-28'] }], cols)).toHaveLength(2);
    expect(applyFilters(rows, [{ col: 'v', op: 'gt', value: 7 }], cols)).toHaveLength(2);
    expect(applyFilters(rows, [{ col: 'c', op: 'in', value: ['(vazio)', 'B'] }], cols)).toHaveLength(2);
    // filtro de coluna inexistente é ignorado (gráficos de outras planilhas)
    expect(applyFilters(rows, [{ col: 'zzz', op: 'eq', value: 'x' }], cols)).toHaveLength(4);
  });
  it('histograma', () => { const h = histogram(rows, 'v', 5); expect(h.counts.reduce((a, b) => a + b, 0)).toBe(4); });
});
