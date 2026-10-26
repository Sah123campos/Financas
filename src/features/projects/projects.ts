// Projetos: cada dashboard é um projeto, junto com as planilhas que ele usa.
// Ao importar uma planilha, o projeto é criado e aberto na hora.
import type { Dashboard, Dataset } from '@/db/types';
import { db } from '@/db/schema';
import { saveDashboard } from '@/db/repo';
import { suggestCharts } from '@/data/suggest';
import { buildWidgets } from '@/templates/layout';
import { FINANCE_DATASET_ID } from '@/finance/financeDataset';
import { uid } from '@/lib/id';

export interface ProjetoPlanilha { id: string; name: string; rows: number; financeiro: boolean }
export interface Projeto { dashboard: Dashboard; planilhas: ProjetoPlanilha[]; atualizado: number }

/** Monta a lista de projetos (mais recentes primeiro) e as planilhas que ainda não têm projeto. */
export function agruparProjetos(dashboards: Dashboard[], datasets: Dataset[]): { projetos: Projeto[]; soltas: Dataset[] } {
  const porId = new Map(datasets.map((d) => [d.id, d]));
  const usadas = new Set<string>();
  const projetos = dashboards.map((d) => {
    const ids = [...new Set(d.widgets.map((w) => w.datasetId))];
    const planilhas: ProjetoPlanilha[] = [];
    let atualizado = d.updatedAt;
    for (const id of ids) {
      usadas.add(id);
      if (id === FINANCE_DATASET_ID) { planilhas.push({ id, name: 'Lançamentos financeiros', rows: 0, financeiro: true }); continue; }
      const ds = porId.get(id);
      if (!ds) continue;
      planilhas.push({ id, name: ds.name, rows: ds.rows.length, financeiro: false });
      atualizado = Math.max(atualizado, ds.updatedAt);
    }
    return { dashboard: d, planilhas, atualizado };
  });
  projetos.sort((a, b) => b.atualizado - a.atualizado);
  const soltas = datasets.filter((d) => !usadas.has(d.id)).sort((a, b) => b.updatedAt - a.updatedAt);
  return { projetos, soltas };
}

/** Cria o projeto de uma planilha: um dashboard com os gráficos sugeridos para os dados. */
export async function criarProjeto(ds: Dataset): Promise<Dashboard> {
  const sugestoes = suggestCharts(ds).slice(0, 6);
  const widgets = buildWidgets(ds.id, sugestoes.map((s) => [s.type, s.title, s.config, s.type === 'kpi' ? [3, 3] : [6, 7]]));
  const now = Date.now();
  const d: Dashboard = {
    id: uid('db'), name: ds.name, description: `Projeto criado a partir da planilha "${ds.name}".`,
    widgets, filters: [], createdAt: now, updatedAt: now,
  };
  await saveDashboard(d);
  return d;
}

/** Exclui o projeto (dashboard). Se pedido, exclui também as planilhas que nenhum outro projeto usa. */
export async function excluirProjeto(p: Projeto, comPlanilhas: boolean) {
  await db.transaction('rw', db.dashboards, db.datasets, async () => {
    await db.dashboards.delete(p.dashboard.id);
    if (!comPlanilhas) return;
    const outros = await db.dashboards.toArray();
    for (const pl of p.planilhas) {
      if (pl.financeiro) continue;
      if (!outros.some((d) => d.widgets.some((w) => w.datasetId === pl.id))) await db.datasets.delete(pl.id);
    }
  });
}
