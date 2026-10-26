// Paleta categórica validada (ordem fixa, segura para daltonismo nos pares adjacentes).
export const PALETTE_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const PALETTE_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const OTHER_COLOR = { light: '#a3a29b', dark: '#6b6a64' };
export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
export const SEQ_BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export function chrome(dark: boolean) {
  return dark
    ? { surface: '#1a1a1d', ink: '#f0efec', ink2: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', axis: '#383835', tooltipBg: '#26262a' }
    : { surface: '#ffffff', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', tooltipBg: '#ffffff' };
}

/** Cores semânticas para séries financeiras conhecidas. */
export function semanticColor(name: string): string | undefined {
  const n = name.toLowerCase();
  if (/^(receitas?|entradas?|ganhos?|income)\b/.test(n)) return STATUS.good;
  if (/^(despesas?|sa[ií]das?|gastos?|expense)\b/.test(n)) return STATUS.critical;
  return undefined;
}

export function palette(dark: boolean) { return dark ? PALETTE_DARK : PALETTE_LIGHT; }

/** Atribui cores pela identidade da chave (ordem estável), não pela posição após filtros. */
export function makeColorFor(stableKeys: string[], dark: boolean, overrides: Record<string, string> = {}) {
  const pal = palette(dark);
  const index = new Map(stableKeys.map((k, i) => [k, i]));
  return (key: string, fallbackIndex = 0): string => {
    if (overrides[key]) return overrides[key];
    const sem = semanticColor(key);
    if (sem) return sem;
    if (key === 'Outros' || key === '(vazio)') return dark ? OTHER_COLOR.dark : OTHER_COLOR.light;
    const i = index.get(key) ?? fallbackIndex;
    return pal[i % pal.length];
  };
}
