/**
 * Valutaer og valutakurser.
 *
 * Kursene hentes fra Frankfurter (frankfurter.dev), som publiserer Den
 * europeiske sentralbankens referansekurser — gratis, uten nøkkel, og med
 * åpen CORS, så nettleseren kan spørre direkte. For en dato uten kurs (helg,
 * helligdag) gir tjenesten siste bankdag før. Kursen som ble brukt lagres på
 * posten, så summene ikke endrer seg i etterkant.
 */

/** Valutaene ECB har kurser for, med norske navn. */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'DKK', name: 'Danske kroner' },
  { code: 'NOK', name: 'Norske kroner' },
  { code: 'SEK', name: 'Svenske kroner' },
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'Amerikanske dollar' },
  { code: 'GBP', name: 'Britiske pund' },
  { code: 'ISK', name: 'Islandske kroner' },
  { code: 'CHF', name: 'Sveitsiske franc' },
  { code: 'PLN', name: 'Polske zloty' },
  { code: 'CZK', name: 'Tsjekkiske koruna' },
  { code: 'HUF', name: 'Ungarske forinter' },
  { code: 'RON', name: 'Rumenske leu' },
  { code: 'BGN', name: 'Bulgarske lev' },
  { code: 'TRY', name: 'Tyrkiske lira' },
  { code: 'JPY', name: 'Japanske yen' },
  { code: 'CNY', name: 'Kinesiske yuan' },
  { code: 'HKD', name: 'Hongkong-dollar' },
  { code: 'SGD', name: 'Singapore-dollar' },
  { code: 'KRW', name: 'Sørkoreanske won' },
  { code: 'INR', name: 'Indiske rupi' },
  { code: 'THB', name: 'Thailandske baht' },
  { code: 'IDR', name: 'Indonesiske rupiah' },
  { code: 'MYR', name: 'Malaysiske ringgit' },
  { code: 'PHP', name: 'Filippinske peso' },
  { code: 'AUD', name: 'Australske dollar' },
  { code: 'NZD', name: 'New Zealand-dollar' },
  { code: 'CAD', name: 'Kanadiske dollar' },
  { code: 'MXN', name: 'Meksikanske peso' },
  { code: 'BRL', name: 'Brasilianske real' },
  { code: 'ZAR', name: 'Sørafrikanske rand' },
  { code: 'ILS', name: 'Israelske shekel' },
];

const API = 'https://api.frankfurter.dev/v1';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Rate {
  /** Enheter av `to` per enhet av `from`. */
  rate: number;
  /** Datoen kursen faktisk gjelder for. */
  date: string;
}

/** Kursen fra én valuta til en annen på en dato. Kaster ved nettverksfeil. */
export async function fetchRate(from: string, to: string, date: string): Promise<Rate> {
  if (from === to) return { rate: 1, date };
  // Fram i tid finnes ingen kurs ennå; bruk siste kjente.
  const when = date > todayKey() ? 'latest' : date;
  const res = await fetch(`${API}/${when}?base=${from}&symbols=${to}`);
  if (!res.ok) throw new Error(`Fant ingen kurs for ${from} → ${to} (${res.status}).`);
  const body = (await res.json()) as { date: string; rates: Record<string, number> };
  const rate = body.rates?.[to];
  if (!rate) throw new Error(`Fant ingen kurs for ${from} → ${to}.`);
  return { rate, date: body.date };
}

export type RateSeries = Record<string, Record<string, number>>;

/**
 * Kurser for et tidsrom, med `base` som grunnlag: series[dato][valuta] = enheter valuta per enhet base.
 * Starter en uke tidligere, så det alltid finnes en bankdag før første dato.
 */
export async function fetchSeries(base: string, symbols: string[], start: string, end: string): Promise<RateSeries> {
  const wanted = symbols.filter((s) => s !== base);
  if (!wanted.length) return {};
  const from = shiftDays(start, -7);
  const to = end > todayKey() ? todayKey() : end;
  const res = await fetch(`${API}/${from}..${to < from ? from : to}?base=${base}&symbols=${wanted.join(',')}`);
  if (!res.ok) throw new Error(`Kunne ikke hente valutakurser (${res.status}).`);
  const body = (await res.json()) as { rates: RateSeries };
  return body.rates ?? {};
}

function shiftDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Kurs fra `from` til seriens base på en dato: siste bankdag på eller før datoen.
 * Datoer etter seriens slutt bruker siste kjente kurs.
 */
export function rateToBase(series: RateSeries, from: string, base: string, date: string): Rate | null {
  if (from === base) return { rate: 1, date };
  const dates = Object.keys(series).sort();
  let pick: string | null = null;
  for (const d of dates) {
    if (d <= date && series[d][from]) pick = d;
    if (d > date) break;
  }
  if (!pick) {
    // Før seriens start: bruk første kjente kurs.
    pick = dates.find((d) => series[d][from]) ?? null;
  }
  if (!pick) return null;
  return { rate: 1 / series[pick][from], date: pick };
}

/** Omregnet beløp i hundredeler. */
export function convertMinor(amount: number, rate: number): number {
  return Math.round(amount * rate);
}

/** «1 EUR = 7,4612 DKK» */
export function formatRate(from: string, to: string, rate: number): string {
  const digits = rate >= 100 ? 2 : rate >= 1 ? 4 : 6;
  return `1 ${from} = ${rate.toLocaleString('nb-NO', { maximumFractionDigits: digits }).replace(/[  ]/g, ' ')} ${to}`;
}

/** Tolker en kurs skrevet av brukeren («7,4612» eller «7.4612»). */
export function parseRate(input: string): number | null {
  const s = input.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && Number.isFinite(n) ? n : null;
}
