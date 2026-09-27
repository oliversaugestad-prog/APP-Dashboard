/**
 * Sidepanelet: minimåneden og listen over kalenderkilder.
 *
 * Kildene er gruppert slik Notion grupperer kontoer — våre egne øverst, det
 * som kommer utenfra under. Et klikk på fargeruten skrur kilden av, og valget
 * ligger i localStorage, ikke i basen: en kalender du har skjult på laptopen
 * skal ikke også være skjult på telefonen.
 */
import { cn } from '../../lib/cn';
import { Check } from 'lucide-react';
import { MiniMonth } from './MiniMonth';

/** En rad i kildelisten: en hendelsestype eller oppgavene. */
export type CalSource = {
  id: string;
  label: string;
  color: string;
  count: number;
  group: 'calendar' | 'tasks';
};

export function CalendarRail({
  month,
  visibleDays,
  sources,
  hidden,
  labels,
  footer,
  hiddenBySemester = 0,
  hiddenBySemesterLabel,
  onMonthChange,
  onSelectDay,
  onToggle,
}: {
  month: Date;
  visibleDays: string[];
  sources: CalSource[];
  hidden: Set<string>;
  labels: { calendar: string; tasks: string; empty: string };
  /** Nederst i panelet, under kildene — der innstillingene bor. */
  footer?: React.ReactNode;
  /** Fag som er utenfor semesteret, og derfor ikke står i listen. */
  hiddenBySemester?: number;
  hiddenBySemesterLabel?: (n: number) => string;
  onMonthChange: (d: Date) => void;
  onSelectDay: (d: Date) => void;
  onToggle: (id: string) => void;
}) {
  const groups: { key: 'calendar' | 'tasks'; label: string }[] = [
    { key: 'calendar', label: labels.calendar },
    { key: 'tasks', label: labels.tasks },
  ];

  return (
    <div className="flex h-full min-h-0 w-[190px] shrink-0 flex-col border-r border-border bg-sidebar/40">
      <div className="border-b border-border px-3 py-3">
        <MiniMonth month={month} visibleDays={visibleDays} onMonthChange={onMonthChange} onSelect={onSelectDay} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.map((g) => {
          const rows = sources.filter((s) => s.group === g.key);
          if (rows.length === 0) return null;
          return (
            <div key={g.key} className="mb-3 last:mb-0">
              <div className="px-1.5 pb-1 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
              {g.key === 'calendar' && hiddenBySemester > 0 && hiddenBySemesterLabel && (
                // Uten denne ser det ut som fagene er borte. De er bare fra et
                // annet semester enn det profilen står på.
                <div className="px-1.5 pb-1 text-[10.5px] leading-snug text-muted-foreground/80">{hiddenBySemesterLabel(hiddenBySemester)}</div>
              )}
              {rows.map((s) => {
                const off = hidden.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onToggle(s.id)}
                    aria-pressed={!off}
                    title={s.label}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-md px-1.5 py-[5px] text-left transition-colors hover:bg-muted/60',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[3.5px] border transition-colors',
                        off ? 'border-border bg-transparent' : 'border-transparent',
                      )}
                      style={off ? undefined : { background: s.color }}
                    >
                      {!off && <Check className="h-2.5 w-2.5 text-foreground/55" strokeWidth={3} />}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate text-[11.5px]', off ? 'text-muted-foreground/70' : 'text-foreground')}>{s.label}</span>
                    {s.count > 0 && <span className="shrink-0 text-[9.5px] tabular-nums text-muted-foreground/70">{s.count}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
        {sources.length === 0 && <div className="px-1.5 py-2 text-[11px] text-muted-foreground">{labels.empty}</div>}
      </div>

      {footer && <div className="border-t border-border px-2 py-2">{footer}</div>}
    </div>
  );
}
