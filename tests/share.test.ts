import { describe, expect, it } from 'vitest';
import { buildPackage, decodePackage, encodePackage, materialize } from '../src/share/share';
import type { Dashboard, Dataset } from '../src/db/types';
import { defaultConfig } from '../src/charts/chartTypes';

const ds: Dataset = { id: 'ds1', name: 'Vendas', source: 'x', createdAt: 0, updatedAt: 0,
  columns: [{ key: 'p', name: 'Produto', type: 'text' }, { key: 'v', name: 'Valor', type: 'currency' }, { key: 'secreto', name: 'CPF', type: 'text' }],
  rows: [{ _id: 'a', p: 'X', v: 10, secreto: '123' }, { _id: 'b', p: 'Y', v: 20, secreto: '456' }] };
const dash: Dashboard = { id: 'd1', name: 'Painel', filters: [{ col: 'p', op: 'eq', value: 'X' }], createdAt: 0, updatedAt: 0,
  widgets: [{ id: 'w1', type: 'bar', title: 'T', datasetId: 'ds1', layout: { x: 0, y: 0, w: 6, h: 6 }, config: defaultConfig({ category: 'p', values: [{ col: 'v', agg: 'sum' }] }) }] };

describe('compartilhamento', () => {
  it('inclui só colunas usadas e respeita filtros', () => {
    const p = buildPackage(dash, [ds], { widgetIds: ['w1'], columnMode: 'used', applyDashboardFilters: true, hideColumns: [] });
    expect(p.datasets[0].columns.map((c) => c.key)).toEqual(['p', 'v']);
    expect(p.datasets[0].rows).toHaveLength(1);
    expect(JSON.stringify(p)).not.toContain('123');
  });
  it('codifica/decodifica e materializa com novos IDs', () => {
    const p = buildPackage(dash, [ds], { widgetIds: ['w1'], columnMode: 'all', applyDashboardFilters: false, hideColumns: ['ds1:secreto'] });
    const back = decodePackage(encodePackage(p));
    expect(back.dashboard.name).toBe('Painel');
    expect(back.datasets[0].columns.some((c) => c.key === 'secreto')).toBe(false);
    const m = materialize(back);
    expect(m.dashboard.id).not.toBe('d1');
    expect(m.dashboard.widgets[0].datasetId).toBe(m.datasets[0].id);
  });
  it('rejeita link corrompido', () => expect(() => decodePackage('abc')).toThrow());
});
