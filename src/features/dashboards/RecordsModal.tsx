// Drill-through: mostra os registros que compõem um indicador/elemento.
import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import type { Column, Row } from '@/db/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';
import { formatCell } from '@/features/datasets/cells';
import { download } from '@/db/backup';

export function RecordsModal({ open, onClose, title, rows, columns }: { open: boolean; onClose: () => void; title: string; rows: Row[]; columns: Column[] }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(200);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(s))) : rows;
  }, [rows, columns, q]);
  const exportCsv = () => {
    const csv = Papa.unparse(filtered.map((r) => Object.fromEntries(columns.map((c) => [c.name, r[c.key]]))), { delimiter: ';' });
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), 'registros.csv');
  };
  return (
    <Modal open={open} onClose={onClose} title={`Registros: ${title}`} description={`${filtered.length.toLocaleString('pt-BR')} registro(s) compõem este valor.`} size="xl"
      footer={<><Button icon={<Download className="h-4 w-4" />} onClick={exportCsv}>Exportar CSV</Button><Button variant="primary" onClick={onClose}>Fechar</Button></>}>
      <input className="input mb-3" placeholder="Pesquisar nos registros…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar nos registros" />
      <div className="overflow-auto scrollbar-thin border border-border rounded-lg max-h-[60dvh]">
        <table className="w-full text-sm tabular">
          <thead className="sticky top-0 bg-muted"><tr>{columns.map((c) => <th key={c.key} className="text-left font-medium px-3 py-2 whitespace-nowrap">{c.name}</th>)}</tr></thead>
          <tbody>{filtered.slice(0, limit).map((r) => <tr key={r._id} className="border-t border-border">{columns.map((c) => <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${c.type === 'currency' || c.type === 'number' ? 'text-right' : ''}`}>{formatCell(r[c.key], c.type)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {filtered.length > limit && <div className="text-center mt-3"><Button size="sm" onClick={() => setLimit((l) => l + 500)}>Mostrar mais ({filtered.length - limit} restantes)</Button></div>}
    </Modal>
  );
}
