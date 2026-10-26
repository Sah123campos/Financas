import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'income' | 'expense';
const V: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:brightness-110 shadow-sm',
  secondary: 'bg-surface border border-border text-fg hover:bg-muted',
  ghost: 'text-fg hover:bg-muted',
  // cores fixas com contraste ≥ 4.5:1 para texto branco nos dois temas
  danger: 'bg-[#b42318] text-white hover:brightness-110',
  income: 'bg-[#0a7a2a] text-white hover:brightness-110',
  expense: 'bg-[#b42318] text-white hover:brightness-110',
};
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: 'sm' | 'md' | 'icon' | 'iconSm'; icon?: ReactNode; loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', icon, loading, className = '', children, disabled, ...rest }, ref) {
  const s = size === 'sm' ? 'h-8 px-2.5 text-sm gap-1.5' : size === 'icon' ? 'h-10 w-10 justify-center' : size === 'iconSm' ? 'h-8 w-8 justify-center' : 'h-10 px-4 text-sm gap-2';
  return (
    <button ref={ref} type="button" disabled={disabled || loading}
      className={`inline-flex items-center rounded-lg font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none select-none ${V[variant]} ${s} ${className}`} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});
