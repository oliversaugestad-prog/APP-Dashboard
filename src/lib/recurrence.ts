/**
 * Gjentakelse for oppgaver og kalenderhendelser.
 *
 * Samme regel som `public.next_occurrence` i databasen — den lager neste
 * oppgave når en gjentakende oppgave fullføres, og denne viser kommende
 * forekomster i kalenderen. De to må gi samme datoer; testene i
 * recurrence.test.ts og supabase/tests/rls_test.sql bruker de samme tilfellene.
 */

import type { RepeatFreq } from './types';
export type { RepeatFreq };

export interface RepeatRule {
  freq: RepeatFreq | null;
  interval: number;
  /** ISO-ukedager: 1 = mandag … 7 = søndag. Tom = samme ukedag som første forekomst. */
  weekdays: number[];
  until: string | null;
}

export const NO_REPEAT: RepeatRule = { freq: null, interval: 1, weekdays: [], until: null };

const pad = (n: number) => String(n).padStart(2, '0');

function parse(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(key: string, n: number): string {
  const d = parse(key);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** ISO-ukedag, 1 = mandag. */
export function isoWeekday(key: string): number {
  return ((parse(key).getUTCDay() + 6) % 7) + 1;
}

/** Som Postgres: legg til måneder og klipp til siste dag i måneden. */
function addMonths(key: string, months: number): string {
  const d = parse(key);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fmt(target);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** Neste dato etter `from`, eller null når serien er slutt. `anchor` er første forekomst i serien. */
export function nextOccurrence(from: string, rule: RepeatRule, anchor: string = from): string | null {
  if (!rule.freq) return null;
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  let next: string | null = null;
  if (rule.freq === 'daily') {
    next = addDays(from, interval);
  } else if (rule.freq === 'weekly') {
    if (!rule.weekdays.length) {
      next = addDays(from, 7 * interval);
    } else {
      const weekAnchor = addDays(anchor, -(isoWeekday(anchor) - 1));
      for (let i = 1; i <= 7 * interval + 7; i++) {
        const d = addDays(from, i);
        const monday = addDays(d, -(isoWeekday(d) - 1));
        const weekIndex = Math.floor(daysBetween(weekAnchor, monday) / 7);
        if (rule.weekdays.includes(isoWeekday(d)) && ((weekIndex % interval) + interval) % interval === 0) {
          next = d;
          break;
        }
      }
    }
  } else {
    for (let i = 1; i <= 1200; i++) {
      next = addMonths(anchor, (rule.freq === 'monthly' ? 1 : 12) * interval * i);
      if (next > from) break;
    }
  }
  if (next && rule.until && next > rule.until) return null;
  return next;
}

/** Alle forekomster fra og med `start` som faller innenfor [from, to]. Taket hindrer endeløse løkker. */
export function occurrencesBetween(start: string, rule: RepeatRule, from: string, to: string, limit = 500): string[] {
  const out: string[] = [];
  if (start > to) return out;
  if (start >= from) out.push(start);
  if (!rule.freq) return out;
  let cur: string | null = start;
  while (out.length < limit) {
    cur = nextOccurrence(cur, rule, start);
    if (!cur || cur > to) break;
    if (cur >= from) out.push(cur);
  }
  return out;
}

const WEEKDAY_SHORT = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];

/** «Hver uke (man, ons)», «Hver 2. dag», «Hver måned til 1. des.» */
export function describeRule(rule: RepeatRule): string {
  if (!rule.freq) return '';
  const n = Math.max(1, rule.interval);
  const unit = { daily: ['dag', 'dag'], weekly: ['uke', 'uke'], monthly: ['måned', 'måned'], yearly: ['år', 'år'] }[rule.freq];
  let text = n === 1 ? `Hver ${unit[0]}` : `Hver ${n}. ${unit[1]}`;
  if (rule.freq === 'daily' && n === 1) text = 'Hver dag';
  if (rule.freq === 'yearly' && n === 1) text = 'Hvert år';
  if (rule.freq === 'yearly' && n > 1) text = `Hvert ${n}. år`;
  if (rule.freq === 'weekly' && rule.weekdays.length) {
    const days = [...rule.weekdays].sort((a, b) => a - b);
    const label = days.length === 5 && days.join() === '1,2,3,4,5' ? 'hverdager' : days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
    text += ` (${label})`;
  }
  if (rule.until) {
    const [y, m, d] = rule.until.split('-').map(Number);
    text += ` til ${d}.${m}.${String(y).slice(2)}`;
  }
  return text;
}

export function ruleFrom(row: {
  repeat_freq: RepeatFreq | null;
  repeat_interval: number;
  repeat_weekdays: number[] | null;
  repeat_until: string | null;
}): RepeatRule {
  return { freq: row.repeat_freq, interval: row.repeat_interval || 1, weekdays: row.repeat_weekdays ?? [], until: row.repeat_until };
}

export function ruleToRow(rule: RepeatRule) {
  return {
    repeat_freq: rule.freq,
    repeat_interval: Math.min(99, Math.max(1, Math.floor(rule.interval || 1))),
    repeat_weekdays: rule.freq === 'weekly' ? [...new Set(rule.weekdays)].sort((a, b) => a - b) : [],
    repeat_until: rule.freq ? rule.until : null,
  };
}
