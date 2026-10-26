import { useState, useSyncExternalStore } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

interface Req { title: string; message: string; confirmLabel?: string; danger?: boolean; typeToConfirm?: string; resolve: (v: boolean) => void }
let req: Req | null = null;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());

/** Confirmação assíncrona: `if (await confirmDialog({...})) ...` */
export function confirmDialog(o: Omit<Req, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => { req = { ...o, resolve }; emit(); });
}
export function ConfirmHost() {
  const r = useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => req);
  const [typed, setTyped] = useState('');
  const close = (v: boolean) => { r?.resolve(v); req = null; setTyped(''); emit(); };
  if (!r) return null;
  const blocked = !!r.typeToConfirm && typed.trim().toUpperCase() !== r.typeToConfirm.toUpperCase();
  return (
    <Modal open onClose={() => close(false)} title={r.title} size="sm"
      footer={<><Button onClick={() => close(false)}>Cancelar</Button><Button data-autofocus={!r.typeToConfirm || undefined} variant={r.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)}>{r.confirmLabel ?? 'Confirmar'}</Button></>}>
      <div className="flex gap-3">
        {r.danger && <AlertTriangle className="h-5 w-5 text-expense shrink-0 mt-0.5" aria-hidden />}
        <div className="text-sm text-subtle whitespace-pre-line">{r.message}</div>
      </div>
      {r.typeToConfirm && (
        <label className="block mt-4 text-sm">Digite <b>{r.typeToConfirm}</b> para confirmar
          <input className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} data-autofocus />
        </label>
      )}
    </Modal>
  );
}
