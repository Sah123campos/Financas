import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToasts, dismiss } from '@/state/toast';

const STY = {
  success: { I: CheckCircle2, c: 'text-income' }, error: { I: AlertCircle, c: 'text-expense' },
  info: { I: Info, c: 'text-primary' }, warning: { I: AlertTriangle, c: 'text-warn' },
};
export function Toaster() {
  const ts = useToasts();
  return (
    <div className="fixed z-[60] bottom-20 lg:bottom-4 inset-x-0 flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="polite" role="status">
      {ts.map((t) => { const { I, c } = STY[t.kind]; return (
        <div key={t.id} className="pointer-events-auto card px-3 py-2.5 flex items-center gap-2.5 max-w-md w-full animate-in">
          <I className={`h-5 w-5 shrink-0 ${c}`} aria-hidden />
          <span className="text-sm flex-1">{t.message}</span>
          {t.action && <button className="text-sm font-semibold text-primary px-2 py-1 rounded hover:bg-muted" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted" onClick={() => dismiss(t.id)} aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
        </div>
      ); })}
    </div>
  );
}
