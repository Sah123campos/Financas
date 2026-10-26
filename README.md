# Painel Finanças

Plataforma web de **gestão financeira, planilhas e dashboards interativos**, inspirada no Power BI e no Excel, com uma interface simples. Funciona inteiramente no navegador: **não exige conta nem servidor**.

## Como rodar

```bash
npm install
npm run dev        # desenvolvimento (http://localhost:5173)
npm run build      # build de produção em dist/ (hospedagem estática)
npm run preview    # serve o build localmente
npm test           # testes unitários (Vitest)
npm run typecheck  # verificação de tipos
```

O build é estático (`base: './'`) e pode ser publicado em qualquer hospedagem de arquivos (GitHub Pages, Netlify, S3…). O roteamento usa `#/` e funciona sem configuração de servidor.

## O que tem

| Área | Recursos |
|---|---|
| **Meus projetos** | Ao importar uma planilha, o projeto (planilha + dashboard com gráficos sugeridos) é criado e aberto na hora. A página **Meus projetos** (menu e tela inicial) lista todos os projetos salvos no aparelho, com busca, renomear, excluir e as planilhas que ainda não têm projeto. |
| **Visão geral** | Boas-vindas para iniciantes, atalhos, resumo financeiro do mês, dashboards e planilhas recentes, modelos. |
| **Gestão financeira** | Formulário rápido (só o valor é obrigatório), categorias com cor/ícone, contas/carteiras, situação (pago/recebido/pendente/previsto), recorrências e parcelamentos sem duplicação, orçamentos com alertas (80% e 100%), metas (economia mensal, compra, reserva), saldo atual, comparação com o período anterior, despesas ÷ receitas, “quanto posso gastar”, projeção de saldo, pendências e atrasos, comparativo com o mês anterior, importação de extrato. |
| **Planilhas** | Importação de XLSX/XLS/ODS, CSV/TSV (detecta UTF-8/Windows-1252), JSON e dados colados; escolha de aba e colunas; detecção de cabeçalhos e tipos (número, moeda, %, data, sim/não, texto) com formato brasileiro; relatório de vazios e valores inválidos (nada é descartado em silêncio); editor com ordenação, filtros, pesquisa, seleção múltipla, duplicação, desfazer/refazer, salvamento automático, exportação XLSX/CSV/JSON. |
| **Dashboards** | 23 visualizações: barras (vertical, horizontal, empilhadas, agrupadas), linhas, áreas, áreas empilhadas, evolução temporal, barras+linha, pizza, rosca, dispersão, histograma, Pareto, cascata, radar, funil, mapa de calor, tabela resumida, tabela dinâmica, KPI, medidor e progresso. Validação de adequação com explicação e alternativa sugerida. Editor visual com campos arrastáveis (Categoria, Valores, Legenda, Filtros) e prévia imediata. Filtros cruzados, drill-down (ano → trimestre → mês → dia, e por coluna configurável), drill-through para os registros, zoom, legendas clicáveis, alternância de visualização, visualização em tabela, exportação PNG, filtros de período/coluna salvos, layout arrastável/redimensionável, modo edição × apresentação, tela cheia. |
| **Modelos** | Finanças pessoais, vendas, despesas empresariais, estoque, estudos e funil comercial. |
| **Compartilhamento** | Link somente leitura ou arquivo `.painel.json`, com escolha de gráficos e colunas e importação de cópia. |
| **Configurações** | Tema claro/escuro/sistema, redução de movimento, moeda e formato regional, backup/restauração, CSV, armazenamento persistente, exclusão de dados. |

## Arquitetura

```
src/
  db/            Dexie (IndexedDB): schema, tipos, repositórios, backup/restauração (Zod)
  data/          interpretação de valores, importadores, motor de filtros/agregações, sugestões
  charts/        metadados e validação dos gráficos, construtor de opções ECharts, paleta
  finance/       regras financeiras puras (métricas, recorrência), planilha virtual de lançamentos
  share/         empacotamento, compactação e validação de compartilhamentos
  state/         preferências (localStorage), roteador, toasts, indicador de salvamento
  features/      telas: finance/, datasets/, dashboards/, share/
  components/    UI acessível (modal, menus, botões…) e layout (barra lateral / navegação móvel)
  templates/     modelos prontos e dados de exemplo
tests/           testes do motor de dados, finanças e compartilhamento
```

- **Persistência:** IndexedDB (via Dexie) guarda lançamentos, categorias, contas, recorrências, orçamentos, metas, planilhas, dashboards (com layout, configurações e filtros salvos) e histórico de compartilhamentos. `localStorage` guarda só preferências leves. Toda escrita passa por `db/repo.ts`, que alimenta o indicador “Salvando… / Salvo / Erro” e traduz falhas (ex.: cota esgotada).
- **Lançamentos nos dashboards:** os lançamentos aparecem como a planilha virtual “Lançamentos financeiros”, sempre atualizada; editar dados em qualquer lugar atualiza os gráficos automaticamente (consultas reativas do Dexie).
- **Recorrências:** as ocorrências são materializadas como lançamentos **previstos** até 3 meses à frente. O índice único `[recurringId+occurrence]` e a lista `skipped` impedem duplicações e a recriação de ocorrências excluídas.
- **Gráficos:** Apache ECharts (licença Apache-2.0), importado de forma modular. Paleta categórica com ordem fixa, validada para daltonismo; cores semânticas (verde = receita, vermelho = despesa) sempre acompanhadas de ícone/texto.

## Compartilhamento — como funciona e limites

Foi adotada a **opção B (sem servidor)**:

1. O dashboard escolhido e **apenas os dados necessários** (colunas usadas, ou todas, à escolha; filtros opcionais; colunas sensíveis podem ser removidas — a descrição dos lançamentos já vem desmarcada) viram um pacote JSON validado com Zod.
2. O pacote é compactado (lz-string) e colocado **no fragmento `#` do link**. O fragmento não é enviado a nenhum servidor; quem abre o link reconstrói o dashboard no próprio navegador, em outro dispositivo, sem acesso aos dados privados de quem compartilhou.
3. Para dados grandes (ou quando o link ficaria longo demais para apps de mensagem), gera-se um **arquivo `.painel.json`** importável.

Limitações explicadas ao usuário na interface: a cópia **não se atualiza** com alterações do original; links **não podem ser revogados** (não há infraestrutura que controle o acesso); qualquer pessoa com o link vê os dados incluídos — por isso há consentimento explícito antes de gerar. Uma evolução com backend (opção A: API + PostgreSQL com IDs de publicação, revogação e expiração) pode ser adicionada sem alterar a camada local, pois o formato do pacote já é validado e versionado.

## Offline e PWA

Manifesto e service worker (`public/sw.js`) permitem instalar o app e usá-lo offline após o primeiro acesso. Tudo funciona sem internet — inclusive abrir links compartilhados já carregados.

## Acessibilidade

Navegação por teclado com foco visível, link “pular para o conteúdo”, modais com foco preso e Esc, rótulos e `aria-*` em controles e ícones, gráficos com descrição textual e alternativa em tabela (“Ver dados”), estados nunca indicados só por cor (ícones ▲▼, ⚠, ✓ e textos), opção de reduzir movimento (e respeito a `prefers-reduced-motion`), contraste verificado nos dois temas.

## Avisos

- Os dados ficam **somente neste navegador**. Podem ser perdidos ao limpar os dados de navegação, no modo privado ou ao trocar de dispositivo — exporte backups em Configurações.
- Projeções e sugestões financeiras são estimativas baseadas apenas nos lançamentos informados, não recomendações.
- A leitura de Excel usa `xlsx@0.18.5` (versão publicada no npm). Ela tem avisos de segurança conhecidos ao processar arquivos maliciosos; como tudo roda no navegador do próprio usuário, com arquivos que ele escolhe, o risco é baixo. Quando possível, prefira a versão mais recente distribuída em `cdn.sheetjs.com`.
