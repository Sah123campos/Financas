// Editor de tabelas inspirado em planilhas: edição de células, linhas/colunas, ordenação, filtros,
// pesquisa, seleção múltipla, duplicação, desfazer/refazer, salvamento automático e exportação.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Papa from 'papaparse';
import { db } from '@/db/schema';
import type { CellValue, Column, ColumnType, Dataset, Row } from '@/db/types';
import { deleteDataset, saveDataset } from '@/db/repo';
import { download } from '@/db/backup';
import { coerce, TYPE_LABELS, isNumericType } from '@/data/values';
import { slugKey } from '@/data/importers';
import { formatCell } from './cells';
import { useHistory } from './useHistory';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem, Spinner, EmptyState, Badge } from '@/components/ui/misc';
import { Modal } from '@/components/ui/Modal';
import { confirmDialog } from '@/components/ui/confirm';
import { navigate } from '@/state/router';
import { toast } from '@/state/toast';
import { uid } from '@/lib/id';
import { suggestCharts } from '@/data/suggest';
import { buildWidgets } from '@/templates/layout';
import { saveDashboard } from '@/db/repo';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Copy, Download, Filter, LayoutDashboard, MoreVertical, Plus, Redo2, Search, Trash2, Undo2, X, Columns3, Rows3 } from 'lucide-react';

const PAGE = 100;
interface Doc { name: string; columns: Column[]; rows: Row[] }

export function DatasetEditorPage({ id }: { id: string }) {
  const ds = useLiveQuery(() => db.datasets.get(id), [id]);
  if (ds === undefined) return <Spinner />;
  if (!ds) return <EmptyState title="Planilha não encontrada" action={<Button onClick={() => navigate('/planilhas')}>Voltar</Button>} />;
  return <DatasetEditor key={id} dataset={ds} />;
}

export function NewDatasetPage() {
  useEffect(() => {
    const now = Date.now();
    const columns: Column[] = [{ key: 'data', name: 'Data', type: 'date' }, { key: 'descricao', name: 'Descrição', type: 'text' }, { key: 'categoria', name: 'Categoria', type: 'text' }, { key: 'valor', name: 'Valor', type: 'currency' }];
    const ds: Dataset = { id: uid('ds'), name: 'Nova planilha', columns, rows: Array.from({ length: 5 }, () => ({ _id: uid(), data: null, descricao: null, categoria: null, valor: null })), source: 'Digitada manualmente', createdAt: now, updatedAt: now };
    saveDataset(ds).then(() => navigate(`/planilhas/${ds.id}`, true));
  }, []);
  return <Spinner label="Criando planilha…" />;
}

function DatasetEditor({ dataset }: { dataset: Dataset }) {
  const h = useHistory<Doc>({ name: dataset.name, columns: dataset.columns, rows: dataset.rows });
  const { state: doc } = h;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [colDialog, setColDialog] = useState<Column | 'new' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cards, setCards] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const first = useRef(true);

  // salvamento automático (com debounce)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => saveDataset({ ...dataset, name: doc.name, columns: doc.columns, rows: doc.rows }).catch((e) => toast(e.message, 'error')), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // atalhos de teclado: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if ((e.target as HTMLElement).tagName === 'INPUT' && !(e.target as HTMLElement).dataset.cell) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); h.undo(); }
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); h.redo(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [h]);

  const view = useMemo(() => {
    let rows = doc.rows;
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((r) => doc.columns.some((c) => formatCell(r[c.key], c.type).toLowerCase().includes(s) || String(r[c.key] ?? '').toLowerCase().includes(s)));
    for (const [k, v] of Object.entries(colFilters)) {
      if (!v) continue;
      const c = doc.columns.find((x) => x.key === k); if (!c) continue;
      const vv = v.toLowerCase();
      rows = rows.filter((r) => formatCell(r[k], c.type).toLowerCase().includes(vv) || (vv === '(vazio)' && (r[k] == null || r[k] === '')));
    }
    if (sort) {
      rows = [...rows].sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        if (x == null || x === '') return 1; if (y == null || y === '') return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * sort.dir;
      });
    }
    return rows;
  }, [doc, q, colFilters, sort]);
  const pages = Math.max(1, Math.ceil(view.length / PAGE));
  const pageRows = view.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [page, pages]);

  // ----- operações -----
  const setCell = (rid: string, key: string, value: CellValue) => h.set((d) => ({ ...d, rows: d.rows.map((r) => (r._id === rid ? { ...r, [key]: value } : r)) }));
  const addRow = (after?: string) => h.set((d) => {
    const nr: Row = { _id: uid() }; d.columns.forEach((c) => (nr[c.key] = null));
    if (!after) return { ...d, rows: [...d.rows, nr] };
    const i = d.rows.findIndex((r) => r._id === after);
    return { ...d, rows: [...d.rows.slice(0, i + 1), nr, ...d.rows.slice(i + 1)] };
  });
  const removeRows = (ids: string[]) => { h.set((d) => ({ ...d, rows: d.rows.filter((r) => !ids.includes(r._id)) })); setSelected(new Set()); toast(`${ids.length} linha(s) excluída(s).`, 'info', { label: 'Desfazer', run: h.undo }); };
  const duplicateRows = (ids: string[]) => { h.set((d) => { const out: Row[] = []; d.rows.forEach((r) => { out.push(r); if (ids.includes(r._id)) out.push({ ...r, _id: uid() }); }); return { ...d, rows: out }; }); setSelected(new Set()); };
  const saveColumn = (orig: Column | null, name: string, type: ColumnType) => {
    h.set((d) => {
      if (!orig) {
        const used = new Set(d.columns.map((c) => c.key));
        const key = slugKey(name, used);
        return { ...d, columns: [...d.columns, { key, name, type }], rows: d.rows.map((r) => ({ ...r, [key]: null })) };
      }
      let lost = 0;
      const rows = orig.type === type ? d.rows : d.rows.map((r) => { const c = coerce(r[orig.key] == null ? null : formatRawForRetype(r[orig.key], orig.type), type); if (!c.ok) lost++; return { ...r, [orig.key]: c.value }; });
      if (lost) setTimeout(() => toast(`${lost} valor(es) não puderam ser convertidos para ${TYPE_LABELS[type]} e ficaram vazios. Use “Desfazer” para reverter.`, 'warning', { label: 'Desfazer', run: h.undo }), 0);
      return { ...d, columns: d.columns.map((c) => (c.key === orig.key ? { ...c, name, type } : c)), rows };
    });
    setColDialog(null);
  };
  const removeColumn = async (c: Column) => {
    if (!(await confirmDialog({ title: `Excluir a coluna “${c.name}”?`, message: 'Os valores desta coluna serão removidos. Gráficos que a utilizam deixarão de funcionar. Você pode desfazer logo em seguida.', danger: true, confirmLabel: 'Excluir coluna' }))) return;
    h.set((d) => ({ ...d, columns: d.columns.filter((x) => x.key !== c.key), rows: d.rows.map((r) => { const { [c.key]: _drop, ...rest } = r; void _drop; return rest as Row; }) }));
  };
  const moveColumn = (c: Column, dir: -1 | 1) => h.set((d) => { const i = d.columns.findIndex((x) => x.key === c.key); const j = i + dir; if (j < 0 || j >= d.columns.length) return d; const cols = [...d.columns]; [cols[i], cols[j]] = [cols[j], cols[i]]; return { ...d, columns: cols }; });

  const exportAs = async (fmt: 'csv' | 'xlsx' | 'json') => {
    const data = doc.rows.map((r) => Object.fromEntries(doc.columns.map((c) => [c.name, r[c.key]])));
    const base = doc.name.replace(/[^\w\-]+/g, '_') || 'planilha';
    if (fmt === 'csv') download(new Blob(['﻿' + Papa.unparse(data, { delimiter: ';' })], { type: 'text/csv' }), `${base}.csv`);
    if (fmt === 'json') download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${base}.json`);
    if (fmt === 'xlsx') {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(doc.rows.map((r) => Object.fromEntries(doc.columns.map((c) => [c.name, c.type === 'date' && typeof r[c.key] === 'string' ? new Date(r[c.key] + 'T00:00:00') : r[c.key]]))));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dados'); XLSX.writeFile(wb, `${base}.xlsx`);
    }
  };
  const makeDashboard = async () => {
    const ds = { ...dataset, ...doc };
    const sugg = suggestCharts(ds).slice(0, 6);
    if (!sugg.length) return toast('Adicione colunas numéricas, de data ou categorias para gerar sugestões.', 'warning');
    const now = Date.now();
    const d = { id: uid('db'), name: `Análise: ${doc.name}`, description: '', widgets: buildWidgets(dataset.id, sugg.map((s) => [s.type, s.title, s.config, s.type === 'kpi' ? [3, 3] : [6, 7]])), filters: [], createdAt: now, updatedAt: now };
    await saveDashboard(d); navigate(`/dashboards/${d.id}`);
  };
  const removeDataset = async () => {
    const usedBy = await db.dashboards.filter((d) => d.widgets.some((w) => w.datasetId === dataset.id)).count();
    if (await confirmDialog({ title: 'Excluir planilha?', message: `“${doc.name}” será excluída permanentemente.${usedBy ? `\n${usedBy} dashboard(s) usam esta planilha e perderão os gráficos correspondentes.` : ''}`, danger: true, confirmLabel: 'Excluir' })) {
      await deleteDataset(dataset.id); toast('Planilha excluída.'); navigate('/planilhas');
    }
  };

  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r._id));
  const toggleAll = () => setSelected((s) => { const n = new Set(s); pageRows.forEach((r) => (allOnPage ? n.delete(r._id) : n.add(r._id))); return n; });
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button size="icon" variant="ghost" aria-label="Voltar" onClick={() => navigate('/planilhas')}><ArrowLeft className="h-5 w-5" /></Button>
        <input className="input h-10 font-semibold text-lg flex-1 min-w-[180px] max-w-md" value={doc.name} onChange={(e) => h.set((d) => ({ ...d, name: e.target.value }))} aria-label="Nome da planilha" />
        <div className="flex flex-wrap gap-2 ml-auto">
          <Button size="icon" aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" disabled={!h.canUndo} onClick={h.undo}><Undo2 className="h-4 w-4" /></Button>
          <Button size="icon" aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)" disabled={!h.canRedo} onClick={h.redo}><Redo2 className="h-4 w-4" /></Button>
          <Button icon={<LayoutDashboard className="h-4 w-4" />} onClick={makeDashboard}><span className="hidden sm:inline">Criar dashboard</span></Button>
          <Menu label="Exportar e mais" triggerClass="h-10 w-10 border border-border bg-surface" trigger={<MoreVertical className="h-4 w-4" />}>
            <MenuItem icon={<Download className="h-4 w-4" />} onClick={() => exportAs('xlsx')}>Exportar Excel (.xlsx)</MenuItem>
            <MenuItem icon={<Download className="h-4 w-4" />} onClick={() => exportAs('csv')}>Exportar CSV</MenuItem>
            <MenuItem icon={<Download className="h-4 w-4" />} onClick={() => exportAs('json')}>Exportar JSON</MenuItem>
            <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={removeDataset}>Excluir planilha</MenuItem>
          </Menu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-3 text-subtle" aria-hidden />
          <input className="input pl-9" placeholder="Pesquisar…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Pesquisar na planilha" />
        </div>
        <Button size="sm" icon={<Filter className="h-4 w-4" />} onClick={() => setShowFilters((s) => !s)} aria-pressed={showFilters}>Filtros por coluna{Object.values(colFilters).filter(Boolean).length ? ` (${Object.values(colFilters).filter(Boolean).length})` : ''}</Button>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => addRow()}>Linha</Button>
        <Button size="sm" icon={<Columns3 className="h-4 w-4" />} onClick={() => setColDialog('new')}>Coluna</Button>
        <Button size="sm" variant="ghost" icon={cards ? <Rows3 className="h-4 w-4" /> : <Columns3 className="h-4 w-4" />} onClick={() => setCards((c) => !c)}>{cards ? 'Ver tabela' : 'Ver cartões'}</Button>
        <span className="text-xs text-subtle">{view.length.toLocaleString('pt-BR')} de {doc.rows.length.toLocaleString('pt-BR')} linhas · {dataset.source}</span>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg bg-primary-soft text-sm animate-in" role="region" aria-label="Ações para linhas selecionadas">
          <b className="px-1">{selected.size} selecionada(s)</b>
          <Button size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => duplicateRows([...selected])}>Duplicar</Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => removeRows([...selected])}>Excluir</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
        </div>
      )}

      {cards ? (
        <ul className="space-y-2">
          {pageRows.map((r) => (
            <li key={r._id} className={`card p-3 ${selected.has(r._id) ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={selected.has(r._id)} onChange={() => toggle(r._id)} aria-label="Selecionar linha" className="h-5 w-5" />
                <span className="text-xs text-subtle flex-1">Linha {doc.rows.indexOf(r) + 1}</span>
                <Button size="iconSm" variant="ghost" aria-label="Duplicar linha" onClick={() => duplicateRows([r._id])}><Copy className="h-4 w-4" /></Button>
                <Button size="iconSm" variant="ghost" aria-label="Excluir linha" onClick={() => removeRows([r._id])}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {doc.columns.map((c) => <label key={c.key} className="grid grid-cols-[110px_1fr] items-center gap-2 text-sm"><span className="text-subtle truncate">{c.name}</span><CellInput col={c} value={r[c.key]} onChange={(v) => setCell(r._id, c.key, v)} /></label>)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-auto scrollbar-thin max-h-[calc(100dvh-260px)]">
          <table className="text-sm tabular border-collapse min-w-full">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="sticky left-0 z-20 bg-muted w-10 px-2 border-b border-border"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Selecionar todas as linhas da página" /></th>
                {doc.columns.map((c) => (
                  <th key={c.key} className="text-left font-medium border-b border-l border-border px-2 py-1.5 min-w-[140px]">
                    <div className="flex items-center gap-1">
                      <button className="flex-1 text-left truncate flex items-center gap-1 hover:text-primary" onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))} title="Ordenar">
                        {c.name}{sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-label="crescente" /> : <ArrowDown className="h-3 w-3" aria-label="decrescente" />) : <ArrowUpDown className="h-3 w-3 opacity-30" aria-hidden />}
                      </button>
                      <span className="text-[10px] text-subtle font-normal">{TYPE_LABELS[c.type]}</span>
                      <Menu label={`Opções da coluna ${c.name}`} trigger={<MoreVertical className="h-3.5 w-3.5" />} triggerClass="h-6 w-6">
                        <MenuItem onClick={() => setSort({ key: c.key, dir: 1 })}>Ordenar crescente</MenuItem>
                        <MenuItem onClick={() => setSort({ key: c.key, dir: -1 })}>Ordenar decrescente</MenuItem>
                        <MenuItem onClick={() => setColDialog(c)}>Renomear / alterar tipo</MenuItem>
                        <MenuItem onClick={() => moveColumn(c, -1)}>Mover para a esquerda</MenuItem>
                        <MenuItem onClick={() => moveColumn(c, 1)}>Mover para a direita</MenuItem>
                        <MenuItem danger onClick={() => removeColumn(c)}>Excluir coluna</MenuItem>
                      </Menu>
                    </div>
                    {showFilters && <input className="input h-7 mt-1 text-xs font-normal" placeholder="Filtrar…" value={colFilters[c.key] ?? ''} onChange={(e) => { setColFilters((f) => ({ ...f, [c.key]: e.target.value })); setPage(0); }} aria-label={`Filtrar ${c.name}`} />}
                  </th>
                ))}
                <th className="border-b border-border w-20" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r._id} className={`group ${selected.has(r._id) ? 'bg-primary-soft/60' : 'hover:bg-muted/40'}`}>
                  <td className="sticky left-0 bg-surface group-hover:bg-muted/40 px-2 border-b border-border text-center"><input type="checkbox" checked={selected.has(r._id)} onChange={() => toggle(r._id)} aria-label="Selecionar linha" /></td>
                  {doc.columns.map((c) => <td key={c.key} className="border-b border-l border-border p-0"><CellInput col={c} value={r[c.key]} onChange={(v) => setCell(r._id, c.key, v)} bare /></td>)}
                  <td className="border-b border-border px-1 whitespace-nowrap">
                    <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 inline-flex">
                      <Button size="iconSm" variant="ghost" aria-label="Inserir linha abaixo" onClick={() => addRow(r._id)}><Plus className="h-3.5 w-3.5" /></Button>
                      <Button size="iconSm" variant="ghost" aria-label="Excluir linha" onClick={() => removeRows([r._id])}><X className="h-3.5 w-3.5" /></Button>
                    </span>
                  </td>
                </tr>
              ))}
              {!pageRows.length && <tr><td colSpan={doc.columns.length + 2} className="text-center text-subtle py-8">{doc.rows.length ? 'Nenhuma linha corresponde à pesquisa/filtros.' : 'Planilha vazia. Adicione uma linha.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3 text-sm">
          <Button size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span>Página {page + 1} de {pages}</span>
          <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      )}
      <ColumnDialog col={colDialog} onClose={() => setColDialog(null)} onSave={saveColumn} />
    </div>
  );
}

function formatRawForRetype(v: CellValue, from: ColumnType): CellValue {
  // ao trocar o tipo, datas viram dd/mm/aaaa e percentuais voltam a "12%"
  if (from === 'percent' && typeof v === 'number') return `${v * 100}%`;
  return v;
}

function ColumnDialog({ col, onClose, onSave }: { col: Column | 'new' | null; onClose: () => void; onSave: (orig: Column | null, name: string, type: ColumnType) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>('text');
  useEffect(() => { if (col && col !== 'new') { setName(col.name); setType(col.type); } else { setName(''); setType('text'); } }, [col]);
  const orig = col === 'new' ? null : col;
  return (
    <Modal open={!!col} onClose={onClose} title={orig ? 'Editar coluna' : 'Nova coluna'} size="sm"
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!name.trim()} onClick={() => onSave(orig, name.trim(), type)}>Salvar</Button></>}>
      <div className="space-y-3">
        <label className="block"><span className="label">Nome</span><input data-autofocus className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="label">Tipo de dado</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ColumnType)}>{(Object.keys(TYPE_LABELS) as ColumnType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select>
        </label>
        {orig && orig.type !== type && <p className="text-xs text-warn">Os valores serão convertidos. Os que não puderem ser interpretados ficarão vazios (você será avisado e poderá desfazer).</p>}
      </div>
    </Modal>
  );
}

/** Célula editável com formatação por tipo. Números aceitam formato brasileiro (1.234,56). */
function CellInput({ col, value, onChange, bare }: { col: Column; value: CellValue; onChange: (v: CellValue) => void; bare?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const cls = bare ? `w-full h-9 px-2 bg-transparent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary ${isNumericType(col.type) ? 'text-right' : ''}` : 'input h-9';
  if (col.type === 'boolean') return <div className={bare ? 'px-2' : ''}><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} aria-label={col.name} /></div>;
  if (col.type === 'date') return <input type="date" data-cell="1" className={cls} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} aria-label={col.name} />;
  const display = draft ?? (isNumericType(col.type) ? (value == null ? '' : formatCell(value, col.type)) : String(value ?? ''));
  return (
    <input data-cell="1" className={`${cls} ${invalid ? 'ring-2 ring-expense' : ''}`} value={display} aria-label={col.name} aria-invalid={invalid || undefined}
      inputMode={isNumericType(col.type) ? 'decimal' : undefined}
      onFocus={() => isNumericType(col.type) && setDraft(value == null ? '' : col.type === 'percent' ? `${String(+((value as number) * 100).toFixed(4)).replace('.', ',')}%` : String(value).replace('.', ','))}
      onChange={(e) => { if (isNumericType(col.type)) setDraft(e.target.value); else onChange(e.target.value === '' ? null : e.target.value); }}
      onBlur={() => {
        if (draft == null) return;
        const c = coerce(draft, col.type);
        if (!c.ok) { setInvalid(true); toast(`“${draft}” não é um ${TYPE_LABELS[col.type].toLowerCase()} válido.`, 'error'); }
        else { setInvalid(false); if (c.value !== value) onChange(c.value); }
        setDraft(null);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); } }} />
  );
}

export function DatasetBadge({ n }: { n: number }) { return <Badge>{n} linhas</Badge>; }
