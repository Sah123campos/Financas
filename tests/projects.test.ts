import { describe, expect, it } from 'vitest';
import { agruparProjetos } from '@/features/projects/projects';
import type { Dashboard, Dataset } from '@/db/types';

const ds = (id: string, updatedAt: number, rows = 3): Dataset =>
  ({ id, name: `Planilha ${id}`, description: '', source: '', columns: [], rows: Array.from({ length: rows }, () => ({})), createdAt: 0, updatedAt } as unknown as Dataset);
const dash = (id: string, updatedAt: number, datasetIds: string[]): Dashboard =>
  ({ id, name: `Projeto ${id}`, description: '', filters: [], createdAt: 0, updatedAt, widgets: datasetIds.map((d, i) => ({ id: `w${i}`, datasetId: d })) } as unknown as Dashboard);

describe('agruparProjetos', () => {
  it('liga cada dashboard às suas planilhas e ordena pelo mais recente', () => {
    const { projetos, soltas } = agruparProjetos(
      [dash('a', 10, ['p1']), dash('b', 20, ['p2', 'p2', '__finance__'])],
      [ds('p1', 50, 4), ds('p2', 5), ds('p3', 1)],
    );
    expect(projetos.map((p) => p.dashboard.id)).toEqual(['a', 'b']); // "a" ficou mais recente pela planilha p1
    expect(projetos[0].planilhas).toEqual([{ id: 'p1', name: 'Planilha p1', rows: 4, financeiro: false }]);
    expect(projetos[1].planilhas.map((p) => p.id)).toEqual(['p2', '__finance__']);
    expect(soltas.map((d) => d.id)).toEqual(['p3']);
  });

  it('ignora planilhas que já foram excluídas', () => {
    const { projetos } = agruparProjetos([dash('a', 1, ['sumiu'])], []);
    expect(projetos[0].planilhas).toEqual([]);
  });
});
