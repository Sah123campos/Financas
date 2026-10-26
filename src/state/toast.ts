import { useSyncExternalStore } from 'react';
export interface Toast { id: number; kind: 'success' | 'error' | 'info' | 'warning'; message: string; action?: { label: string; run: () => void } }
let toasts: Toast[] = [];
let n = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function toast(message: string, kind: Toast['kind'] = 'success', action?: Toast['action'], ms = 4500) {
  const t = { id: ++n, kind, message, action };
  toasts = [...toasts.slice(-3), t]; emit();
  setTimeout(() => dismiss(t.id), action ? ms + 3000 : ms);
}
export function dismiss(id: number) { toasts = toasts.filter((t) => t.id !== id); emit(); }
export function useToasts() { return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => toasts); }
