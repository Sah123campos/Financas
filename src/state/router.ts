// Roteador mínimo baseado no hash (funciona em hospedagem estática e offline).
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const read = () => (window.location.hash.replace(/^#/, '') || '/');
let current = typeof window !== 'undefined' ? read() : '/';
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { current = read(); listeners.forEach((l) => l()); });

export function useRoute(): string {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
export function navigate(path: string, replace = false) {
  if (replace) { history.replaceState(null, '', '#' + path); current = path; listeners.forEach((l) => l()); }
  else window.location.hash = path;
}
/** Compara a rota com um padrão do tipo "/planilhas/:id". */
export function match(pattern: string, path: string): Record<string, string> | null {
  const [p] = path.split('?');
  const a = pattern.split('/').filter(Boolean), b = p.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
export function query(path: string): URLSearchParams { return new URLSearchParams(path.split('?')[1] ?? ''); }
