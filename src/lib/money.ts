const nok = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nokShort = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Formaterer øre som kroner, f.eks. 123450 → «1 234,50 kr». */
export function formatNok(ore: number, opts: { sign?: boolean; short?: boolean } = {}): string {
  const f = opts.short ? nokShort : nok;
  const text = f.format(Math.abs(ore) / 100).replace(/[\u00a0\u202f]/g, ' ');
  if (ore < 0) return `−${text}`;
  if (opts.sign && ore > 0) return `+${text}`;
  return text;
}

/**
 * Tolker et beløp skrevet av brukeren til hele øre. Godtar «1 234,50», «1234.5», «1.234,50» og «kr 99».
 * Returnerer null hvis teksten ikke er et gyldig beløp.
 */
export function parseNok(input: string): number | null {
  let s = input
    .replace(/kr|nok/gi, '')
    .replace(/[\s\u00a0\u202f']/g, '')
    .replace(/^[\u2212\u2013]/, '-');
  if (!s) return null;
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : null;
  let intPart = s;
  let frac = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    const after = s.slice(idx + 1);
    // Tre sifre etter eneste skilletegn («1.234», «12,500») betyr tusenskille, ikke desimaler.
    const other = decimalSep === ',' ? '.' : ',';
    if (!(after.length === 3 && !s.includes(other))) {
      intPart = s.slice(0, idx);
      frac = after;
      if (intPart.includes(decimalSep)) return null;
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(intPart || '0') || !/^\d{0,2}$/.test(frac)) return null;
  const ore = Number(intPart || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(ore)) return null;
  return negative ? -ore : ore;
}

/** Øre til redigerbar tekst, f.eks. 123450 → «1234,50». */
export function oreToInput(ore: number): string {
  const abs = Math.abs(ore);
  const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return ore < 0 ? `-${text}` : text;
}
