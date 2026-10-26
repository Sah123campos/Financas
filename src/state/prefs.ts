// Preferências leves no localStorage (tema, moeda, região, movimento).
import { useSyncExternalStore } from 'react';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  currency: string; // ISO 4217
  locale: string;
  reducedMotion: boolean;
  userName: string;
  onboardingDone: boolean;
  financePeriod: string; // id do preset
  financeCustom: { start: string; end: string };
  financeView: 'simple' | 'detailed';
}
const KEY = 'pf.prefs';
const DEFAULTS: Prefs = {
  theme: 'system', currency: 'BRL', locale: 'pt-BR', reducedMotion: false,
  userName: '', onboardingDone: false, financePeriod: 'thisMonth', financeCustom: { start: '', end: '' }, financeView: 'simple',
};

function load(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
let prefs = load();
const listeners = new Set<() => void>();

export function getPrefs(): Prefs { return prefs; }
export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* armazenamento indisponível: mantém em memória */ }
  applyTheme();
  listeners.forEach((l) => l());
}
export function usePrefs(): Prefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => prefs);
}

export function isDark(): boolean {
  return prefs.theme === 'dark' || (prefs.theme === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
}
export function prefersReducedMotion(): boolean {
  return prefs.reducedMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
export function applyTheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', isDark());
  root.dataset.theme = isDark() ? 'dark' : 'light';
  root.classList.toggle('reduce-motion', prefs.reducedMotion);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark() ? '#0d0d10' : '#1e3a8a');
}
if (typeof matchMedia !== 'undefined') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { applyTheme(); listeners.forEach((l) => l()); });
}
