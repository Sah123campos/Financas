import type { ChartConfig, ChartType, Column } from '@/db/types';
import { isNumericType } from '@/data/values';

export interface ChartMeta {
  type: ChartType;
  label: string;
  group: 'Comparação' | 'Tendência' | 'Composição' | 'Distribuição' | 'Indicadores' | 'Tabelas';
  description: string;
  needsCategory: boolean;
  minValues: number;
  maxValues: number;
  series: 'none' | 'optional' | 'required';
  rawValues?: boolean; // usa valores por linha (sem agregação)
  zoomable?: boolean;
  echarts: boolean;
}

export const CHARTS: ChartMeta[] = [
  { type: 'bar', label: 'Barras verticais', group: 'Comparação', description: 'Compare valores entre categorias.', needsCategory: true, minValues: 1, maxValues: 1, series: 'optional', zoomable: true, echarts: true },
  { type: 'hbar', label: 'Barras horizontais', group: 'Comparação', description: 'Ideal para rótulos longos e rankings.', needsCategory: true, minValues: 1, maxValues: 1, series: 'optional', zoomable: true, echarts: true },
  { type: 'groupedBar', label: 'Colunas agrupadas', group: 'Comparação', description: 'Várias medidas lado a lado por categoria.', needsCategory: true, minValues: 1, maxValues: 6, series: 'optional', zoomable: true, echarts: true },
  { type: 'stackedBar', label: 'Barras empilhadas', group: 'Composição', description: 'Total por categoria e a contribuição de cada parte.', needsCategory: true, minValues: 1, maxValues: 6, series: 'optional', zoomable: true, echarts: true },
  { type: 'line', label: 'Linhas', group: 'Tendência', description: 'Evolução de valores em sequência.', needsCategory: true, minValues: 1, maxValues: 6, series: 'optional', zoomable: true, echarts: true },
  { type: 'area', label: 'Áreas', group: 'Tendência', description: 'Evolução com ênfase no volume.', needsCategory: true, minValues: 1, maxValues: 4, series: 'optional', zoomable: true, echarts: true },
  { type: 'stackedArea', label: 'Áreas empilhadas', group: 'Composição', description: 'Evolução do total e de suas partes.', needsCategory: true, minValues: 1, maxValues: 6, series: 'optional', zoomable: true, echarts: true },
  { type: 'timeline', label: 'Evolução temporal', group: 'Tendência', description: 'Série temporal com zoom por período.', needsCategory: true, minValues: 1, maxValues: 4, series: 'optional', zoomable: true, echarts: true },
  { type: 'combo', label: 'Barras + linha', group: 'Tendência', description: 'Uma medida em barras e outra em linha, na mesma escala.', needsCategory: true, minValues: 2, maxValues: 4, series: 'none', zoomable: true, echarts: true },
  { type: 'pie', label: 'Pizza', group: 'Composição', description: 'Participação de cada parte no todo (poucas categorias).', needsCategory: true, minValues: 1, maxValues: 1, series: 'none', echarts: true },
  { type: 'donut', label: 'Rosca', group: 'Composição', description: 'Participação no todo, com total ao centro.', needsCategory: true, minValues: 1, maxValues: 1, series: 'none', echarts: true },
  { type: 'waterfall', label: 'Cascata', group: 'Composição', description: 'Como entradas e saídas formam o resultado.', needsCategory: true, minValues: 1, maxValues: 1, series: 'none', echarts: true },
  { type: 'pareto', label: 'Pareto', group: 'Distribuição', description: 'Itens mais relevantes e o percentual acumulado.', needsCategory: true, minValues: 1, maxValues: 1, series: 'none', echarts: true },
  { type: 'histogram', label: 'Histograma', group: 'Distribuição', description: 'Frequência de valores em faixas.', needsCategory: false, minValues: 1, maxValues: 1, series: 'none', rawValues: true, echarts: true },
  { type: 'scatter', label: 'Dispersão', group: 'Distribuição', description: 'Relação entre duas medidas numéricas.', needsCategory: false, minValues: 2, maxValues: 2, series: 'optional', rawValues: true, zoomable: true, echarts: true },
  { type: 'heatmap', label: 'Mapa de calor', group: 'Distribuição', description: 'Intensidade cruzando duas dimensões.', needsCategory: true, minValues: 1, maxValues: 1, series: 'required', echarts: true },
  { type: 'radar', label: 'Radar', group: 'Comparação', description: 'Perfil de várias medidas em eixos radiais.', needsCategory: true, minValues: 1, maxValues: 4, series: 'optional', echarts: true },
  { type: 'funnel', label: 'Funil', group: 'Composição', description: 'Etapas sucessivas de um processo.', needsCategory: true, minValues: 1, maxValues: 1, series: 'none', echarts: true },
  { type: 'kpi', label: 'Cartão (KPI)', group: 'Indicadores', description: 'Um número de destaque.', needsCategory: false, minValues: 1, maxValues: 1, series: 'none', echarts: false },
  { type: 'gauge', label: 'Medidor de meta', group: 'Indicadores', description: 'Valor atual em relação a uma meta.', needsCategory: false, minValues: 1, maxValues: 1, series: 'none', echarts: true },
  { type: 'progress', label: 'Progresso', group: 'Indicadores', description: 'Barras de progresso em relação a uma meta.', needsCategory: false, minValues: 1, maxValues: 1, series: 'none', echarts: false },
  { type: 'table', label: 'Tabela resumida', group: 'Tabelas', description: 'Valores agregados por categoria.', needsCategory: true, minValues: 1, maxValues: 6, series: 'none', echarts: false },
  { type: 'pivot', label: 'Tabela dinâmica', group: 'Tabelas', description: 'Linhas × colunas com totais.', needsCategory: true, minValues: 1, maxValues: 1, series: 'required', echarts: false },
];
export const chartMeta = (t: ChartType) => CHARTS.find((c) => c.type === t)!;

export interface Validation { level: 'ok' | 'warn' | 'error'; reason?: string; suggest?: ChartType }

/** Verifica se o tipo de gráfico é adequado aos campos selecionados. */
export function validateChart(type: ChartType, cfg: ChartConfig, columns: Column[], categoryCount?: number, hasNegative?: boolean): Validation {
  const m = chartMeta(type);
  const col = (k?: string) => columns.find((c) => c.key === k);
  const cat = col(cfg.category);
  const vals = cfg.values;
  if (m.needsCategory && !cat) return { level: 'error', reason: `O gráfico "${m.label}" precisa de uma coluna de categoria (eixo).`, suggest: type === 'kpi' ? undefined : 'kpi' };
  if (vals.length < m.minValues) {
    if (type === 'scatter') return { level: 'error', reason: 'A dispersão precisa de duas colunas numéricas: uma para o eixo X e outra para o eixo Y.', suggest: 'bar' };
    if (type === 'combo') return { level: 'error', reason: 'O gráfico combinado precisa de pelo menos dois valores (um em barras e outro em linha).', suggest: 'bar' };
    return { level: 'error', reason: 'Selecione ao menos um valor.' };
  }
  for (const v of vals) {
    const c = col(v.col);
    if (v.col && !c) return { level: 'error', reason: 'Uma das colunas de valor não existe mais nesta planilha.' };
    if ((m.rawValues || ['sum', 'avg', 'min', 'max'].includes(v.agg)) && v.col && c && !isNumericType(c.type)) {
      return { level: 'error', reason: `A coluna "${c.name}" é do tipo texto/data e não pode ser somada ou ter média calculada. Use "Contagem" ou escolha uma coluna numérica.` };
    }
    if (m.rawValues && !v.col) return { level: 'error', reason: `O gráfico "${m.label}" precisa de uma coluna numérica.` };
  }
  if (m.series === 'required' && !col(cfg.series)) {
    return { level: 'error', reason: `O gráfico "${m.label}" cruza duas dimensões: escolha também uma coluna de "Legenda / Série".`, suggest: type === 'pivot' ? 'table' : 'bar' };
  }
  if (type === 'timeline' && cat?.type !== 'date') return { level: 'error', reason: 'A evolução temporal precisa de uma coluna de data como categoria.', suggest: 'bar' };
  if ((type === 'line' || type === 'area' || type === 'stackedArea') && cat && cat.type === 'text') {
    return { level: 'warn', reason: 'Linhas e áreas sugerem continuidade. Com categorias sem ordem natural, barras costumam ser mais claras.', suggest: 'bar' };
  }
  if ((type === 'pie' || type === 'donut') && hasNegative) return { level: 'error', reason: 'Gráficos de pizza/rosca não representam valores negativos.', suggest: 'waterfall' };
  if ((type === 'pie' || type === 'donut' || type === 'funnel') && (categoryCount ?? 0) > 8 && !cfg.limit) {
    return { level: 'warn', reason: `Há ${categoryCount} categorias; fatias pequenas ficam ilegíveis. As menores foram agrupadas em "Outros" — ou use barras horizontais.`, suggest: 'hbar' };
  }
  if ((type === 'stackedBar' || type === 'stackedArea') && vals.length < 2 && !col(cfg.series)) {
    return { level: 'warn', reason: 'Para empilhar, escolha uma coluna de legenda ou mais de um valor. Com uma única série, o resultado é igual a barras simples.', suggest: 'bar' };
  }
  if (type === 'radar' && (categoryCount ?? 3) < 3) return { level: 'error', reason: 'O radar precisa de pelo menos 3 categorias.', suggest: 'bar' };
  if (type === 'scatter' && vals.length === 2 && vals[0].col === vals[1].col) return { level: 'warn', reason: 'Os eixos X e Y usam a mesma coluna — os pontos formarão uma linha reta.' };
  if ((type === 'gauge' || type === 'progress') && !cfg.target) return { level: 'warn', reason: 'Defina uma meta para medir o progresso. Sem ela, o maior valor encontrado é usado como referência.' };
  return { level: 'ok' };
}

export function defaultConfig(partial: Partial<ChartConfig> = {}): ChartConfig {
  return {
    grain: 'month', values: [], filters: [], sort: 'none', showLegend: true, showLabels: false, showAxis: true,
    format: 'auto', decimals: 2, showTotal: false, zoom: false, ...partial,
  };
}
