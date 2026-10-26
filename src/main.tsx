import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { applyTheme } from '@/state/prefs';
import { ensureSeed, syncRecurring } from '@/db/repo';
import { toast } from '@/state/toast';

applyTheme();

async function boot() {
  try {
    await ensureSeed();
    await syncRecurring(); // gera previsões recorrentes que faltam (sem duplicar)
  } catch (e) {
    console.error(e);
    setTimeout(() => toast('Não foi possível abrir o banco de dados local. Verifique se o navegador permite armazenamento (o modo privado pode bloquear).', 'error', undefined, 15000), 300);
  }
}
boot();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// PWA: cache para uso offline (somente em produção)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
