// Compartilhamento sem servidor: o dashboard + os dados necessários viram um pacote
// JSON compactado. O pacote vai no fragmento (#) do link — que NÃO é enviado a servidores —
// ou em um arquivo .json. O destinatário vê uma CÓPIA estática (não sincroniza).
import LZString from 'lz-string';
import { z } from 'zod';
import type { Column, Dashboard, Dataset, Row } from '@/db/types';
import { schemas } from '@/db/backup';
import { applyFilters } from '@/data/engine';
import { uid } from '@/lib/id';

export const SHARE_KIND = 'painel-financas-share';
export const LINK_SAFE_LENGTH = 30_000; // links maiores podem ser cortados por apps de mensagem
export const LINK_MAX_LENGTH = 1_800_000;

export interface SharePackage {
  kind: typeof SHARE_KIND;
  v: 1;
  createdAt: string;
  author?: string;
  note?: string;
  dashboard: Dashboard;
  datasets: Dataset[];
}

export interface ShareOptions {
  widgetIds: string[];
  columnMode: 'used' | 'all'; // apenas colunas usadas pelos gráficos, ou todas (permite ver registros)
  applyDashboardFilters: boolean;
  hideColumns: string[]; // `${datasetId}:${colKey}` a remover (ex.: descrições pessoais)
  author?: string;
  note?: string;
}

export function usedColumns(d: Dashboard, datasetId: string): Set<string> {
  const s = new Set<string>();
  for (const w of d.widgets) {
    if (w.datasetId !== datasetId) continue;
    const c = w.config;
    [c.category, c.series, c.drillTo, ...c.values.map((v) => v.col), ...c.filters.map((f) => f.col)].forEach((k) => k && s.add(k));
  }
  d.filters.forEach((f) => s.add(f.col));
  return s;
}

export function buildPackage(d: Dashboard, allDatasets: Dataset[], o: ShareOptions): SharePackage {
  const dash: Dashboard = structuredClone(d);
  dash.widgets = dash.widgets.filter((w) => o.widgetIds.includes(w.id));
  const ids = [...new Set(dash.widgets.map((w) => w.datasetId))];
  const datasets: Dataset[] = [];
  for (const id of ids) {
    const ds = allDatasets.find((x) => x.id === id);
    if (!ds) continue;
    const used = usedColumns(dash, id);
    let cols: Column[] = o.columnMode === 'all' ? ds.columns : ds.columns.filter((c) => used.has(c.key));
    cols = cols.filter((c) => !o.hideColumns.includes(`${id}:${c.key}`));
    let rows: Row[] = ds.rows;
    if (o.applyDashboardFilters && dash.filters.length) rows = applyFilters(rows, dash.filters, ds.columns);
    const keys = cols.map((c) => c.key);
    datasets.push({
      id, name: ds.name, description: ds.description, columns: cols, source: `Compartilhado: ${ds.name}`, createdAt: ds.createdAt, updatedAt: ds.updatedAt,
      rows: rows.map((r, i) => { const o2: Row = { _id: String(i) }; for (const k of keys) o2[k] = r[k] ?? null; return o2; }),
    });
  }
  // remove referências a colunas ocultadas
  for (const w of dash.widgets) {
    const ds = datasets.find((x) => x.id === w.datasetId);
    const has = (k?: string) => !!k && !!ds?.columns.some((c) => c.key === k);
    if (w.config.series && !has(w.config.series)) w.config.series = undefined;
    if (w.config.drillTo && !has(w.config.drillTo)) w.config.drillTo = undefined;
    w.config.filters = w.config.filters.filter((f) => has(f.col));
  }
  if (o.applyDashboardFilters) dash.filters = [];
  return { kind: SHARE_KIND, v: 1, createdAt: new Date().toISOString(), author: o.author || undefined, note: o.note || undefined, dashboard: dash, datasets };
}

export function encodePackage(p: SharePackage): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(p));
}

export function shareUrl(payload: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/s/${payload}`;
}

const pkgSchema = z.object({
  kind: z.literal(SHARE_KIND), v: z.literal(1), createdAt: z.string(), author: z.string().max(120).optional(), note: z.string().max(2000).optional(),
  dashboard: schemas.dashboards, datasets: z.array(schemas.datasets).max(50),
});

export function decodePackage(payload: string): SharePackage {
  let json: string | null = null;
  try { json = LZString.decompressFromEncodedURIComponent(payload); } catch { /* inválido */ }
  if (!json) throw new Error('Link de compartilhamento inválido ou incompleto. Ele pode ter sido cortado ao ser copiado.');
  return parsePackageText(json);
}

export function parsePackageText(text: string): SharePackage {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('O conteúdo compartilhado não é um JSON válido.'); }
  const r = pkgSchema.safeParse(data);
  if (!r.success) throw new Error('O pacote compartilhado está corrompido ou foi gerado por uma versão incompatível.');
  return r.data as unknown as SharePackage;
}

/** Converte o pacote em registros locais novos (IDs renovados para não colidir). */
export function materialize(p: SharePackage): { dashboard: Dashboard; datasets: Dataset[] } {
  const idMap = new Map<string, string>();
  const now = Date.now();
  const datasets = p.datasets.map((d) => {
    const nid = uid('ds');
    idMap.set(d.id, nid);
    return { ...d, id: nid, name: d.id === '__finance__' ? `${d.name} (compartilhado)` : d.name, source: 'Importado de compartilhamento', rows: d.rows.map((r) => ({ ...r, _id: uid() })), createdAt: now, updatedAt: now };
  });
  const dashboard: Dashboard = {
    ...structuredClone(p.dashboard), id: uid('db'), createdAt: now, updatedAt: now,
    widgets: p.dashboard.widgets.map((w) => ({ ...w, id: uid('w'), datasetId: idMap.get(w.datasetId) ?? w.datasetId })),
  };
  return { dashboard, datasets };
}

export function packageToFile(p: SharePackage): Blob {
  return new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
}
