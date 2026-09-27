/**
 * Minimåneden i sidepanelet.
 *
 * Den er ikke en ekstra kalender — den er navigasjon. Uken du står i er
 * markert med en svak flate, i dag er en fylt sirkel, og et klikk flytter
 * hovedvisningen dit uten å bytte visningsmodus.
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
import { dateKeyOf } from '../../lib/calendar/model';
import { cn } from '../../lib/cn';

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function MiniMonth({
  month,
  visibleDays,
  onMonthChange,
  onSelect,
}: {
  /** Måneden som vises. Bare år og måned brukes. */
  month: Date;
  /** Datonøklene hovedvisningen viser nå, så uken kan markeres. */
  visibleDays: string[];
  onMonthChange: (d: Date) => void;
  onSelect: (d: Date) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const lead = (first.getDay() + 6) % 7; // 0 = mandag
  const start = new Date(year, m, 1 - lead);
  const today = new Date();
  const todayKey = dateKeyOf(today);
  const visible = new Set(visibleDays);

  // Seks rader dekker enhver måned, også en mars som starter på en søndag.
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return d;
  });

  const locale = 'nb-NO';
  // 5. januar 2026 var en mandag — en fast uke å hente ukedagsbokstavene fra,
  // så de følger språket uten en hardkodet liste per språk.
  const weekdays = Array.from({ length: 7 }, (_, i) => capFirst(new Date(2026, 0, 5 + i).toLocaleDateString(locale, { weekday: 'narrow' })));

  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-center gap-1">
        <span className="text-[12px] font-semibold">{capFirst(month.toLocaleDateString(locale, { month: 'long', year: 'numeric' }))}</span>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            aria-label="Forrige måned"
            onClick={() => onMonthChange(new Date(year, m - 1, 1))}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Neste måned"
            onClick={() => onMonthChange(new Date(year, m + 1, 1))}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[9.5px] text-muted-foreground">
        {weekdays.map((w, i) => (
          <span key={i} className="py-0.5">
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10.5px] tabular-nums">
        {cells.map((d) => {
          const key = dateKeyOf(d);
          const outside = d.getMonth() !== m;
          const isToday = key === todayKey;
          const inView = visible.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                'mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-[5px] transition-colors',
                outside && 'text-muted-foreground/45',
                inView && !isToday && 'bg-primary/10 text-foreground',
                isToday && 'bg-destructive font-semibold text-white',
                !isToday && 'hover:bg-muted',
              )}
              aria-current={isToday ? 'date' : undefined}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
