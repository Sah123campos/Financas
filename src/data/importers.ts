// Leitura de arquivos (XLSX, CSV, JSON, texto colado) e conversão em datasets tipados.
import Papa from 'papaparse';
import type { Column, ColumnType, Dataset, Row } from '@/db/types';
import { coerce, detectType, isEmpty } from './values';
import { uid } from '@/lib/id';

export interface RawSheet { name: string; headers: string[]; rows: unknown[][]; headerDetected: boolean }
export interface RawFile { fileName: string; sheets: RawSheet[]; warnings: string[] }

const MAX_BYTES = 50 * 1024 * 1024;

export async function readFile(file: File): Promise<RawFile> {
  if (file.size > MAX_BYTES) throw new Error(`Arquivo muito grande (${(file.size / 1048576).toFixed(1)} MB). O limite é 50 MB.`);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) return readExcel(file);
  if (ext === 'json') return readJSON(await file.text(), file.name);
  if (['csv', 'tsv', 'txt'].includes(ext)) return readDelimited(await readTextSmart(file), file.name);
  throw new Error(`Formato ".${ext}" não suportado. Use XLSX, XLS, ODS, CSV, TSV ou JSON.`);
}

/** Tenta UTF-8; se aparecerem caracteres inválidos, usa Windows-1252 (comum em extratos bancários). */
async function readTextSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try { return new TextDecoder('windows-1252').decode(buf); } catch { return utf8; }
}

async function readExcel(file: File): Promise<RawFile> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const warnings: string[] = [];
  const sheets = wb.SheetNames.map((name) => {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    return toSheet(name, aoa);
  }).filter((s) => s.headers.length > 0);
  if (!sheets.length) throw new Error('Nenhuma aba com dados foi encontrada no arquivo.');
  if (wb.SheetNames.length > sheets.length) warnings.push(`${wb.SheetNames.length - sheets.length} aba(s) vazia(s) foram ignoradas.`);
  return { fileName: file.name, sheets, warnings };
}

export function readDelimited(text: string, fileName = 'dados colados'): RawFile {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: 'greedy', delimiter: '' });
  const warnings = res.errors.slice(0, 5).map((e) => `Linha ${(e.row ?? 0) + 1}: ${e.message}`);
  if (res.errors.length > 5) warnings.push(`… e mais ${res.errors.length - 5} aviso(s) de formatação.`);
  if (!res.data.length) throw new Error('Nenhum dado encontrado.');
  return { fileName, sheets: [toSheet(fileName.replace(/\.\w+$/, ''), res.data)], warnings };
}

export function readJSON(text: string, fileName = 'dados.json'): RawFile {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { throw new Error('JSON inválido: ' + (e as Error).message); }
  // aceita array de objetos, {rows:[...]} ou {dados:[...]}; objetos aninhados são achatados
  const obj = data as Record<string, unknown>;
  const arr = Array.isArray(data) ? data : Array.isArray(obj?.rows) ? obj.rows : Array.isArray(obj?.data) ? obj.data : Array.isArray(obj?.dados) ? obj.dados : null;
  if (!arr) throw new Error('O JSON deve conter uma lista de registros (ex.: [{"Data": "...", "Valor": 10}]).');
  if (arr.length && Array.isArray(arr[0])) return { fileName, sheets: [toSheet('JSON', arr as unknown[][])], warnings: [] };
  const flat = (arr as unknown[]).map((r) => flatten(r));
  const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  if (!headers.length) throw new Error('Os registros do JSON não possuem campos.');
  return { fileName, sheets: [{ name: 'JSON', headers, rows: flat.map((r) => headers.map((h) => r[h] ?? null)), headerDetected: true }], warnings: [] };
}
function flatten(v: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
    for (const [k, val] of Object.entries(v)) flatten(val, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix || 'valor'] = Array.isArray(v) ? v.join(', ') : v;
  return out;
}

/** Identifica a linha de cabeçalho (primeira linha "textual" entre as 10 primeiras). */
function toSheet(name: string, aoa: unknown[][]): RawSheet {
  const rows = aoa.filter((r) => r && r.some((c) => !isEmpty(c)));
  if (!rows.length) return { name, headers: [], rows: [], headerDetected: false };
  const width = Math.max(...rows.slice(0, 200).map((r) => r.length));
  let hi = -1;
  for (let i = 0; i < Math.min(10, rows.length - 1); i++) {
    const r = rows[i];
    const filled = r.filter((c) => !isEmpty(c));
    const textual = filled.filter((c) => typeof c === 'string' && !/^[-+(]?[\d.,%R$ ]+\)?$/.test(c.trim()));
    if (filled.length >= Math.max(1, Math.ceil(width * 0.5)) && textual.length === filled.length) { hi = i; break; }
  }
  const detected = hi >= 0;
  const headerRow = detected ? rows[hi] : [];
  const used = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, i) => {
    let h = String(headerRow[i] ?? '').trim() || `Coluna ${i + 1}`;
    const n = used.get(h) ?? 0;
    used.set(h, n + 1);
    if (n) h = `${h} (${n + 1})`;
    return h;
  });
  return { name, headers, rows: rows.slice(detected ? hi + 1 : 0).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null)), headerDetected: detected };
}

export interface ColumnPlan { index: number; name: string; type: ColumnType; include: boolean }
export interface ColumnReport { name: string; type: ColumnType; empty: number; invalid: number; examples: string[] }

export function planColumns(sheet: RawSheet): ColumnPlan[] {
  return sheet.headers.map((h, i) => ({ index: i, name: h, type: detectType(sheet.rows.map((r) => r[i]), h), include: true }));
}

/** Analisa vazios e valores inválidos para cada coluna conforme o tipo escolhido. */
export function analyze(sheet: RawSheet, plan: ColumnPlan[]): ColumnReport[] {
  return plan.filter((p) => p.include).map((p) => {
    let empty = 0, invalid = 0;
    const examples: string[] = [];
    for (const r of sheet.rows) {
      const raw = r[p.index];
      if (isEmpty(raw)) { empty++; continue; }
      if (!coerce(raw, p.type).ok) { invalid++; if (examples.length < 3) examples.push(String(raw)); }
    }
    return { name: p.name, type: p.type, empty, invalid, examples };
  });
}

export function slugKey(name: string, used: Set<string>): string {
  let base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'col';
  if (/^\d/.test(base)) base = 'c_' + base;
  let k = base, i = 2;
  while (used.has(k) || k === '_id') k = `${base}_${i++}`;
  used.add(k);
  return k;
}

/** Monta o dataset final. Valores não interpretáveis viram vazio (e foram reportados antes). */
export function buildDataset(sheet: RawSheet, plan: ColumnPlan[], name: string, source: string): Dataset {
  const used = new Set<string>();
  const cols = plan.filter((p) => p.include).map((p) => ({ plan: p, col: { key: slugKey(p.name, used), name: p.name, type: p.type } as Column }));
  const rows: Row[] = sheet.rows.map((r) => {
    const row: Row = { _id: uid() };
    for (const { plan: p, col } of cols) row[col.key] = coerce(r[p.index], p.type).value;
    return row;
  });
  const now = Date.now();
  return { id: uid('ds'), name, columns: cols.map((c) => c.col), rows, source, createdAt: now, updatedAt: now };
}
