import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-5">
      <div className="flex-1 min-w-[200px]">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-subtle mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center gap-2">
      {icon && <div className="h-12 w-12 rounded-full bg-primary-soft text-primary flex items-center justify-center mb-1">{icon}</div>}
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="text-sm text-subtle max-w-md">{children}</div>}
      {action && <div className="mt-3 flex flex-wrap gap-2 justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-subtle text-sm" role="status"><span className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" aria-hidden />{label}</div>;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-muted border border-border">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} title={o.title} onClick={() => onChange(o.value)}
          className={`${size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm'} rounded-md font-medium transition inline-flex items-center gap-1.5 ${value === o.value ? 'bg-surface shadow-sm text-fg' : 'text-subtle hover:text-fg'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, htmlFor, error, hint, children, optional }: { label: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode; optional?: boolean }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}{optional && <span className="text-subtle font-normal"> (opcional)</span>}</label>
      {children}
      {error ? <p className="text-xs text-expense mt-1" role="alert">⚠ {error}</p> : hint ? <p className="text-xs text-subtle mt-1">{hint}</p> : null}
    </div>
  );
}

export function Progress({ value, color, label, height = 8 }: { value: number; color?: string; label: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="w-full rounded-full bg-muted overflow-hidden" style={{ height }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color ?? 'rgb(var(--primary))' }} />
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'income' | 'expense' | 'warn' | 'primary' }) {
  const t = { neutral: 'bg-muted text-subtle', income: 'bg-income-soft text-income', expense: 'bg-expense-soft text-expense', warn: 'bg-warn-soft text-warn', primary: 'bg-primary-soft text-primary' }[tone];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${t}`}>{children}</span>;
}

export function Menu({ trigger, children, align = 'right', label, triggerClass }: { trigger: ReactNode; children: ReactNode; align?: 'left' | 'right'; label: string; triggerClass?: string }) {
  // <details> dá acessibilidade básica de teclado sem bibliotecas
  return (
    <details className="relative group" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}>
      <summary aria-label={label} title={label} className={`list-none cursor-pointer [&::-webkit-details-marker]:hidden inline-flex items-center justify-center rounded-lg hover:bg-muted ${triggerClass ?? 'h-8 w-8'}`}>{trigger}</summary>
      <div className={`absolute z-30 mt-1 ${align === 'right' ? 'right-0' : 'left-0'} min-w-[200px] card p-1 shadow-lg animate-in`}
        onClick={(e) => { const d = (e.currentTarget.parentElement as HTMLDetailsElement); if ((e.target as HTMLElement).closest('button')) d.open = false; }}>
        {children}
      </div>
    </details>
  );
}
export function MenuItem({ icon, children, onClick, danger, disabled }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={`w-full flex items-center gap-2 px-2.5 h-9 rounded-md text-sm text-left hover:bg-muted disabled:opacity-40 ${danger ? 'text-expense' : ''}`}>
      {icon}<span className="flex-1">{children}</span>
    </button>
  );
}
