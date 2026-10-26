import { previousPeriod, resolvePeriod } from '@/lib/dates';
import { setPrefs, usePrefs } from '@/state/prefs';
import { useMemo } from 'react';

export function useFinancePeriod() {
  const prefs = usePrefs();
  const period = useMemo(() => resolvePeriod(prefs.financePeriod, prefs.financeCustom), [prefs.financePeriod, prefs.financeCustom]);
  const prev = useMemo(() => previousPeriod(period), [period]);
  const setPeriod = (preset: string, custom = prefs.financeCustom) => setPrefs({ financePeriod: preset, financeCustom: custom });
  return { preset: prefs.financePeriod, custom: prefs.financeCustom, period, prev, setPeriod };
}
