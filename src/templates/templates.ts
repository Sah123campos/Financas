// Modelos prontos: planilhas de exemplo + dashboards configurados.
import type { Dashboard, Dataset, Row, Transaction, Recurring, Budget, Goal } from '@/db/types';
import { uid } from '@/lib/id';
import { buildWidgets } from './layout';
import { FINANCE_DATASET_ID } from '@/finance/financeDataset';
import { addDays, format, startOfMonth, subMonths } from 'date-fns';

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const realized = ['Pago', 'Recebido'];

function dataset(name: string, columns: Dataset['columns'], rows: Omit<Row, '_id'>[], source = 'Modelo pronto'): Dataset {
  const now = Date.now();
  return { id: uid('ds'), name, columns, rows: rows.map((r) => ({ _id: uid(), ...r })) as Row[], source, createdAt: now, updatedAt: now };
}
function dashboard(name: string, description: string, widgets: Dashboard['widgets']): Dashboard {
  const now = Date.now();
  return { id: uid('db'), name, description, widgets, filters: [], createdAt: now, updatedAt: now };
}

export interface Template {
  id: string; name: string; description: string; icon: string; tags: string[];
  build: () => { datasets: Dataset[]; dashboard: Dashboard; finance?: boolean };
}

export function financeDashboard(): Dashboard {
  const real = [{ col: 'situacao', op: 'in' as const, value: realized }];
  const desp = [...real, { col: 'tipo', op: 'eq' as const, value: 'Despesa' }];
  return dashboard('Minhas finanças', 'Visão analítica dos lançamentos efetivados (pagos e recebidos).', buildWidgets(FINANCE_DATASET_ID, [
    ['kpi', 'Receitas', { values: [{ col: 'receita', agg: 'sum' }], filters: real }, [3, 3]],
    ['kpi', 'Despesas', { values: [{ col: 'despesa', agg: 'sum' }], filters: real }, [3, 3]],
    ['kpi', 'Resultado', { values: [{ col: 'valor_sinal', agg: 'sum' }], filters: real }, [3, 3]],
    ['kpi', 'Lançamentos', { values: [{ col: '', agg: 'count' }], filters: real }, [3, 3]],
    ['groupedBar', 'Receitas × despesas por mês', { category: 'data', grain: 'month', values: [{ col: 'receita', agg: 'sum', label: 'Receitas' }, { col: 'despesa', agg: 'sum', label: 'Despesas' }], filters: real }, [8, 8]],
    ['donut', 'Para onde vai o dinheiro', { category: 'categoria', values: [{ col: 'despesa', agg: 'sum' }], filters: desp }, [4, 8]],
    ['stackedBar', 'Despesas por categoria ao longo do tempo', { category: 'data', grain: 'month', series: 'categoria', values: [{ col: 'despesa', agg: 'sum' }], filters: desp }, [8, 8]],
    ['hbar', 'Formas de pagamento', { category: 'forma', values: [{ col: 'despesa', agg: 'sum' }], filters: desp, sort: 'valueDesc' }, [4, 8]],
    ['pareto', 'Pareto das despesas', { category: 'categoria', values: [{ col: 'despesa', agg: 'sum' }], filters: desp }, [6, 8]],
    ['waterfall', 'Resultado mês a mês', { category: 'data', grain: 'month', values: [{ col: 'valor_sinal', agg: 'sum', label: 'Resultado' }], filters: real }, [6, 8]],
    ['table', 'Resumo por categoria', { category: 'categoria', values: [{ col: 'despesa', agg: 'sum', label: 'Total gasto' }, { col: '', agg: 'count', label: 'Lançamentos' }, { col: 'despesa', agg: 'avg', label: 'Ticket médio' }], filters: desp, sort: 'valueDesc', showTotal: true }, [12, 7]],
  ]));
}

const SALES_PRODUCTS = ['Notebook', 'Monitor', 'Teclado', 'Mouse', 'Headset', 'Cadeira', 'Webcam'];
const PRICES: Record<string, number> = { Notebook: 4200, Monitor: 1100, Teclado: 220, Mouse: 120, Headset: 380, Cadeira: 1500, Webcam: 290 };

export const TEMPLATES: Template[] = [
  {
    id: 'finance', name: 'Finanças pessoais', icon: 'Wallet', tags: ['Financeiro', 'Pessoal', 'Familiar'],
    description: 'Dashboard conectado à Gestão financeira: receitas × despesas, categorias, formas de pagamento e resultado mensal.',
    build: () => ({ datasets: [], dashboard: financeDashboard(), finance: true }),
  },
  {
    id: 'sales', name: 'Análise de vendas', icon: 'ShoppingCart', tags: ['Vendas', 'Empresa'],
    description: 'Receita por produto, região e vendedor, evolução mensal, Pareto e mapa de calor.',
    build: () => {
      const r = rng(42), rows: Omit<Row, '_id'>[] = [];
      const start = subMonths(startOfMonth(new Date()), 11);
      for (let i = 0; i < 420; i++) {
        const p = pick(r, SALES_PRODUCTS), q = 1 + Math.floor(r() * (p === 'Mouse' || p === 'Teclado' ? 8 : 3));
        const price = PRICES[p] * (0.9 + r() * 0.2);
        rows.push({ data: iso(addDays(start, Math.floor(r() * 360))), produto: p, regiao: pick(r, ['Sudeste', 'Sul', 'Nordeste', 'Centro-Oeste', 'Norte']), vendedor: pick(r, ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa']), quantidade: q, receita: Math.round(q * price * 100) / 100, custo: Math.round(q * price * (0.55 + r() * 0.15) * 100) / 100 });
      }
      const ds = dataset('Vendas (exemplo)', [
        { key: 'data', name: 'Data', type: 'date' }, { key: 'produto', name: 'Produto', type: 'text' }, { key: 'regiao', name: 'Região', type: 'text' },
        { key: 'vendedor', name: 'Vendedor', type: 'text' }, { key: 'quantidade', name: 'Quantidade', type: 'number' }, { key: 'receita', name: 'Receita', type: 'currency' }, { key: 'custo', name: 'Custo', type: 'currency' },
      ], rows);
      return {
        datasets: [ds],
        dashboard: dashboard('Vendas', 'Desempenho comercial dos últimos 12 meses.', buildWidgets(ds.id, [
          ['kpi', 'Receita total', { values: [{ col: 'receita', agg: 'sum' }] }],
          ['kpi', 'Itens vendidos', { values: [{ col: 'quantidade', agg: 'sum' }] }],
          ['kpi', 'Ticket médio', { values: [{ col: 'receita', agg: 'avg' }] }],
          ['kpi', 'Meta anual de receita', { values: [{ col: 'receita', agg: 'sum' }], target: 2_000_000 }, [3, 3]],
          ['combo', 'Receita e custo por mês', { category: 'data', grain: 'month', values: [{ col: 'receita', agg: 'sum', as: 'bar' }, { col: 'custo', agg: 'sum', as: 'line' }] }, [8, 8]],
          ['pie', 'Receita por região', { category: 'regiao', values: [{ col: 'receita', agg: 'sum' }] }, [4, 8]],
          ['pareto', 'Pareto de produtos', { category: 'produto', values: [{ col: 'receita', agg: 'sum' }] }, [6, 8]],
          ['heatmap', 'Região × produto', { category: 'produto', series: 'regiao', values: [{ col: 'receita', agg: 'sum' }] }, [6, 8]],
          ['hbar', 'Ranking de vendedores', { category: 'vendedor', values: [{ col: 'receita', agg: 'sum' }], sort: 'valueDesc', showLabels: true, drillTo: 'produto' }, [6, 7]],
          ['scatter', 'Quantidade × receita', { values: [{ col: 'quantidade', agg: 'sum' }, { col: 'receita', agg: 'sum' }], zoom: true }, [6, 7]],
          ['pivot', 'Tabela dinâmica: vendedor × região', { category: 'vendedor', series: 'regiao', values: [{ col: 'receita', agg: 'sum' }], showTotal: true }, [12, 7]],
        ])),
      };
    },
  },
  {
    id: 'business', name: 'Despesas empresariais', icon: 'Building2', tags: ['Empresa', 'Financeiro'],
    description: 'Custos por centro de custo, fornecedores e status de pagamento, com evolução trimestral.',
    build: () => {
      const r = rng(7), rows: Omit<Row, '_id'>[] = [];
      const start = subMonths(startOfMonth(new Date()), 11);
      const cc = ['Administrativo', 'Comercial', 'Operações', 'TI', 'Marketing'];
      const forn = ['Fornecedor Alfa', 'Beta Serviços', 'Gama Tech', 'Delta Logística', 'Ômega Mídia', 'Sigma Energia'];
      for (let i = 0; i < 300; i++) rows.push({ data: iso(addDays(start, Math.floor(r() * 360))), centro: pick(r, cc), fornecedor: pick(r, forn), categoria: pick(r, ['Serviços', 'Materiais', 'Software', 'Viagens', 'Utilidades']), valor: Math.round((200 + r() * 6000) * 100) / 100, status: r() > 0.18 ? 'Pago' : r() > 0.5 ? 'Pendente' : 'Atrasado' });
      const ds = dataset('Despesas da empresa (exemplo)', [
        { key: 'data', name: 'Data', type: 'date' }, { key: 'centro', name: 'Centro de custo', type: 'text' }, { key: 'fornecedor', name: 'Fornecedor', type: 'text' },
        { key: 'categoria', name: 'Categoria', type: 'text' }, { key: 'valor', name: 'Valor', type: 'currency' }, { key: 'status', name: 'Status', type: 'text' },
      ], rows);
      return {
        datasets: [ds],
        dashboard: dashboard('Despesas empresariais', 'Controle de custos por área e fornecedor.', buildWidgets(ds.id, [
          ['kpi', 'Total de despesas', { values: [{ col: 'valor', agg: 'sum' }] }],
          ['kpi', 'Em aberto', { values: [{ col: 'valor', agg: 'sum' }], filters: [{ col: 'status', op: 'neq', value: 'Pago' }] }],
          ['kpi', 'Maior despesa', { values: [{ col: 'valor', agg: 'max' }] }],
          ['kpi', 'Fornecedores', { values: [{ col: 'fornecedor', agg: 'countDistinct' }] }],
          ['stackedBar', 'Despesas por trimestre e centro de custo', { category: 'data', grain: 'quarter', series: 'centro', values: [{ col: 'valor', agg: 'sum' }] }, [8, 8]],
          ['donut', 'Situação dos pagamentos', { category: 'status', values: [{ col: 'valor', agg: 'sum' }] }, [4, 8]],
          ['hbar', 'Fornecedores', { category: 'fornecedor', values: [{ col: 'valor', agg: 'sum' }], sort: 'valueDesc' }, [6, 7]],
          ['stackedArea', 'Evolução por categoria', { category: 'data', grain: 'month', series: 'categoria', values: [{ col: 'valor', agg: 'sum' }] }, [6, 7]],
          ['histogram', 'Distribuição dos valores', { values: [{ col: 'valor', agg: 'sum' }], bins: 12 }, [6, 7]],
          ['radar', 'Perfil por centro de custo', { category: 'centro', values: [{ col: 'valor', agg: 'sum', label: 'Total' }, { col: 'valor', agg: 'avg', label: 'Média' }] }, [6, 7]],
        ])),
      };
    },
  },
  {
    id: 'stock', name: 'Controle de estoque', icon: 'Package', tags: ['Estoque', 'Empresa'],
    description: 'Quantidades, valor imobilizado e itens abaixo do estoque mínimo.',
    build: () => {
      const r = rng(99), rows: Omit<Row, '_id'>[] = [];
      const items = ['Parafuso', 'Porca', 'Arruela', 'Cabo 2m', 'Conector', 'Fusível', 'Disjuntor', 'Tomada', 'Interruptor', 'Lâmpada LED', 'Fita isolante', 'Abraçadeira', 'Canaleta', 'Relé'];
      items.forEach((p) => { const qtd = Math.floor(r() * 500); const min = 50 + Math.floor(r() * 100); const cu = Math.round((0.5 + r() * 60) * 100) / 100; rows.push({ produto: p, categoria: pick(r, ['Fixação', 'Elétrica', 'Iluminação', 'Acessórios']), quantidade: qtd, minimo: min, custo: cu, valor_estoque: Math.round(qtd * cu * 100) / 100, situacao: qtd < min ? 'Repor' : 'OK' }); });
      const ds = dataset('Estoque (exemplo)', [
        { key: 'produto', name: 'Produto', type: 'text' }, { key: 'categoria', name: 'Categoria', type: 'text' }, { key: 'quantidade', name: 'Quantidade', type: 'number' },
        { key: 'minimo', name: 'Estoque mínimo', type: 'number' }, { key: 'custo', name: 'Custo unitário', type: 'currency' }, { key: 'valor_estoque', name: 'Valor em estoque', type: 'currency' }, { key: 'situacao', name: 'Situação', type: 'text' },
      ], rows);
      return {
        datasets: [ds],
        dashboard: dashboard('Estoque', 'Posição atual do estoque.', buildWidgets(ds.id, [
          ['kpi', 'Valor em estoque', { values: [{ col: 'valor_estoque', agg: 'sum' }] }],
          ['kpi', 'Itens a repor', { values: [{ col: '', agg: 'count' }], filters: [{ col: 'situacao', op: 'eq', value: 'Repor' }] }],
          ['kpi', 'Unidades', { values: [{ col: 'quantidade', agg: 'sum' }] }],
          ['kpi', 'Produtos', { values: [{ col: '', agg: 'count' }] }],
          ['groupedBar', 'Quantidade × estoque mínimo', { category: 'produto', values: [{ col: 'quantidade', agg: 'sum' }, { col: 'minimo', agg: 'sum' }], sort: 'valueDesc' }, [8, 8]],
          ['donut', 'Valor por categoria', { category: 'categoria', values: [{ col: 'valor_estoque', agg: 'sum' }] }, [4, 8]],
          ['scatter', 'Custo unitário × quantidade', { values: [{ col: 'custo', agg: 'sum' }, { col: 'quantidade', agg: 'sum' }], series: 'situacao' }, [6, 7]],
          ['table', 'Itens a repor', { category: 'produto', values: [{ col: 'quantidade', agg: 'sum' }, { col: 'minimo', agg: 'sum' }], filters: [{ col: 'situacao', op: 'eq', value: 'Repor' }] }, [6, 7]],
        ])),
      };
    },
  },
  {
    id: 'study', name: 'Desempenho nos estudos', icon: 'GraduationCap', tags: ['Estudos', 'Pessoal'],
    description: 'Notas por disciplina, horas de estudo e evolução ao longo do semestre.',
    build: () => {
      const r = rng(3), rows: Omit<Row, '_id'>[] = [];
      const start = subMonths(startOfMonth(new Date()), 5);
      const disc = ['Matemática', 'Português', 'História', 'Física', 'Química', 'Inglês'];
      for (let i = 0; i < 90; i++) { const h = Math.round((1 + r() * 9) * 10) / 10; rows.push({ data: iso(addDays(start, Math.floor(r() * 175))), disciplina: pick(r, disc), avaliacao: pick(r, ['Prova', 'Trabalho', 'Simulado']), horas: h, nota: Math.min(10, Math.round((4 + h * 0.5 + r() * 2) * 10) / 10) }); }
      const ds = dataset('Estudos (exemplo)', [
        { key: 'data', name: 'Data', type: 'date' }, { key: 'disciplina', name: 'Disciplina', type: 'text' }, { key: 'avaliacao', name: 'Avaliação', type: 'text' },
        { key: 'horas', name: 'Horas de estudo', type: 'number' }, { key: 'nota', name: 'Nota', type: 'number' },
      ], rows);
      return {
        datasets: [ds],
        dashboard: dashboard('Estudos', 'Acompanhamento do semestre.', buildWidgets(ds.id, [
          ['kpi', 'Média geral', { values: [{ col: 'nota', agg: 'avg' }], decimals: 1 }],
          ['kpi', 'Horas estudadas', { values: [{ col: 'horas', agg: 'sum' }], decimals: 1 }],
          ['kpi', 'Avaliações', { values: [{ col: '', agg: 'count' }] }],
          ['gauge', 'Meta de horas no semestre', { values: [{ col: 'horas', agg: 'sum' }], target: 600, decimals: 0 }, [3, 3]],
          ['radar', 'Média por disciplina', { category: 'disciplina', values: [{ col: 'nota', agg: 'avg', label: 'Média' }], decimals: 1 }, [4, 8]],
          ['line', 'Evolução da média', { category: 'data', grain: 'month', values: [{ col: 'nota', agg: 'avg' }], series: 'avaliacao', decimals: 1 }, [8, 8]],
          ['scatter', 'Horas × nota', { values: [{ col: 'horas', agg: 'sum' }, { col: 'nota', agg: 'sum' }], decimals: 1 }, [6, 7]],
          ['progress', 'Horas por disciplina (meta 100h)', { category: 'disciplina', values: [{ col: 'horas', agg: 'sum' }], target: 100, decimals: 0 }, [6, 7]],
        ])),
      };
    },
  },
  {
    id: 'funnel', name: 'Funil comercial', icon: 'Filter', tags: ['Vendas', 'Empresa'],
    description: 'Conversão entre etapas do processo de vendas.',
    build: () => {
      const r = rng(11), rows: Omit<Row, '_id'>[] = [];
      const etapas = ['1. Lead', '2. Contato', '3. Proposta', '4. Negociação', '5. Fechado'];
      for (let i = 0; i < 400; i++) { let e = 0; while (e < 4 && r() > 0.38) e++; rows.push({ etapa: etapas[e], origem: pick(r, ['Site', 'Indicação', 'Redes sociais', 'Evento']), valor: Math.round((500 + r() * 9500) * 100) / 100 }); }
      // cada oportunidade passa pelas etapas anteriores
      const expanded: Omit<Row, '_id'>[] = rows.flatMap((x) => etapas.slice(0, etapas.indexOf(String(x.etapa)) + 1).map((et) => ({ ...x, etapa: et })));
      const ds = dataset('Funil comercial (exemplo)', [
        { key: 'etapa', name: 'Etapa', type: 'text' }, { key: 'origem', name: 'Origem', type: 'text' }, { key: 'valor', name: 'Valor potencial', type: 'currency' },
      ], expanded);
      return {
        datasets: [ds],
        dashboard: dashboard('Funil comercial', 'Oportunidades em cada etapa.', buildWidgets(ds.id, [
          ['funnel', 'Funil de oportunidades', { category: 'etapa', values: [{ col: '', agg: 'count' }] }, [6, 9]],
          ['stackedBar', 'Etapas por origem', { category: 'etapa', series: 'origem', values: [{ col: '', agg: 'count' }], sort: 'labelAsc' }, [6, 9]],
        ])),
      };
    },
  },
];

/** Dados financeiros de exemplo (6 meses + recorrências futuras). */
export function sampleFinance(): { transactions: Transaction[]; recurring: Recurring[]; budgets: Budget[]; goals: Goal[] } {
  const r = rng(2024), now = Date.now();
  const txs: Transaction[] = [];
  const add = (date: Date, description: string, amount: number, type: 'income' | 'expense', categoryId: string, paymentMethod: string, accountId = 'acc_corrente') => {
    const d = iso(date);
    const future = d > iso(new Date());
    txs.push({ id: uid('tx'), description, amount: Math.round(amount * 100) / 100, type, categoryId, date: d, accountId, paymentMethod, status: future ? (type === 'income' ? 'planned' : 'pending') : type === 'income' ? 'received' : 'paid', createdAt: now, updatedAt: now });
  };
  const first = subMonths(startOfMonth(new Date()), 5);
  const recurring: Recurring[] = [
    { id: uid('rec'), description: 'Salário', amount: 5200, type: 'income', categoryId: 'cat_salario', accountId: 'acc_corrente', paymentMethod: 'Transferência', frequency: 'monthly', startDate: iso(addDays(first, 4)), skipped: [], active: true, createdAt: now },
    { id: uid('rec'), description: 'Aluguel', amount: 1650, type: 'expense', categoryId: 'cat_moradia', accountId: 'acc_corrente', paymentMethod: 'Boleto', frequency: 'monthly', startDate: iso(addDays(first, 9)), skipped: [], active: true, createdAt: now },
    { id: uid('rec'), description: 'Internet', amount: 119.9, type: 'expense', categoryId: 'cat_moradia', accountId: 'acc_corrente', paymentMethod: 'Débito automático', frequency: 'monthly', startDate: iso(addDays(first, 14)), skipped: [], active: true, createdAt: now },
    { id: uid('rec'), description: 'Streaming', amount: 55.9, type: 'expense', categoryId: 'cat_assinaturas', accountId: 'acc_corrente', paymentMethod: 'Cartão de crédito', frequency: 'monthly', startDate: iso(addDays(first, 19)), skipped: [], active: true, createdAt: now },
    { id: uid('rec'), description: 'Curso de inglês', amount: 289, type: 'expense', categoryId: 'cat_educacao', accountId: 'acc_corrente', paymentMethod: 'Cartão de crédito', frequency: 'monthly', startDate: iso(addDays(first, 7)), installments: 10, skipped: [], active: true, createdAt: now },
  ];
  for (let m = 0; m < 6; m++) {
    const ms = subMonths(startOfMonth(new Date()), 5 - m);
    for (let w = 0; w < 4; w++) add(addDays(ms, w * 7 + 2), pick(r, ['Supermercado', 'Feira', 'Mercado do bairro']), 180 + r() * 220, 'expense', 'cat_alimentacao', pick(r, ['Cartão de débito', 'Pix']));
    for (let k = 0; k < 5; k++) add(addDays(ms, Math.floor(r() * 27)), pick(r, ['Restaurante', 'Lanche', 'Delivery', 'Padaria']), 25 + r() * 90, 'expense', 'cat_alimentacao', pick(r, ['Cartão de crédito', 'Pix']));
    for (let k = 0; k < 4; k++) add(addDays(ms, Math.floor(r() * 27)), pick(r, ['Combustível', 'Aplicativo de transporte', 'Ônibus']), 30 + r() * 160, 'expense', 'cat_transporte', pick(r, ['Cartão de crédito', 'Pix', 'Cartão de débito']));
    add(addDays(ms, 11), 'Conta de energia', 140 + r() * 80, 'expense', 'cat_moradia', 'Boleto');
    add(addDays(ms, 12), 'Conta de água', 60 + r() * 40, 'expense', 'cat_moradia', 'Boleto');
    add(addDays(ms, 15), 'Farmácia', 40 + r() * 120, 'expense', 'cat_saude', 'Cartão de débito');
    if (r() > 0.3) add(addDays(ms, 20), pick(r, ['Cinema', 'Show', 'Passeio', 'Bar com amigos']), 60 + r() * 200, 'expense', 'cat_lazer', 'Cartão de crédito');
    if (r() > 0.4) add(addDays(ms, 18), pick(r, ['Roupas', 'Eletrônico', 'Casa e decoração']), 90 + r() * 400, 'expense', 'cat_compras', 'Cartão de crédito');
    if (r() > 0.45) add(addDays(ms, 22), 'Projeto freelance', 600 + r() * 1400, 'income', 'cat_freela', 'Pix');
    add(addDays(ms, 6), 'Aporte em investimentos', 400, 'expense', 'cat_investimentos', 'Transferência');
  }
  const budgets: Budget[] = [
    { id: uid('bud'), categoryId: 'cat_alimentacao', limit: 1300, createdAt: now },
    { id: uid('bud'), categoryId: 'cat_transporte', limit: 450, createdAt: now },
    { id: uid('bud'), categoryId: 'cat_lazer', limit: 250, createdAt: now },
    { id: uid('bud'), categoryId: 'cat_compras', limit: 300, createdAt: now },
  ];
  const goals: Goal[] = [
    { id: uid('goal'), name: 'Economizar todo mês', kind: 'monthly_saving', target: 800, current: 0, color: '#0ca30c', createdAt: now },
    { id: uid('goal'), name: 'Reserva de emergência', kind: 'reserve', target: 20000, current: 7400, deadline: iso(subMonths(new Date(), -14)), color: '#2a78d6', createdAt: now },
    { id: uid('goal'), name: 'Viagem de férias', kind: 'purchase', target: 6000, current: 1850, deadline: iso(subMonths(new Date(), -8)), color: '#6250d6', createdAt: now },
  ];
  return { transactions: txs, recurring, budgets, goals };
}
