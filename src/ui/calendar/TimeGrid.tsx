/**
 * Tidsrutenettet — dag og uke.
 *
 * Forskjellen fra det gamle rutenettet er hele poenget: her har timen en
 * høyde, så en begivenhet er så lang som den varer og to som kolliderer deler
 * bredden i stedet for å stables. Plasseringen gjøres ikke her, den kommer
 * ferdig regnet fra lib/calendar/layout.ts; denne filen tegner bare.
 *
 * ÉN scroller, to retninger. Uken er ikke en vegg: rutenettet tegner flere
 * dager enn det er plass til, og man scroller sidelengs til dagene før og
 * etter. Derfor er overskriftsraden `sticky top` og timemargen `sticky left`
 * inne i samme boks — to separate scrollere ville kommet ut av takt med
 * hverandre i det øyeblikket man dro i den ene.
 *
 * Kolonnene måles i piksler, ikke i `1fr`: en brøkdel av en flate som er
 * bredere enn skjermen gir kolonner ingen kan lese. Bredden regnes ut fra hvor
 * mange dager som skal få plass i vinduet (`columnsInView`), med et gulv slik
 * at en telefon heller scroller enn å klemme sju dager inn på 380 piksler.
 *
 * Høyden: rutenettet scroller inni seg selv, og skallet rundt får aldri en
 * fast `dvh`-høyde. Eksamensoppsettet gjorde nettopp det, og «Send inn svar»
 * ble usynlig bak en indre scroller. Her er det `flex` + `min-h-0` hele veien.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutColumns } from '../../lib/calendar/layout';
import { DEFAULT_SCROLL_MIN, HOUR_PX, MIN_CHIP_PX, formatHHMM, minutesToPx } from '../../lib/calendar/geometry';
import { clipToDay, itemsForDay, splitByPlacement, type CalItem } from '../../lib/calendar/model';
import { AllDayRow } from './AllDayRow';
import { EventChip, densityFor } from './EventChip';
import { NowLine, useNowMinutes } from './NowLine';
import { useGridDrag } from './useGridDrag';
import { cn } from '../../lib/cn';

const GUTTER_PX = 48;
const HEADER_PX = 34;
/** Smaleste en dagkolonne får bli før rutenettet heller scroller. */
const MIN_COL_PX = 104;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export type TimeGridLabels = {
  allDay: string;
  more: (n: number) => string;
  /** «dager» — etter antallet når et nytt tidsrom dras over flere dager. */
  days?: string;
};

export function TimeGrid({
  days,
  items,
  labels,
  columnsInView,
  focusDay,
  dayHeader,
  onSelect,
  onEmptySlot,
  onCreateRange,
  onMoveItem,
  className,
}: {
  /** Alle datonøklene som tegnes — også de man må scrolle til. */
  days: string[];
  items: CalItem[];
  labels: TimeGridLabels;
  /** Hvor mange dager som skal fylle vinduet. Sju i uke, én i dag. */
  columnsInView: number;
  /** Dagen vinduet skal stå på. Rutenettet scroller hit når den endrer seg. */
  focusDay?: string;
  /** Kolonneoverskriften — visningen eier språket og «i dag»-markeringen. */
  dayHeader: (day: string, index: number) => React.ReactNode;
  onSelect?: (item: CalItem, rect: DOMRect) => void;
  /** Klikk i tomrommet: dagen og minuttet, snappet til nærmeste kvarter. */
  onEmptySlot?: (day: string, minutes: number) => void;
  /** Et drag i tomrommet ga et helt tidsrom — over flere dager når `endDay` er satt. */
  onCreateRange?: (day: string, startMin: number, endMin: number, endDay?: string) => void;
  /** En begivenhet ble flyttet eller forlenget. */
  onMoveItem?: (item: CalItem, day: string, startMin: number, endMin: number) => void;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const now = useNowMinutes();
  const todayIndex = days.indexOf(now.dayKey);

  const { allDay, timed } = useMemo(() => splitByPlacement(items), [items]);

  /**
   * Kolonnebredden i piksler. Måles av vinduet, ikke av flaten: flaten er
   * bredere enn vinduet så snart det er noe å scrolle til.
   */
  const [colWidth, setColWidth] = useState(MIN_COL_PX);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const usable = el.clientWidth - GUTTER_PX;
      if (usable <= 0) return;
      setColWidth(Math.max(MIN_COL_PX, usable / Math.max(1, columnsInView)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [columnsInView]);

  const canvasWidth = GUTTER_PX + colWidth * days.length;
  const gridCols = `${GUTTER_PX}px repeat(${days.length}, ${colWidth}px)`;

  /**
   * Kolonneoppsettet regnes per dag, ikke for hele uken: to begivenheter på
   * hver sin dag kolliderer ikke, uansett hvor mye klokkeslettene overlapper.
   */
  const byDay = useMemo(
    () =>
      days.map((day) => {
        const dayItems = itemsForDay(timed, day).map((item) => ({
          item,
          key: item.key,
          ...clipToDay(item, day),
        }));
        return layoutColumns(dayItems);
      }),
    [days, timed],
  );

  /**
   * Åpne der dagen begynner, ikke ved midnatt — og på nå-linjen når den er
   * synlig, slik at «i dag» faktisk står på skjermen.
   *
   * Effekten venter til rutenettet er MÅLT (`colWidth`), ikke bare montert.
   * Setter man scrollTop før flaten har høyde, klipper nettleseren den til
   * null, og kalenderen åpner på natten — som den gjorde.
   */
  const firstScroll = useRef(true);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !firstScroll.current) return;
    if (el.scrollHeight <= el.clientHeight) return; // ikke målt ennå
    firstScroll.current = false;
    const target = todayIndex >= 0 ? Math.min(now.minutes - 90, DEFAULT_SCROLL_MIN) : DEFAULT_SCROLL_MIN;
    el.scrollTop = Math.max(0, minutesToPx(target));
    // todayIndex/now endrer seg hvert minutt; scrollen skal bare skje én gang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colWidth]);

  // Et bytte av vindu (ny uke, ny dag) skal ikke rykke den loddrette scrollen —
  // men et bytte fra måned til uke skal, ellers står man på midnatt.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollTop === 0) el.scrollTop = Math.max(0, minutesToPx(DEFAULT_SCROLL_MIN));
  }, [days.length]);

  // Sidelengs: still vinduet på dagen visningen står på. Dette er det eneste
  // stedet den vannrette scrollen flyttes for studenten — resten er hennes.
  // `days` er en ny liste hver render, så den kan ikke stå i avhengighetene:
  // effekten ville kjørt hver gang og dratt scrollen tilbake i det studenten
  // prøvde å dra den. Første dag i vinduet er nok til å vite at den er ny.
  const windowStart = days[0];
  const daysRef = useRef(days);
  daysRef.current = days;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !focusDay) return;
    const index = daysRef.current.indexOf(focusDay);
    if (index < 0) return;
    el.scrollLeft = index * colWidth;
  }, [focusDay, windowStart, colWidth]);

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const { draft, startCreate, startMove, consumedByDrag } = useGridDrag({
    days,
    surfaceRef,
    onClickEmpty: onEmptySlot,
    onCreate: onCreateRange,
    onMove: (key, day, startMin, endMin) => {
      const item = byKey.get(key);
      if (item) onMoveItem?.(item, day, startMin, endMin);
    },
  });

  // Et drag ender også i et `click`; det skal ikke åpne boblen.
  const selectUnlessDragged = onSelect
    ? (item: CalItem, rect: DOMRect) => {
        if (consumedByDrag()) return;
        onSelect(item, rect);
      }
    : undefined;

  const draftIndex = draft ? days.indexOf(draft.day) : -1;
  const draftSpan = draft?.endDay && draftIndex >= 0 ? Math.max(1, days.indexOf(draft.endDay) - draftIndex + 1) : 1;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={scrollerRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: canvasWidth, minWidth: '100%' }}>
          {/* Overskriftsraden blir stående når man scroller nedover. */}
          <div className="sticky top-0 z-30 grid border-b border-border bg-card" style={{ gridTemplateColumns: gridCols, height: HEADER_PX }}>
            <div className="sticky left-0 z-10 bg-card" />
            {days.map((day, i) => (
              <div key={day} className={cn('flex items-center border-l border-border/50 px-2', i === todayIndex && 'bg-primary/[0.05]')}>
                {dayHeader(day, i)}
              </div>
            ))}
          </div>

          {/* Heldagsraden henger under overskriften, over rutenettet. */}
          <div className="sticky z-20 bg-card" style={{ top: HEADER_PX }}>
            <AllDayRow days={days} items={allDay} gutterPx={GUTTER_PX} colWidth={colWidth} label={labels.allDay} moreLabel={labels.more} onSelect={onSelect} />
          </div>

          <div className="relative grid" style={{ gridTemplateColumns: gridCols, height: 24 * HOUR_PX }}>
            {/* Dagfeltet uten margen: draget måler geometrien sin på denne. */}
            <div ref={surfaceRef} data-testid="calendar-surface" className="pointer-events-none absolute inset-y-0" style={{ left: GUTTER_PX, right: 0 }} />

            {/* Timemargen blir stående når man scroller sidelengs. */}
            <div className="sticky left-0 z-20 bg-card">
              <div className="relative h-full">
                {HOURS.map((h) => (
                  <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[9.5px] tabular-nums text-muted-foreground" style={{ top: h * HOUR_PX }}>
                    {h === 0 ? '' : String(h).padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>

            {days.map((day, i) => (
              <div
                key={day}
                data-testid={`calendar-day-${day}`}
                onPointerDown={onEmptySlot || onCreateRange ? startCreate : undefined}
                className={cn(
                  'relative border-l border-border/50',
                  i === todayIndex && 'bg-primary/[0.035]',
                  // Ikke `cursor-copy`: macOS tegner den som en pil med et
                  // grønt pluss, og da ser hele rutenettet ut som en
                  // slipp-sone. Notion har vanlig peker her.
                )}
              >
                {HOURS.map((h) => (
                  <div key={h} className="pointer-events-none absolute inset-x-0 border-b border-border/40" style={{ top: h * HOUR_PX, height: HOUR_PX }} />
                ))}
                {byDay[i].map(({ item: slot, left, width, stackIndex }) => {
                  const top = minutesToPx(slot.startMin);
                  const height = Math.max(MIN_CHIP_PX, minutesToPx(slot.endMin - slot.startMin));
                  const past = day < now.dayKey || (day === now.dayKey && slot.endMin <= now.minutes);
                  const dragging = draft?.key === slot.key;
                  return (
                    <EventChip
                      key={slot.key}
                      item={slot.item}
                      density={densityFor(height)}
                      past={past}
                      resizable={!!onMoveItem}
                      onGrab={onMoveItem ? startMove : undefined}
                      onSelect={selectUnlessDragged}
                      style={{
                        top,
                        height: height - 1,
                        left: `calc(${left * 100}% + ${1 + stackIndex * 6}px)`,
                        width: `calc(${width * 100}% - ${2 + stackIndex * 6}px)`,
                        zIndex: 5 + stackIndex,
                        // Den som dras tegnes som utkast et annet sted.
                        opacity: dragging ? 0.25 : undefined,
                      }}
                      className={stackIndex > 0 ? 'shadow-sm' : undefined}
                    />
                  );
                })}
              </div>
            ))}

            {draft && draftIndex >= 0 && (
              <div
                className="pointer-events-none absolute z-30 overflow-hidden rounded-[5px] border border-primary/60 bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary shadow-sm"
                style={{
                  top: minutesToPx(draft.startMin),
                  height: Math.max(MIN_CHIP_PX, minutesToPx(draft.endMin - draft.startMin)),
                  left: GUTTER_PX + draftIndex * colWidth + 2,
                  width: draftSpan * colWidth - 4,
                }}
              >
                {formatHHMM(draft.startMin)}–{formatHHMM(draft.endMin)}
                {draftSpan > 1 ? ` · ${draftSpan} ${labels.days ?? 'd'}` : ''}
              </div>
            )}

            {todayIndex >= 0 && <NowLine minutes={now.minutes} gutterPx={GUTTER_PX} dotLeftPx={todayIndex * colWidth} />}
          </div>
        </div>
      </div>
    </div>
  );
}
