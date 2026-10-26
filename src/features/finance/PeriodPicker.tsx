import { PERIOD_PRESETS, resolvePeriod, type Period } from '@/lib/dates';
import { fmtDate } from '@/lib/format';
import { CalendarRange } from 'lucide-react';

export function PeriodPicker({ preset, custom, onChange }: { preset: string; custom: { start: string; end: string }; onChange: (preset: string, custom: { start: string; end: string }) => void }) {
  const p = resolvePeriod(preset, custom);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <CalendarRange className="h-4 w-4 absolute left-2.5 top-2 text-subtle pointer-events-none" aria-hidden />
        <select className="input h-8 pl-8 pr-8 text-sm w-auto" aria-label="Período" value={preset} onChange={(e) => onChange(e.target.value, e.target.value === 'custom' && !custom.start ? { start: p.start, end: p.end } : custom)}>
          {PERIOD_PRESETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
      {preset === 'custom' ? (
        <div className="flex items-center gap-1.5 text-sm">
          <input type="date" className="input h-8 w-auto text-sm" value={custom.start} onChange={(e) => onChange('custom', { ...custom, start: e.target.value })} aria-label="Data inicial" />
          <span className="text-subtle">até</span>
          <input type="date" className="input h-8 w-auto text-sm" value={custom.end} onChange={(e) => onChange('custom', { ...custom, end: e.target.value })} aria-label="Data final" />
        </div>
      ) : <span className="text-xs text-subtle">{fmtDate(p.start)} – {fmtDate(p.end)}</span>}
    </div>
  );
}
export type { Period };
