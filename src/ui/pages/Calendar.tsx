/**
 * Prosjektkalenderen — samme oppbygning som kalenderen i StudyPath:
 * topplinje, sidepanel med minimåned og kilder, og dag/uke (tidsrutenett)
 * eller måned. Klikk eller dra i rutenettet for å lage noe, dra en hendelse
 * for å flytte den og i underkanten for å forlenge den.
 */
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { updateEvent, updateTask } from '../../lib/api';
import { TYPE_BAR, TYPE_LABEL } from '../../lib/calendar/appearance';
import { formatHHMM, MIN_EVENT_MIN } from '../../lib/calendar/geometry';
import { buildItems, eventSource, RECURRING_SOURCE, TASK_SOURCE } from '../../lib/calendar/items';
import { addDaysKey, dateFromKey, dateKeyOf, daysBetweenKeys, type CalEventType, type CalItem } from '../../lib/calendar/model';
import { readPrefs, writePrefs, type CalMode } from '../../lib/calendar/prefs';
import { describeRule, ruleFrom } from '../../lib/recurrence';
import type { CalendarEvent, Task } from '../../lib/types';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { EventDialog, type EventDraft } from '../components/EventDialog';
import { TaskDialog } from '../components/TaskForm';
import { CalendarRail, type CalSource } from '../calendar/CalendarRail';
import { CalendarTopBar } from '../calendar/CalendarTopBar';
import { EventPopover } from '../calendar/EventPopover';
import { MonthGrid } from '../calendar/MonthGrid';
import { TimeGrid } from '../calendar/TimeGrid';
import { useCalendarKeys } from '../calendar/useCalendarKeys';
import { Page } from '../Layout';

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LOCALE = 'nb-NO';

const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // mandag først
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

const EVENT_TYPES: CalEventType[] = ['meeting', 'event', 'deadline', 'work', 'other'];

/** Telefonen får ikke måned — den blir uleselig (som i StudyPath). */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

export function CalendarPage() {
  const { events, tasks, colorOf, categories, personById, nameOf, reload } = useProject();
  const toast = useToast();
  const narrow = useNarrow();
  const [prefs, setPrefs] = useState(readPrefs);
  const [cursor, setCursor] = useState(() => new Date());
  const mode: CalMode = narrow && prefs.mode === 'month' ? 'week' : prefs.mode;
  const setMode = useCallback((m: CalMode) => {
    setPrefs((p) => ({ ...p, mode: m }));
    writePrefs({ mode: m });
  }, []);
  const hidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const toggleSource = (id: string) => {
    const next = hidden.has(id) ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id];
    setPrefs((p) => ({ ...p, hidden: next }));
    writePrefs({ hidden: next });
  };
  const toggleRail = () => {
    setPrefs((p) => ({ ...p, railOpen: !p.railOpen }));
    writePrefs({ railOpen: !prefs.railOpen });
  };

  const [peek, setPeek] = useState<{ item: CalItem; rect: DOMRect } | null>(null);
  const [eventDialog, setEventDialog] = useState<{ event: CalendarEvent | null; draft: EventDraft | null } | null>(null);
  const [taskDialog, setTaskDialog] = useState<Task | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Uken og måneden er ingen vegg: rutenettet tegner nabouken/-måneden også, så man kan rulle.
  const cells: Date[] = useMemo(() => {
    const out: Date[] = [];
    if (mode === 'month') {
      const from = startOfWeek(new Date(year, month - 1, 1));
      const to = addDays(startOfWeek(new Date(year, month + 2, 1)), -1);
      for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    } else if (mode === 'week') {
      const from = addDays(startOfWeek(cursor), -7);
      for (let i = 0; i < 21; i++) out.push(addDays(from, i));
    } else {
      out.push(new Date(year, month, cursor.getDate()));
    }
    return out;
  }, [mode, cursor, year, month]);
  const gridDays = useMemo(() => cells.map(dateKeyOf), [cells]);

  const focusDays = useMemo(() => {
    if (mode === 'month') return gridDays;
    if (mode === 'day') return [dateKeyOf(cursor)];
    const from = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => dateKeyOf(addDays(from, i)));
  }, [mode, cursor, gridDays]);

  const monthWeeks = useMemo(
    () => (mode === 'month' ? Array.from({ length: Math.floor(gridDays.length / 7) }, (_, i) => gridDays.slice(i * 7, i * 7 + 7)) : []),
    [mode, gridDays],
  );
  const monthFocusWeek = dateKeyOf(startOfWeek(new Date(year, month, 1)));
  const monthWeeksInView = Math.ceil((startDay + daysInMonth) / 7);

  const allItems = useMemo(
    () =>
      buildItems({ events, tasks }, { from: gridDays[0], to: gridDays[gridDays.length - 1] }, (name) =>
        categories.some((c) => c.scope === 'task' && c.name === name) ? colorOf('task', name) : null,
      ),
    [events, tasks, gridDays, categories, colorOf],
  );
  const shownItems = useMemo(() => allItems.filter((i) => !hidden.has(i.sourceId)), [allItems, hidden]);

  const sources: CalSource[] = useMemo(() => {
    const count = (id: string) => allItems.filter((i) => i.sourceId === id).length;
    return [
      ...EVENT_TYPES.map((t) => ({ id: eventSource(t), label: TYPE_LABEL[t], color: TYPE_BAR[t], count: count(eventSource(t)), group: 'calendar' as const })),
      { id: TASK_SOURCE, label: 'Oppgavefrister', color: TYPE_BAR.task, count: count(TASK_SOURCE), group: 'tasks' as const },
      { id: RECURRING_SOURCE, label: 'Kommende gjentakelser', color: '#f7a58f', count: count(RECURRING_SOURCE), group: 'tasks' as const },
    ];
  }, [allItems]);
  const allHidden = sources.every((s) => hidden.has(s.id));

  const step = useCallback(
    (dir: 1 | -1) => {
      if (mode === 'month') setCursor(new Date(year, month + dir, 1));
      else if (mode === 'week') setCursor(addDays(cursor, 7 * dir));
      else setCursor(addDays(cursor, dir));
    },
    [mode, year, month, cursor],
  );

  const rangeLabel = (() => {
    if (mode === 'month') return capFirst(cursor.toLocaleString(LOCALE, { month: 'long', year: 'numeric' }));
    if (mode === 'day') return capFirst(cursor.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    const s = startOfWeek(cursor);
    const e = addDays(s, 6);
    const week = isoWeek(s);
    const sameMonth = s.getMonth() === e.getMonth();
    const from = s.toLocaleDateString(LOCALE, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    const to = e.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
    return `Uke ${week} · ${from}–${to}`;
  })();

  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 5 + i).toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '')),
    [],
  );

  const newEvent = useCallback((draft: EventDraft) => {
    setPeek(null);
    setEventDialog({ event: null, draft });
  }, []);

  /** Klikk eller drag i tomrommet: åpne skjemaet med tiden fylt ut. */
  const addActivityAt = useCallback(
    (day: string, startMin: number, endMin?: number, endDay?: string) => {
      const end = endMin ?? Math.min(startMin + 60, 24 * 60 - 1);
      newEvent({
        start_date: day,
        end_date: day,
        start_time: formatHHMM(startMin),
        end_time: formatHHMM(Math.max(end, startMin + MIN_EVENT_MIN)),
        // Drag over flere dager: samme tidsrom hver dag, som i StudyPath.
        repeat: endDay && endDay !== day ? { freq: 'daily', interval: 1, weekdays: [], until: endDay } : undefined,
      });
    },
    [newEvent],
  );

  const moveCalItem = useCallback(
    async (item: CalItem, day: string, startMin: number, endMin: number) => {
      if (item.ref.kind !== 'event' || !item.editable) return;
      const span = daysBetweenKeys(item.startDate, item.endDate);
      const end = Math.max(endMin, startMin + MIN_EVENT_MIN);
      try {
        await updateEvent(item.ref.id, {
          start_date: day,
          end_date: addDaysKey(day, span),
          start_time: formatHHMM(startMin),
          end_time: formatHHMM(Math.min(end, 24 * 60 - 1)),
        });
        await reload();
      } catch (e) {
        toast.error(e);
      }
    },
    [reload, toast],
  );

  const openCalItem = useCallback((item: CalItem, rect: DOMRect) => setPeek({ item, rect }), []);

  const editCalItem = (item: CalItem) => {
    setPeek(null);
    if (item.ref.kind === 'event') {
      const id = item.ref.id;
      setEventDialog({ event: events.find((e) => e.id === id) ?? null, draft: null });
    } else {
      const id = item.ref.id;
      setTaskDialog(tasks.find((t) => t.id === id) ?? null);
    }
  };

  useCalendarKeys({
    onToday: () => setCursor(new Date()),
    onStep: step,
    onMode: (m) => setMode(narrow && m === 'month' ? 'week' : m),
    onNew: () => {
      const now = new Date();
      const start = Math.min(22 * 60, (now.getHours() + 1) * 60);
      addActivityAt(dateKeyOf(now), start);
    },
    onEscape: () => setPeek(null),
  });

  const peekEvent = peek?.item.ref.kind === 'event' ? events.find((e) => e.id === (peek.item.ref as { id: string }).id) : undefined;
  const peekTask = peek?.item.ref.kind === 'task' ? tasks.find((t) => t.id === (peek.item.ref as { id: string }).id) : undefined;
  const peekRule = peekEvent ? ruleFrom(peekEvent) : peekTask ? ruleFrom(peekTask) : null;
  const peekPerson = peekEvent?.person_id ?? peekTask?.assignee_id ?? null;

  return (
    <Page
      title="Kalender"
      actions={
        <button type="button" className="btn primary" onClick={() => addActivityAt(dateKeyOf(new Date()), 10 * 60)}>
          <Plus size={18} aria-hidden="true" />
          <span className="desktop-only">Ny hendelse</span>
          <span className="mobile-only">Ny</span>
        </button>
      }
    >
      <div className="tw calendar-shell flex flex-none flex-col overflow-hidden rounded-lg border border-border bg-card">
        <CalendarTopBar
          title={rangeLabel}
          mode={mode}
          modes={narrow ? ['day', 'week'] : ['day', 'week', 'month']}
          modeLabels={{ day: 'Dag', week: 'Uke', month: 'Måned' }}
          railOpen={prefs.railOpen}
          labels={{ today: 'I dag', previous: 'Forrige', next: 'Neste', panel: 'Kalendere' }}
          onStep={step}
          onToday={() => setCursor(new Date())}
          onMode={setMode}
          onToggleRail={toggleRail}
        />
        <div className="flex min-h-0 flex-1">
          {prefs.railOpen && (
            <div className="hidden md:flex">
              <CalendarRail
                month={new Date(year, month, 1)}
                visibleDays={focusDays}
                sources={sources}
                hidden={hidden}
                labels={{ calendar: 'Kalender', tasks: 'Oppgaver', empty: 'Ingen kalendere ennå.' }}
                onMonthChange={(d) => setCursor(d)}
                onSelectDay={(d) => {
                  setCursor(d);
                  if (mode === 'month') setMode('day');
                }}
                onToggle={toggleSource}
                footer={<p className="px-1.5 text-[10.5px] leading-snug text-muted-foreground">Snarveier: T i dag · D/U/M visning · N ny · ← → bla</p>}
              />
            </div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {allHidden && (
              <div className="flex items-center justify-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
                Alle kalendere er skjult.
                <button
                  type="button"
                  className="h-7 cursor-pointer rounded-md border border-border bg-card px-2.5 text-xs text-foreground hover:bg-muted"
                  onClick={() => {
                    setPrefs((p) => ({ ...p, hidden: [] }));
                    writePrefs({ hidden: [] });
                  }}
                >
                  Vis alle
                </button>
              </div>
            )}
            {mode === 'month' ? (
              <MonthGrid
                weeks={monthWeeks}
                items={shownItems}
                focusWeek={monthFocusWeek}
                weeksInView={monthWeeksInView}
                monthLabel={(day) => capFirst(new Date(day + 'T00:00:00').toLocaleDateString(LOCALE, { month: 'short' }))}
                todayKey={dateKeyOf(new Date())}
                weekdayLabels={weekdayLabels}
                moreLabel={(n) => `+${n} flere`}
                onSelect={openCalItem}
                onSelectRange={(a, b) => newEvent({ start_date: a, end_date: b, start_time: null, end_time: null })}
                onDayClick={(day) => {
                  const d = dateFromKey(day);
                  if (!d) return;
                  setCursor(d);
                  setMode('day');
                }}
              />
            ) : (
              <TimeGrid
                className="min-h-0 flex-1"
                days={gridDays}
                items={shownItems}
                columnsInView={mode === 'day' ? 1 : 7}
                focusDay={focusDays[0]}
                labels={{ allDay: 'hele', more: (n) => `+${n} flere`, days: 'dager' }}
                dayHeader={(_day, i) => {
                  const d = cells[i];
                  const isToday = dateKeyOf(d) === dateKeyOf(new Date());
                  const weekday = d.toLocaleDateString(LOCALE, { weekday: 'short' });
                  return (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[11px] text-muted-foreground">{weekday.replace('.', '')}</span>
                      <span
                        className={
                          isToday
                            ? 'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground'
                            : 'text-[13px] font-semibold'
                        }
                      >
                        {d.getDate()}
                      </span>
                    </div>
                  );
                }}
                onSelect={openCalItem}
                onEmptySlot={addActivityAt}
                onCreateRange={(day, start, end, endDay) => addActivityAt(day, start, end, endDay)}
                onMoveItem={moveCalItem}
              />
            )}
          </div>
        </div>
      </div>

      <EventPopover
        item={peek?.item ?? null}
        anchor={peek?.rect ?? null}
        typeLabel={peek ? TYPE_LABEL[peek.item.type] : undefined}
        dateLabel={
          peek
            ? capFirst(new Date(peek.item.startDate + 'T00:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })) +
              (peek.item.endDate !== peek.item.startDate
                ? ` – ${new Date(peek.item.endDate + 'T00:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}`
                : '')
            : undefined
        }
        repeatLabel={peekRule?.freq ? describeRule(peekRule) : undefined}
        personName={peekPerson && personById.has(peekPerson) ? nameOf(peekPerson) : undefined}
        onClose={() => setPeek(null)}
        onEdit={editCalItem}
        onDelete={(item) => editCalItem(item)}
        onToggleDone={async (item) => {
          if (item.ref.kind !== 'task') return;
          const t = tasks.find((x) => x.id === (item.ref as { id: string }).id);
          if (!t) return;
          setPeek(null);
          try {
            await updateTask(t.id, { status: t.status === 'done' ? 'not_started' : 'done' });
            await reload();
            toast.ok(t.status === 'done' ? 'Oppgaven er åpnet igjen.' : t.repeat_freq ? 'Fullført. Neste forekomst er lagt til.' : 'Oppgaven er fullført.');
          } catch (e) {
            toast.error(e);
          }
        }}
      />

      <EventDialog open={eventDialog !== null} event={eventDialog?.event ?? null} draft={eventDialog?.draft} onClose={() => setEventDialog(null)} />
      <TaskDialog open={taskDialog !== null} task={taskDialog} onClose={() => setTaskDialog(null)} />
    </Page>
  );
}

/** ISO-ukenummer. */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
