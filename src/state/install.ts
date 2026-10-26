// Instalação como aplicativo (PWA): guarda o convite de instalação do navegador
// e informa se o app já está instalado ou se é iPhone/iPad (instalação manual).
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

if (typeof window !== 'undefined') {
  installed = isStandalone();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; emit(); });
}

export type InstallState = 'installed' | 'available' | 'ios' | 'manual';
const state = (): InstallState => (installed ? 'installed' : deferred ? 'available' : isIOS() ? 'ios' : 'manual');

export function useInstall(): InstallState {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, state, () => 'manual');
}

/** Abre o convite de instalação do navegador. Retorna true se o usuário aceitou. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}
