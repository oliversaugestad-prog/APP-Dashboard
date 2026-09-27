/**
 * Tidsaksens mål og enheter.
 *
 * Kalenderen regner i *minutter fra midnatt*, ikke i `Date`. Radene lagrer
 * allerede `event_year/month/day` pluss `"HH:MM"` — altså lokal veggklokke
 * uten tidssone. Går vi via `Date` for å regne på dem, drar vi inn sommertid
 * og UTC-forskyvning i en modell som ikke har bruk for noen av delene, og som
 * hittil har sluppet unna hele klassen av feil (se dayKey i lib/utils.ts for
 * samme lærdom på datosiden).
 */

/** Høyden på én time i rutenettet. Notion ligger på 44-48 px. */
export const HOUR_PX = 44;

/** Draget snapper til kvarteret. */
export const SNAP_MIN = 15;

/** Korteste begivenhet et drag kan lage. */
export const MIN_EVENT_MIN = 15;

/**
 * To begivenheter som ligger nærmere hverandre enn dette regnes som
 * overlappende selv om klokkeslettene ikke krysser — ellers legger et
 * 5-minutters innslag seg oppå naboen sin i stedet for ved siden av.
 */
export const MIN_SLOT_MIN = 15;

/** Minste høyde en chip får tegne seg med, uansett hvor kort den er. */
export const MIN_CHIP_PX = 22;

/** Lengden en begivenhet uten sluttid får. */
export const DEFAULT_DURATION_MIN = 60;

/** Hvor rutenettet står når det åpnes: like over første forelesning. */
export const DEFAULT_SCROLL_MIN = 7 * 60 + 30;

export const DAY_MIN = 24 * 60;

/** Siste minutt et rutenett kan tegne — 24:00 finnes ikke som posisjon. */
export const DAY_END_MIN = DAY_MIN - 1;

/** `"08:15"` -> 495. Null når strengen ikke er et gyldig klokkeslett. */
export function parseHHMM(value?: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 495 -> `"08:15"`. Tåler minutter utenfor døgnet ved å klippe. */
export function formatHHMM(minutes: number): string {
  const m = clampToDay(Math.round(minutes));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(m / 60))}:${p(m % 60)}`;
}

export function minutesToPx(minutes: number): number {
  return (minutes / 60) * HOUR_PX;
}

export function pxToMinutes(px: number): number {
  return (px / HOUR_PX) * 60;
}

/** Nærmeste kvarter (eller det trinnet den som spør ber om). */
export function snapMinutes(minutes: number, step: number = SNAP_MIN): number {
  if (step <= 0) return Math.round(minutes);
  return Math.round(minutes / step) * step;
}

/** Holder et minuttall inne i døgnet. */
export function clampToDay(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(DAY_END_MIN, Math.max(0, minutes));
}
