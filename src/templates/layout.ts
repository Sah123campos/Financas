import type { ChartConfig, ChartType, Widget } from '@/db/types';
import { defaultConfig } from '@/charts/chartTypes';
import { uid } from '@/lib/id';

export const DEFAULT_SIZE: Partial<Record<ChartType, [number, number]>> = {
  kpi: [3, 3], gauge: [4, 5], progress: [4, 5], pie: [4, 7], donut: [4, 7], funnel: [4, 7], radar: [4, 7], table: [6, 7], pivot: [8, 8],
};

/** Encontra a primeira posição livre na grade de 12 colunas. */
export function placeWidget(existing: Widget[], w: number, h: number) {
  const occupied = (x: number, y: number) => existing.some((o) => x < o.layout.x + o.layout.w && x + w > o.layout.x && y < o.layout.y + o.layout.h && y + h > o.layout.y);
  for (let y = 0; y < 500; y++) for (let x = 0; x + w <= 12; x++) if (!occupied(x, y)) return { x, y, w, h };
  return { x: 0, y: Infinity, w, h };
}

export function makeWidget(existing: Widget[], type: ChartType, title: string, datasetId: string, cfg: Partial<ChartConfig>, size?: [number, number], subtitle?: string): Widget {
  const [w, h] = size ?? DEFAULT_SIZE[type] ?? [6, 7];
  return { id: uid('w'), type, title, subtitle, datasetId, config: defaultConfig(cfg), layout: placeWidget(existing, w, h) };
}

/** Constrói uma lista de widgets posicionando cada um em sequência. */
export function buildWidgets(datasetId: string, specs: [ChartType, string, Partial<ChartConfig>, [number, number]?, string?][]): Widget[] {
  const out: Widget[] = [];
  for (const [t, title, cfg, size, sub] of specs) out.push(makeWidget(out, t, title, datasetId, cfg, size, sub));
  return out;
}
