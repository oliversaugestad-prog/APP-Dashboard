import type { PropType, PropValue, TaskProperty } from './types';

const numberFmt = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 6 });

export function formatNumber(v: PropValue): string {
  return typeof v === 'number' ? numberFmt.format(v).replace(/[  ]/g, ' ') : '';
}

/** Tolker et tall skrevet på norsk eller engelsk («1 234,5», «1234.5»). Null hvis ugyldig. */
export function parseNumber(input: string): number | null {
  const s = input.replace(/[\s  ]/g, '').replace(/^[−–]/, '-');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Leser verdien til en egenskap med riktig type (tåler gamle eller feil lagrede verdier). */
export function readValue(type: PropType, v: PropValue | undefined): PropValue {
  if (v === undefined || v === null) return type === 'multi_select' ? [] : type === 'checkbox' ? false : null;
  switch (type) {
    case 'number':
      return typeof v === 'number' ? v : typeof v === 'string' ? parseNumber(v) : null;
    case 'checkbox':
      return v === true;
    case 'multi_select':
      return Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
    default:
      return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : String(v);
  }
}

/** Sammenligner to verdier for sortering. Tomme verdier havner sist uansett retning (håndteres av kaller). */
export function isEmpty(v: PropValue): boolean {
  return v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

export function compareValues(type: PropType, a: PropValue, b: PropValue, nameOf: (id: string) => string): number {
  const c = (x: string, y: string) => x.localeCompare(y, 'nb', { sensitivity: 'base' });
  switch (type) {
    case 'number':
      return (a as number) - (b as number);
    case 'checkbox':
      return Number(b) - Number(a);
    case 'person':
      return c(nameOf(a as string), nameOf(b as string));
    case 'multi_select':
      return c((a as string[]).join(', '), (b as string[]).join(', '));
    default:
      return c(String(a), String(b));
  }
}

/** Neste ledige farge for en ny valgmulighet. */
export function nextColor(options: TaskProperty['options']): number {
  return options.length % 8;
}

export function normalizeUrl(v: string): string {
  return /^[a-z]+:\/\//i.test(v) ? v : `https://${v}`;
}
