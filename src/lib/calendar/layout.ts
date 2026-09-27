/**
 * Hvor en begivenhet havner på flaten.
 *
 * To oppgaver, begge rene funksjoner uten React, fordi de er de eneste delene
 * av kalenderen som er vanskelige å få riktige — og fordi de da kan testes
 * uten å tegne noe som helst.
 *
 *   layoutColumns  begivenheter som overlapper i tid deler bredden på dagen
 *   packLanes      flerdagers bjelker stables i baner i heldagsraden
 */
import { MIN_SLOT_MIN } from './geometry';

// --- Kolonner i tidsrutenettet -------------------------------------------

export type TimedInput = { key: string; startMin: number; endMin: number };

export type Placed<T> = {
  item: T;
  /** Venstre kant som andel av dagens bredde, 0-1. */
  left: number;
  /** Bredde som andel av dagens bredde, 0-1. */
  width: number;
  /** Kolonnen den fikk. */
  column: number;
  /** Hvor mange kolonner klyngen endte på — nyttig for tetthetsvalg i chipen. */
  columns: number;
  /**
   * Antall begivenheter som allerede lå i samme kolonne da denne måtte inn.
   * Null i det normale tilfellet. Over null bare når kolonnetaket er nådd, og
   * chipen rykker inn noen piksler så kanten under fortsatt synes.
   */
  stackIndex: number;
};

export type ColumnOptions = {
  /**
   * Flest kolonner en klynge får deles i. Over dette blir hver chip smalere
   * enn teksten sin. En travel dag med åtte overlappende timer skal ikke gi
   * åtte uleselige splinter — de siste legger seg oppå i stedet.
   */
  maxColumns?: number;
  /** Minste tid en begivenhet opptar når den skal vurderes for kollisjon. */
  minSlotMin?: number;
};

type Slot<T> = { item: T; start: number; end: number; order: number };

/**
 * Grådig kolonnetildeling, som i alle tidsrutenett siden Google Calendar:
 *
 *  1. sorter på starttid, lengste først ved lik start
 *  2. del i klynger — en klynge slutter idet en begivenhet starter etter at
 *     alt før den er ferdig
 *  3. gi hver begivenhet første kolonne som er ledig der den ligger
 *  4. utvid mot høyre så lenge nabokolonnen er tom i hele spennet, slik at en
 *     begivenhet uten faktisk nabo får full bredde i stedet for en halv
 */
export function layoutColumns<T extends TimedInput>(items: T[], opts: ColumnOptions = {}): Placed<T>[] {
  const maxColumns = Math.max(1, opts.maxColumns ?? 4);
  const minSlot = opts.minSlotMin ?? MIN_SLOT_MIN;

  const slots: Slot<T>[] = items.map((item, order) => ({
    item,
    start: item.startMin,
    // Et femminutters innslag opptar likevel et kvarter når naboer skal
    // plasseres; ellers legger den seg oppå i stedet for ved siden av.
    end: Math.max(item.endMin, item.startMin + minSlot),
    order,
  }));
  slots.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const da = a.end - a.start;
    const db = b.end - b.start;
    if (da !== db) return db - da;
    return a.order - b.order;
  });

  const out: Placed<T>[] = [];

  let cluster: Slot<T>[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (cluster.length) out.push(...placeCluster(cluster, maxColumns));
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const slot of slots) {
    if (slot.start >= clusterEnd) flush();
    cluster.push(slot);
    clusterEnd = Math.max(clusterEnd, slot.end);
  }
  flush();

  return out;
}

function placeCluster<T extends TimedInput>(cluster: Slot<T>[], maxColumns: number): Placed<T>[] {
  const columns: Slot<T>[][] = [];
  const assigned = new Map<Slot<T>, { column: number; stackIndex: number }>();

  for (const slot of cluster) {
    let target = columns.findIndex((col) => col.every((s) => s.end <= slot.start || s.start >= slot.end));
    let stackIndex = 0;
    if (target < 0) {
      if (columns.length < maxColumns) {
        columns.push([]);
        target = columns.length - 1;
      } else {
        // Taket er nådd. Legg den i kolonnen som slipper først, og la chipen
        // rykke inn så kanten på den under fortsatt er synlig.
        target = columns.reduce((best, col, i) => (lastEnd(col) < lastEnd(columns[best]) ? i : best), 0);
        stackIndex = columns[target].filter((s) => s.end > slot.start && s.start < slot.end).length;
      }
    }
    columns[target].push(slot);
    assigned.set(slot, { column: target, stackIndex });
  }

  const total = columns.length;
  return cluster.map((slot) => {
    const { column, stackIndex } = assigned.get(slot)!;
    // Utvid mot høyre: en begivenhet som ikke faktisk har noen ved siden av
    // seg skal ikke se ut som om den har det.
    let span = 1;
    for (let k = column + 1; k < total; k++) {
      const free = columns[k].every((s) => s === slot || s.end <= slot.start || s.start >= slot.end);
      if (!free) break;
      span++;
    }
    return {
      item: slot.item,
      left: column / total,
      width: span / total,
      column,
      columns: total,
      stackIndex,
    };
  });
}

function lastEnd<T extends TimedInput>(col: Slot<T>[]): number {
  return col.length ? col[col.length - 1].end : -Infinity;
}

// --- Baner i heldagsraden -------------------------------------------------

export type SpanInput = { key: string; startDate: string; endDate: string };

export type LaneItem<T> = {
  item: T;
  /** Banen den fikk, 0 øverst. */
  lane: number;
  /** Første og siste synlige dag, som indeks i `days`. */
  startIndex: number;
  endIndex: number;
  span: number;
  /** Sant når bjelken begynner før, eller slutter etter, det synlige vinduet. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type LaneResult<T> = {
  lanes: LaneItem<T>[];
  laneCount: number;
  /** Datonøkkel -> hvor mange bjelker som ikke fikk plass. */
  overflow: Record<string, number>;
};

/**
 * Stabler flerdagers bjelker slik at ingen to i samme bane overlapper, og slik
 * at en bjelke beholder samme bane hele veien over vinduet.
 *
 * `days` er de synlige dagene i rekkefølge — en uke i uke-visningen, en
 * ukesrad i måneds-visningen. Alt utenfor klippes bort.
 */
export function packLanes<T extends SpanInput>(items: T[], days: string[], opts: { maxLanes?: number } = {}): LaneResult<T> {
  const maxLanes = Math.max(1, opts.maxLanes ?? 3);
  if (days.length === 0) return { lanes: [], laneCount: 0, overflow: {} };

  const first = days[0];
  const last = days[days.length - 1];
  const indexOf = new Map(days.map((d, i) => [d, i]));

  type Candidate = { item: T; startIndex: number; endIndex: number };
  const candidates: Candidate[] = [];
  for (const item of items) {
    if (item.endDate < first || item.startDate > last) continue;
    const startIndex = item.startDate <= first ? 0 : (indexOf.get(item.startDate) ?? -1);
    const endIndex = item.endDate >= last ? days.length - 1 : (indexOf.get(item.endDate) ?? -1);
    // En dato som ikke finnes i vinduet — f.eks. en ugyldig rad — hoppes over
    // i stedet for å bli tegnet på feil dag.
    if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) continue;
    candidates.push({ item, startIndex, endIndex });
  }

  candidates.sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
    const sa = a.endIndex - a.startIndex;
    const sb = b.endIndex - b.startIndex;
    if (sa !== sb) return sb - sa;
    return a.item.key.localeCompare(b.item.key);
  });

  const occupied: boolean[][] = [];
  const lanes: LaneItem<T>[] = [];
  const overflow: Record<string, number> = {};

  for (const c of candidates) {
    let lane = 0;
    while (lane < maxLanes) {
      const row = occupied[lane];
      if (!row) break;
      let free = true;
      for (let i = c.startIndex; i <= c.endIndex; i++) {
        if (row[i]) {
          free = false;
          break;
        }
      }
      if (free) break;
      lane++;
    }
    if (lane >= maxLanes) {
      for (let i = c.startIndex; i <= c.endIndex; i++) {
        overflow[days[i]] = (overflow[days[i]] ?? 0) + 1;
      }
      continue;
    }
    if (!occupied[lane]) occupied[lane] = new Array(days.length).fill(false);
    for (let i = c.startIndex; i <= c.endIndex; i++) occupied[lane][i] = true;
    lanes.push({
      item: c.item,
      lane,
      startIndex: c.startIndex,
      endIndex: c.endIndex,
      span: c.endIndex - c.startIndex + 1,
      continuesBefore: c.item.startDate < first,
      continuesAfter: c.item.endDate > last,
    });
  }

  return { lanes, laneCount: occupied.length, overflow };
}
