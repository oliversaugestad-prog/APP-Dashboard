/**
 * Måneden.
 *
 * Ikke chips i bokser, men tette énlinjes rader: fargestrek, klokkeslett,
 * tittel. Det er den formen som gjør at en måned kan leses — en boks på 110 px
 * har plass til fire linjer, ikke fire kort.
 *
 * Flerdagers begivenheter tegnes som sammenhengende bjelker øverst i uken, og
 * dagens egne rader begynner under dem. Derfor får hver celle en toppmarg som
 * er nøyaktig så høy som bjelkene i den uken.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { packLanes } from '../../lib/calendar/layout';
import { formatHHMM } from '../../lib/calendar/geometry';
import { itemsForDay, splitByPlacement, type CalItem } from '../../lib/calendar/model';
import { chipSkin, emphasisFor } from '../../lib/calendar/appearance';
import { cn } from '../../lib/cn';

/** Høyden datotallet øverst i cellen opptar. */
const DAY_NUMBER_H = 26;
const LANE_H = 18;
const LANE_GAP = 2;
const ROW_H = 17;
const MAX_LANES = 2;

export function MonthGrid({
  weeks,
  items,
  focusWeek,
  weeksInView,
  monthLabel,
  todayKey,
  weekdayLabels,
  moreLabel,
  onSelect,
  onDayClick,
  onSelectRange,
  className,
}: {
  /** Ukene i måneden, hver med sju datonøkler. */
  weeks: string[][];
  items: CalItem[];
  /**
   * Uken måneden begynner på. Rutenettet ruller hit — som uken ruller
   * sidelengs til den uken du står i.
   */
  focusWeek?: string;
  /** Hvor mange uker som skal fylle vinduet. Månedens egne, 5 eller 6. */
  weeksInView: number;
  /** Månedsnavn til den 1., så man vet hvor man er når man har rullet. */
  monthLabel: (day: string) => string;
  todayKey: string;
  weekdayLabels: string[];
  moreLabel: (n: number) => string;
  onSelect?: (item: CalItem, rect: DOMRect) => void;
  onDayClick?: (day: string) => void;
  /** Et drag over flere dager med musen: fra og med, til og med. */
  onSelectRange?: (startDay: string, endDay: string) => void;
  className?: string;
}) {
  const { allDay, timed } = splitByPlacement(items);

  /**
   * Dra over flere dager for å lage noe som varer i flere dager. Bare med mus
   * og penn: på berøring er et drag i måneden en rulling, og det skal det
   * fortsatt være.
   */
  const [range, setRange] = useState<{ anchor: string; current: string } | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const suppressClick = useRef(false);
  useEffect(() => {
    if (!range) return;
    const dayAt = (x: number, y: number) => (document.elementFromPoint?.(x, y)?.closest('[data-day]') as HTMLElement | null)?.dataset.day;
    const move = (e: PointerEvent) => {
      const day = dayAt(e.clientX, e.clientY);
      const cur = rangeRef.current;
      if (day && cur && day !== cur.current) setRange({ ...cur, current: day });
    };
    const up = () => {
      const cur = rangeRef.current;
      setRange(null);
      if (!cur || cur.anchor === cur.current) return;
      suppressClick.current = true;
      const [a, b] = [cur.anchor, cur.current].sort();
      onSelectRange?.(a, b);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // Lytterne settes opp når et drag starter og tas ned når det slutter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range !== null]);
  const inRange = (day: string) => {
    if (!range || range.anchor === range.current) return false;
    const [a, b] = [range.anchor, range.current].sort();
    return day >= a && day <= b;
  };

  /**
   * Hvor mange rader det er plass til i en celle.
   *
   * Taket var hardkodet til tre, uansett hvor høy måneden faktisk var — så en
   * skjerm med rikelig plass viste «+4 flere» på en halvtom celle. Nå måles
   * radhøyden, og cellen tar så mange som får plass.
   */
  const weeksRef = useRef<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = useState(0);
  useLayoutEffect(() => {
    const el = weeksRef.current;
    if (!el) return;
    // Månedens EGNE uker fyller vinduet; naboukene ligger utenfor og nås ved
    // å rulle. Derfor deles på weeksInView, ikke på antall tegnede uker.
    const measure = () => setRowHeight(el.clientHeight / Math.max(1, weeksInView));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [weeksInView]);

  // Still vinduet på måneden man står i. Som den vannrette scrollen i uken er
  // dette det eneste stedet rullingen flyttes for studenten — resten er hennes.
  const weeksKey = weeks[0]?.[0];
  const weeksRefList = useRef(weeks);
  weeksRefList.current = weeks;
  useEffect(() => {
    const el = weeksRef.current;
    if (!el || !focusWeek || !rowHeight) return;
    const index = weeksRefList.current.findIndex((w) => w[0] === focusWeek);
    if (index < 0) return;
    el.scrollTop = index * rowHeight;
  }, [focusWeek, weeksKey, rowHeight]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="grid grid-cols-7 border-b border-border text-[10px] font-medium text-muted-foreground">
        {weekdayLabels.map((d) => (
          <div key={d} className="truncate border-l border-border/50 px-2 py-1.5 first:border-l-0">
            {d}
          </div>
        ))}
      </div>

      <div ref={weeksRef} className="min-h-0 flex-1 overflow-y-auto">
        {weeks.map((week) => {
          const { lanes, laneCount, overflow } = packLanes(allDay, week, { maxLanes: MAX_LANES });
          const laneHeight = laneCount * (LANE_H + LANE_GAP);
          // Datotallet på toppen, bjelkene, og litt luft i bunnen.
          const plass = rowHeight - DAY_NUMBER_H - laneHeight - 4;
          const kapasitet = Math.max(1, Math.floor(plass / ROW_H));
          return (
            <div
              key={week[0]}
              className="relative border-b border-border last:border-b-0"
              style={{ height: rowHeight || undefined, minHeight: rowHeight ? undefined : 92 }}
            >
              <div className="grid h-full grid-cols-7">
                {week.map((day) => {
                  const first = day.slice(8, 10) === '01';
                  const dayTimed = itemsForDay(timed, day);
                  const skjulte = (overflow[day] ?? 0) + Math.max(0, dayTimed.length - kapasitet);
                  // Trengs en «+N flere»-linje, spiser den en av radene.
                  const room = skjulte > 0 ? Math.max(1, kapasitet - 1) : kapasitet;
                  const shown = dayTimed.slice(0, room);
                  const hiddenCount = dayTimed.length - shown.length + (overflow[day] ?? 0);
                  return (
                    <button
                      key={day}
                      type="button"
                      data-day={day}
                      onPointerDown={(e) => {
                        if (!onSelectRange || e.pointerType === 'touch' || e.button !== 0) return;
                        if ((e.target as HTMLElement).closest('[role=button]')) return;
                        suppressClick.current = false;
                        setRange({ anchor: day, current: day });
                      }}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        onDayClick?.(day);
                      }}
                      className={cn(
                        'flex h-full select-none flex-col items-stretch overflow-hidden border-l border-border/50 px-1 pb-1 text-left first:border-l-0 transition-colors hover:bg-muted/40',
                        inRange(day) && 'bg-primary/10 hover:bg-primary/15',
                      )}
                    >
                      <div className="flex items-center justify-end gap-1 px-0.5 pt-1">
                        {first && <span className="mr-auto truncate text-[10px] font-semibold text-foreground">{monthLabel(day)}</span>}
                        <span
                          className={cn(
                            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] tabular-nums',
                            day === todayKey ? 'bg-destructive font-semibold text-white' : 'text-muted-foreground',
                          )}
                        >
                          {Number(day.slice(8, 10))}
                        </span>
                      </div>
                      {/* Plassen bjelkene over uken opptar. */}
                      <div style={{ height: laneHeight }} />
                      <div className="min-h-0 space-y-[1px]">
                        {shown.map((item) => (
                          <span
                            key={item.key}
                            role="button"
                            tabIndex={0}
                            title={`${item.title} · ${formatHHMM(item.startMin)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect?.(item, e.currentTarget.getBoundingClientRect());
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter' && e.key !== ' ') return;
                              e.preventDefault();
                              e.stopPropagation();
                              onSelect?.(item, e.currentTarget.getBoundingClientRect());
                            }}
                            className="flex cursor-pointer items-center gap-1 truncate rounded-[3px] px-1 text-[10.5px] leading-[16px] hover:bg-muted"
                            style={{ height: ROW_H }}
                          >
                            <span className="h-[11px] w-[2.5px] shrink-0 rounded-full" style={{ background: item.color }} />
                            <span className="shrink-0 tabular-nums text-muted-foreground">{formatHHMM(item.startMin)}</span>
                            <span className="truncate">{item.title}</span>
                          </span>
                        ))}
                        {hiddenCount > 0 && <span className="block px-1 text-[10px] text-muted-foreground">{moreLabel(hiddenCount)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Bjelkene ligger over cellene, så et spenn blir én strek. */}
              <div className="pointer-events-none absolute inset-x-0" style={{ top: 26 }}>
                {lanes.map(({ item, lane, startIndex, span, continuesBefore, continuesAfter }) => {
                  const skin = chipSkin(item.color, emphasisFor(item.type), { type: item.type });
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(item, e.currentTarget.getBoundingClientRect());
                      }}
                      title={item.title}
                      className={cn(
                        'pointer-events-auto absolute flex items-center overflow-hidden px-1.5 text-[10px] font-medium',
                        continuesBefore ? 'rounded-l-none' : 'rounded-l-[4px]',
                        continuesAfter ? 'rounded-r-none' : 'rounded-r-[4px]',
                      )}
                      style={{
                        left: `calc(${(startIndex / 7) * 100}% + 3px)`,
                        width: `calc(${(span / 7) * 100}% - 6px)`,
                        top: lane * (LANE_H + LANE_GAP),
                        height: LANE_H,
                        background: skin.background,
                        color: skin.color,
                      }}
                    >
                      <span className={cn('truncate', item.done && 'line-through opacity-60')}>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
