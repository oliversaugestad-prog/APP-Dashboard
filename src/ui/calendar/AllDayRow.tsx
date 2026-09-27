/**
 * Raden over tidsrutenettet: alt som ikke har et klokkeslett å henge på.
 *
 * Den er ikke bare en liste — bjelkene stables i baner (packLanes) slik at en
 * begivenhet som varer fra fredag til mandag blir én sammenhengende strek over
 * fire dager, i samme bane hele veien.
 */
import { packLanes } from '../../lib/calendar/layout';
import type { CalItem } from '../../lib/calendar/model';
import { chipSkin, emphasisFor } from '../../lib/calendar/appearance';
import { cn } from '../../lib/cn';

const LANE_H = 20;
const LANE_GAP = 3;
const MAX_LANES = 3;

export function AllDayRow({
  days,
  items,
  gutterPx,
  colWidth,
  label,
  moreLabel,
  onSelect,
}: {
  days: string[];
  items: CalItem[];
  gutterPx: number;
  /** Kolonnebredden i piksler — den samme som rutenettet under. */
  colWidth: number;
  /** Oversatt «hele dagen»-etikett i margen. */
  label: string;
  /** (n) => «+2 flere» */
  moreLabel: (n: number) => string;
  onSelect?: (item: CalItem, rect: DOMRect) => void;
}) {
  const { lanes, laneCount, overflow } = packLanes(items, days, { maxLanes: MAX_LANES });
  const rows = Math.max(1, laneCount);
  const height = rows * LANE_H + (rows - 1) * LANE_GAP + 8;

  return (
    <div
      data-testid="calendar-allday"
      className="grid border-b border-border"
      style={{ gridTemplateColumns: `${gutterPx}px repeat(${days.length}, ${colWidth}px)` }}
    >
      <div className="sticky left-0 z-10 flex items-start justify-end bg-card pr-1.5 pt-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="relative" style={{ gridColumn: `2 / span ${days.length}`, height }}>
        {/* Skillelinjene mellom dagene, så raden leser som en del av rutenettet. */}
        <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => (
            <div key={d} className="border-l border-border/50 first:border-l-0" />
          ))}
        </div>
        {lanes.map(({ item, lane, startIndex, span, continuesBefore, continuesAfter }) => {
          const skin = chipSkin(item.color, emphasisFor(item.type), { type: item.type });
          return (
            <button
              key={item.key}
              type="button"
              onClick={(e) => onSelect?.(item, e.currentTarget.getBoundingClientRect())}
              title={item.title}
              className={cn(
                'absolute flex items-center gap-1 overflow-hidden px-2 text-[10.5px] font-medium',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                continuesBefore ? 'rounded-l-none' : 'rounded-l-[5px]',
                continuesAfter ? 'rounded-r-none' : 'rounded-r-[5px]',
              )}
              style={{
                left: `calc(${(startIndex / days.length) * 100}% + 2px)`,
                width: `calc(${(span / days.length) * 100}% - 4px)`,
                top: 4 + lane * (LANE_H + LANE_GAP),
                height: LANE_H,
                background: skin.background,
                color: skin.color,
                // En bjelke som fortsetter fra forrige uke skal ikke få en ny
                // kantstrek midt i spennet sitt.
                borderLeftWidth: continuesBefore ? 0 : skin.borderLeftWidth,
                borderLeftStyle: skin.borderLeftStyle,
                borderLeftColor: skin.borderLeftColor,
                paddingLeft: continuesBefore ? 8 : 6,
              }}
            >
              <span className={cn('truncate', item.done && 'line-through opacity-60')}>{item.title}</span>
            </button>
          );
        })}
        {/* Det som ikke fikk plass, talt opp per dag. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) =>
            overflow[d] ? (
              <div key={d} className="px-2 text-[9.5px] text-muted-foreground">
                {moreLabel(overflow[d])}
              </div>
            ) : (
              <div key={d} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
