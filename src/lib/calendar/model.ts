/**
 * Én form for alt kalenderen kan tegne (portert fra StudyPath).
 *
 * Kalenderen viser to slags rader: egne hendelser (calendar_events, med
 * klokkeslett eller heldags, eventuelt gjentakende) og oppgaver med frist
 * (heldags på fristen, pluss kommende forekomster av gjentakende oppgaver).
 * Begge gjøres om til `CalItem`, så rutenettet bare har én form å forholde seg til.
 *
 *   TID   minutter fra midnatt, ikke `Date`. Se geometry.ts.
 */
import { DEFAULT_DURATION_MIN, DAY_END_MIN, clampToDay, parseHHMM } from './geometry';

export type CalEventType = 'meeting' | 'event' | 'deadline' | 'work' | 'other';
export type CalItemType = CalEventType | 'task';

/** Kilden en rad hører til — det av/på-bryterne i sidepanelet slår på. */
export type CalSourceId = string;

export type CalRef = { kind: 'event'; id: string; occurrence: string; recurring: boolean } | { kind: 'task'; id: string; projected: boolean };

export type CalItem = {
  /** Stabil React-nøkkel. */
  key: string;
  sourceId: CalSourceId;
  title: string;
  subtitle?: string;
  /** Første dag, `YYYY-MM-DD`. */
  startDate: string;
  /** Siste dag, inklusiv. */
  endDate: string;
  /** Minutter fra midnatt på startDate. 0 for heldags. */
  startMin: number;
  /** Minutter fra midnatt på endDate. DAY_END_MIN for heldags. */
  endMin: number;
  allDay: boolean;
  /** CSS-farge — kategoriens pastell, eller nøytral. */
  color: string;
  /** Falsk for rader som ikke kan dras: oppgaver og forekomster av gjentakende hendelser. */
  editable: boolean;
  ref: CalRef;
  type: CalItemType;
  location?: string;
  description?: string;
  /** Oppgaven er fullført. */
  done?: boolean;
};

/** Fargen en rad uten kategori får. Grå med vilje: farge betyr kategori. */
export const NEUTRAL_COLOR = 'var(--muted-foreground)';

// --- Datonøkler -----------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function dateKeyOf(d: Date): string {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `YYYY-MM-DD` -> lokal Date ved midnatt. Null når strengen ikke er en dato. */
export function dateFromKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

export function addDaysKey(key: string, n: number): string {
  const d = dateFromKey(key);
  if (!d) return key;
  d.setDate(d.getDate() + n);
  return dateKeyOf(d);
}

/** Antall dager fra a til b. */
export function daysBetweenKeys(a: string, b: string): number {
  const da = dateFromKey(a);
  const db = dateFromKey(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * Start- og sluttminutt ut fra to `"HH:MM"`-strenger (også `"HH:MM:SS"` fra databasen).
 * Uten starttid: heldags. Uten sluttid: en time.
 */
export function resolveTimes(startTime?: string | null, endTime?: string | null): { allDay: boolean; startMin: number; endMin: number } {
  const start = parseHHMM(startTime?.slice(0, 5));
  if (start === null) return { allDay: true, startMin: 0, endMin: DAY_END_MIN };
  const end = parseHHMM(endTime?.slice(0, 5));
  if (end === null) return { allDay: false, startMin: start, endMin: clampToDay(start + DEFAULT_DURATION_MIN) };
  return { allDay: false, startMin: start, endMin: end };
}

// --- Sortering og plassering ---------------------------------------------

export function sortItems<T extends Pick<CalItem, 'startDate' | 'startMin' | 'endMin' | 'title'>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    const da = a.endMin - a.startMin;
    const db = b.endMin - b.startMin;
    if (da !== db) return db - da;
    return a.title.localeCompare(b.title);
  });
}

export function touchesDay(item: Pick<CalItem, 'startDate' | 'endDate'>, day: string): boolean {
  return item.startDate <= day && item.endDate >= day;
}

export function itemsForDay<T extends Pick<CalItem, 'startDate' | 'endDate'>>(items: T[], day: string): T[] {
  return items.filter((i) => touchesDay(i, day));
}

/** Skiller det som hører hjemme i heldagsraden fra det som hører i rutenettet. */
export function splitByPlacement<T extends Pick<CalItem, 'allDay' | 'startDate' | 'endDate'>>(items: T[]): { allDay: T[]; timed: T[] } {
  const allDay: T[] = [];
  const timed: T[] = [];
  for (const i of items) {
    if (i.allDay || i.startDate !== i.endDate) allDay.push(i);
    else timed.push(i);
  }
  return { allDay, timed };
}

/** Hvilken del av dagen en begivenhet over flere dager dekker. */
export function clipToDay(item: Pick<CalItem, 'startDate' | 'endDate' | 'startMin' | 'endMin'>, day: string): { startMin: number; endMin: number } {
  return {
    startMin: item.startDate === day ? item.startMin : 0,
    endMin: item.endDate === day ? item.endMin : DAY_END_MIN,
  };
}
