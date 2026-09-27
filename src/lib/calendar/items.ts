/**
 * Prosjektets hendelser og oppgaver som kalenderrader.
 *
 *   hendelse            én rad per forekomst i vinduet (gjentakende hendelser
 *                       vises på hver forekomst, men kan bare flyttes i dialogen)
 *   oppgave med frist   heldagsrad på fristen
 *   gjentakende oppgave i tillegg kommende forekomster, grå og skrivebeskyttet —
 *                       de lages først når forrige forekomst fullføres
 */
import { nextOccurrence, occurrencesBetween, ruleFrom } from '../recurrence';
import type { CalendarEvent, Task } from '../types';
import { CATEGORY_PASTEL } from './appearance';
import { addDaysKey, daysBetweenKeys, NEUTRAL_COLOR, resolveTimes, sortItems, type CalItem } from './model';

export const TASK_SOURCE = 'tasks';
export const RECURRING_SOURCE = 'tasks-recurring';
export const eventSource = (type: CalendarEvent['type']) => `type:${type}`;

export function buildItems(
  input: { events: CalendarEvent[]; tasks: Task[] },
  window: { from: string; to: string },
  colorIndexOf: (category: string) => number | null,
): CalItem[] {
  const color = (category: string) => {
    if (!category) return NEUTRAL_COLOR;
    const i = colorIndexOf(category);
    return i === null ? NEUTRAL_COLOR : CATEGORY_PASTEL[i];
  };
  const items: CalItem[] = [];

  for (const ev of input.events) {
    const span = Math.max(0, daysBetweenKeys(ev.start_date, ev.end_date));
    const rule = ruleFrom(ev);
    const recurring = !!rule.freq;
    const times = resolveTimes(ev.start_time, ev.end_time);
    // Start vinduet `span` dager tidligere, så en flerdagers hendelse som begynte før vinduet også vises.
    for (const occ of occurrencesBetween(ev.start_date, rule, addDaysKey(window.from, -span), window.to)) {
      items.push({
        key: `event:${ev.id}:${occ}`,
        sourceId: eventSource(ev.type),
        title: ev.title,
        subtitle: ev.category || undefined,
        startDate: occ,
        endDate: addDaysKey(occ, span),
        ...times,
        color: color(ev.category),
        editable: !recurring,
        ref: { kind: 'event', id: ev.id, occurrence: occ, recurring },
        type: ev.type,
        location: ev.location || undefined,
        description: ev.description || undefined,
      });
    }
  }

  for (const t of input.tasks) {
    if (t.kind !== 'task' || !t.due_date) continue;
    const base = {
      subtitle: t.category || undefined,
      allDay: true,
      startMin: 0,
      endMin: 24 * 60 - 1,
      color: color(t.category),
      editable: false,
      type: 'task' as const,
      description: t.description || undefined,
    };
    if (t.due_date >= window.from && t.due_date <= window.to) {
      items.push({
        ...base,
        key: `task:${t.id}`,
        sourceId: TASK_SOURCE,
        title: t.title,
        startDate: t.due_date,
        endDate: t.due_date,
        ref: { kind: 'task', id: t.id, projected: false },
        done: t.status === 'done',
      });
    }
    // Kommende forekomster av en åpen gjentakende oppgave.
    const rule = ruleFrom(t);
    if (rule.freq && t.status !== 'done') {
      const anchor = t.repeat_anchor ?? t.due_date;
      let cur: string | null = t.due_date;
      for (let i = 0; i < 400; i++) {
        cur = nextOccurrence(cur, rule, anchor);
        if (!cur || cur > window.to) break;
        if (cur < window.from) continue;
        items.push({
          ...base,
          key: `task:${t.id}:${cur}`,
          sourceId: RECURRING_SOURCE,
          title: t.title,
          startDate: cur,
          endDate: cur,
          ref: { kind: 'task', id: t.id, projected: true },
        });
      }
    }
  }

  return sortItems(items);
}
