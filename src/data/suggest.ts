// Sugestões automáticas de gráficos e detecção de planilhas financeiras.
import type { ChartConfig, ChartType, Column, Dataset } from '@/db/types';
import { isNumericType } from './values';
import { distinctValues } from './engine';

export interface Suggestion { type: ChartType; title: string; config: Partial<ChartConfig>; reason: string }

export function suggestCharts(ds: Dataset): Suggestion[] {
  const cols = ds.columns;
  const date = cols.find((c) => c.type === 'date');
  const nums = cols.filter((c) => isNumericType(c.type));
  const cats = cols.filter((c) => c.type === 'text' || c.type === 'boolean').map((c) => ({ c, n: distinctValues(ds.rows.slice(0, 2000), c).length })).filter((x) => x.n > 1 && x.n <= Math.max(30, ds.rows.length * 0.5)).sort((a, b) => a.n - b.n);
  const v = nums[0];
  const val = v ? [{ col: v.key, agg: 'sum' as const }] : [{ col: '', agg: 'count' as const }];
  const vName = v?.name ?? 'Registros';
  const out: Suggestion[] = [];
  if (v) out.push({ type: 'kpi', title: `Total de ${vName}`, config: { values: val }, reason: 'Destaque o número principal.' });
  if (date) out.push({ type: 'timeline', title: `${vName} por mês`, config: { category: date.key, grain: 'month', values: val }, reason: 'Há uma coluna de data: veja a evolução no tempo.' });
  const smallCat = cats.find((x) => x.n <= 8);
  if (smallCat) out.push({ type: 'donut', title: `${vName} por ${smallCat.c.name}`, config: { category: smallCat.c.key, values: val }, reason: 'Poucas categorias: boa leitura como participação no todo.' });
  const bigCat = cats.find((x) => x.n > 3) ?? cats[0];
  if (bigCat) out.push({ type: 'hbar', title: `Ranking por ${bigCat.c.name}`, config: { category: bigCat.c.key, values: val, sort: 'valueDesc', limit: 10 }, reason: 'Compare categorias em ordem.' });
  if (date && smallCat) out.push({ type: 'stackedBar', title: `${vName} por mês e ${smallCat.c.name}`, config: { category: date.key, grain: 'month', series: smallCat.c.key, values: val }, reason: 'Evolução e composição ao mesmo tempo.' });
  if (bigCat && v) out.push({ type: 'pareto', title: `Pareto de ${bigCat.c.name}`, config: { category: bigCat.c.key, values: val }, reason: 'Descubra os poucos itens que concentram a maior parte.' });
  if (nums.length >= 2) out.push({ type: 'scatter', title: `${nums[0].name} × ${nums[1].name}`, config: { values: [{ col: nums[0].key, agg: 'sum' }, { col: nums[1].key, agg: 'sum' }] }, reason: 'Relação entre duas medidas.' });
  if (v) out.push({ type: 'histogram', title: `Distribuição de ${vName}`, config: { values: val, bins: 10 }, reason: 'Veja como os valores se distribuem.' });
  if (cats.length >= 2 && cats[1].n <= 12) out.push({ type: 'heatmap', title: `${cats[0].c.name} × ${cats[1].c.name}`, config: { category: cats[1].c.key, series: cats[0].c.key, values: val }, reason: 'Cruze duas dimensões.' });
  return out;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface FinanceMapping { date?: string; description?: string; amount?: string; type?: string; category?: string; account?: string; method?: string; status?: string; income?: string; expense?: string }

/** Detecta colunas típicas de extrato/planilha financeira. */
export function detectFinanceMapping(cols: Column[]): { mapping: FinanceMapping; score: number } {
  const find = (re: RegExp, pred: (c: Column) => boolean = () => true) => cols.find((c) => re.test(norm(c.name)) && pred(c))?.key;
  const m: FinanceMapping = {
    date: find(/data|date|dia|vencimento|lancamento/, (c) => c.type === 'date') ?? cols.find((c) => c.type === 'date')?.key,
    description: find(/descri|historico|memo|detalhe|estabelecimento|titulo|nome/),
    amount: find(/^valor|amount|montante|quantia|^total/, (c) => isNumericType(c.type)) ?? find(/^valor|amount|montante|quantia/),
    income: find(/^(entrada|credito|receita)s?$/, (c) => isNumericType(c.type)),
    expense: find(/^(saida|debito|despesa)s?$/, (c) => isNumericType(c.type)),
    type: find(/^tipo|natureza|entrada.?saida|credito.?debito|^d\/c$/),
    category: find(/categoria|category|classifica|grupo/),
    account: find(/conta|carteira|banco|account/),
    method: find(/forma|pagamento|meio|metodo/),
    status: find(/situa|status|pago/),
  };
  const score = (m.date ? 2 : 0) + (m.amount || m.income || m.expense ? 2 : 0) + (m.description ? 1 : 0) + (m.category ? 1 : 0) + (m.type ? 1 : 0);
  return { mapping: m, score };
}
