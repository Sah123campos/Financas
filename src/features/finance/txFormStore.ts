import { useSyncExternalStore } from 'react';
import type { Transaction, TxType } from '@/db/types';

type State = { open: boolean; type: TxType; editing?: Transaction };
let s: State = { open: false, type: 'expense' };
const ls = new Set<() => void>();
export function openTxForm(type: TxType = 'expense', editing?: Transaction) { s = { open: true, type: editing?.type ?? type, editing }; ls.forEach((l) => l()); }
export function closeTxForm() { s = { ...s, open: false, editing: undefined }; ls.forEach((l) => l()); }
export function useTxForm() { return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => s); }
