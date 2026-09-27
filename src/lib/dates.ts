const monthFmt = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateShortFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function utc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d || 1));
}

/** Dagens dato som YYYY-MM-DD i brukerens tidssone. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD → første dag i måneden (YYYY-MM-01). */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** «2026-09-01» → «2026-09» (brukes i adresser). */
export function monthSlug(month: string): string {
  return month.slice(0, 7);
}

export function slugToMonth(slug: string): string | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(slug) ? `${slug}-01` : null;
}

export function addMonths(month: string, n: number): string {
  const d = utc(month);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** «september 2026» med stor forbokstav. */
export function formatMonth(month: string): string {
  const s = monthFmt.format(utc(month));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDate(date: string): string {
  return dateFmt.format(utc(date));
}

export function formatDateShort(date: string): string {
  const sameYear = date.slice(0, 4) === today().slice(0, 4);
  return sameYear ? dateShortFmt.format(utc(date)) : dateFmt.format(utc(date));
}

/** Antall dager fra i dag til datoen (negativt hvis den har passert). */
export function daysUntil(date: string, from = today()): number {
  return Math.round((utc(date).getTime() - utc(from).getTime()) / 86_400_000);
}
