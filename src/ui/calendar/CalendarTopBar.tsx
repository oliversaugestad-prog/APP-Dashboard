/**
 * Topplinjen over kalenderen.
 *
 * Samme rekkefølge som Notion: panelknapp helt til venstre, så navigasjonen og
 * hvor du er, og visningsvelgeren og handlingene til høyre. Den er én rad, og
 * den blir stående — knappene skal ikke flytte seg når man blar.
 */
import { ChevronLeft, ChevronRight, PanelLeft, PanelLeftClose } from 'lucide-react';
import type { CalMode } from '../../lib/calendar/prefs';
import { cn } from '../../lib/cn';

export function CalendarTopBar({
  title,
  mode,
  modes = ['day', 'week', 'month'],
  modeLabels,
  railOpen,
  labels,
  actions,
  onStep,
  onToday,
  onMode,
  onToggleRail,
}: {
  title: string;
  mode: CalMode;
  /** Visningene som tilbys. Telefonen får ikke måned — den blir uleselig. */
  modes?: CalMode[];
  modeLabels: Record<CalMode, string>;
  railOpen: boolean;
  labels: { today: string; previous: string; next: string; panel: string };
  actions?: React.ReactNode;
  onStep: (dir: 1 | -1) => void;
  onToday: () => void;
  onMode: (m: CalMode) => void;
  onToggleRail: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <button
        type="button"
        onClick={onToggleRail}
        aria-label={labels.panel}
        aria-expanded={railOpen}
        // Panelet finnes bare fra md og opp; under det er skjermen for smal.
        className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:block"
      >
        {railOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </button>

      <div className="flex items-center">
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label={labels.previous}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label={labels.next}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        className="h-7 cursor-pointer rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        onClick={onToday}
      >
        {labels.today}
      </button>

      <h2 className="ml-1 min-w-0 truncate text-sm font-semibold">{title}</h2>

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              className={cn(
                'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
                mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>
        {actions}
      </div>
    </div>
  );
}
