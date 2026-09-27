/**
 * Når et trykk blir til et drag.
 *
 * To steder i appen lager man noe ved å dra opp et felt der det skal ligge:
 * kalenderens rutenett (se components/calendar/useGridDrag.ts) og markeringene
 * på et slide. Ingen av dem har en knapp — man drar der man mener.
 *
 * Reglene bor her og ikke i hver av dem, fordi de to gestene må kjennes like i
 * hånden. Driver de fra hverandre, blir «hold inne for å lage noe» noe man må
 * lære to ganger.
 */

/** Under dette er gesten et klikk, ikke et drag. */
export const MOVE_THRESHOLD_PX = 4;

/**
 * Hvor lenge en finger må ligge stille før den tar tak.
 *
 * På berøring er et drag og et sveip den samme bevegelsen, og flaten under kan
 * scrolles. Derfor må fingeren si fra først: holder man inne, lager man noe —
 * drar man med én gang, scroller man.
 *
 * Musen trenger ingen slik avklaring og tar tak umiddelbart. Det samme gjør en
 * penn, som er like presis, og en peker uten type (jsdom, eldre nettlesere).
 */
export const HOLD_MS = 420;

/** Sann for ekte fingre — de eneste som må vente. Se HOLD_MS. */
export function isTouchPointer(pointerType: string | undefined): boolean {
  return pointerType === 'touch';
}

/** Om pekeren har flyttet seg langt nok til at dette er et drag. */
export function movedFar(from: { x: number; y: number }, to: { x: number; y: number }, threshold = MOVE_THRESHOLD_PX): boolean {
  return Math.abs(to.x - from.x) > threshold || Math.abs(to.y - from.y) > threshold;
}
