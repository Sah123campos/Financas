// Pequena store global para o indicador "Salvando… / Salvo / Erro".
import { useSyncExternalStore } from 'react';

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; message?: string; at?: number };
let state: SaveState = { status: 'idle' };
let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setSaveState(s: SaveState) { state = s; emit(); }
export function useSaveState(): SaveState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

/** Envolve uma escrita no banco, atualizando o indicador e tratando falhas. */
export async function tracked<T>(fn: () => Promise<T>): Promise<T> {
  pending++;
  setSaveState({ status: 'saving' });
  try {
    const r = await fn();
    pending--;
    if (pending === 0) setSaveState({ status: 'saved', at: Date.now() });
    return r;
  } catch (e) {
    pending--;
    const msg = describeDbError(e);
    setSaveState({ status: 'error', message: msg });
    throw new Error(msg);
  }
}

export function describeDbError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError' || /quota/i.test(String(e))) return 'Espaço de armazenamento do navegador esgotado. Exporte um backup e remova dados antigos.';
  if (name === 'ConstraintError') return 'Registro duplicado: essa informação já existe.';
  if (name === 'InvalidStateError' || name === 'DatabaseClosedError') return 'O banco de dados local não está disponível (modo privado ou permissão negada?).';
  return (e as Error)?.message || 'Falha ao salvar os dados localmente.';
}
