/**
 * Én begivenhet på flaten.
 *
 * To kanaler, to spørsmål: fyllet sier hvilket FAG (fagets pastell), og
 * kantstreken til venstre sier hva slags TIME det er (aktivitetens mettede
 * farge). De to palettene deler ingen farger, så de kan ikke forveksles.
 * Regnestykket bor i lib/calendar/appearance.ts — her brukes det bare.
 */
import { chipSkin, emphasisFor } from '../../lib/calendar/appearance';
import { formatHHMM } from '../../lib/calendar/geometry';
import type { CalItem } from '../../lib/calendar/model';
import { cn } from '../../lib/cn';

/**
 * Hvor mye chipen får plass til. Avledet av høyden, ikke valgt av den som
 * kaller: en 30-minutters time har ikke rom for to linjer uansett hvor gjerne
 * vi vil vise klokkeslettet.
 */
export type ChipDensity = 'full' | 'compact' | 'line';

export function densityFor(heightPx: number): ChipDensity {
  if (heightPx >= 42) return 'full';
  if (heightPx >= 26) return 'compact';
  return 'line';
}

export function EventChip({
  item,
  density = 'full',
  past = false,
  className,
  style,
  onSelect,
  onGrab,
  resizable = false,
}: {
  item: CalItem;
  density?: ChipDensity;
  /** Tonet ned fordi den er over. */
  past?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Chipen ble klikket. Rektangelet følger med, så en popover kan peke på den. */
  onSelect?: (item: CalItem, rect: DOMRect) => void;
  /** Pekeren tok tak — i kroppen for å flytte, i underkanten for å forlenge. */
  onGrab?: (e: React.PointerEvent, item: CalItem, kind: 'move' | 'resize') => void;
  resizable?: boolean;
}) {
  const time = item.allDay ? undefined : `${formatHHMM(item.startMin)}–${formatHHMM(item.endMin)}`;
  const skin = chipSkin(item.color, emphasisFor(item.type), { type: item.type });
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(item, (e.currentTarget as HTMLElement).getBoundingClientRect());
      }}
      onPointerDown={(e) => {
        // Stopp ALLTID, også for skrivebeskyttede timer. Slipper vi den videre,
        // starter kolonnen under et «lag ny»-drag, og et klikk på en time åpner
        // både boblen og skjemaet for ny begivenhet samtidig.
        e.stopPropagation();
        if (!item.editable || !onGrab) return;
        onGrab(e, item, 'move');
      }}
      title={time ? `${item.title} · ${time}` : item.title}
      className={cn(
        'group absolute overflow-hidden rounded-[5px] pl-[5px] pr-1.5 text-left transition-opacity',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        density === 'line' ? 'py-0' : 'py-[2px]',
        past && 'opacity-55 hover:opacity-80',
        item.done && 'line-through opacity-60',
        className,
      )}
      style={{ ...skin, ...style }}
    >
      {density === 'line' ? (
        <div className="flex items-baseline gap-1 truncate text-[10.5px] leading-[16px]">
          {time && <span className="shrink-0 tabular-nums opacity-70">{formatHHMM(item.startMin)}</span>}
          <span className="truncate font-medium">{item.title}</span>
        </div>
      ) : (
        <>
          {/* Høye chips får brekke tittelen; korte har ikke rom til linje to. */}
          <div className={cn('text-[11px] font-semibold leading-[14px]', density === 'full' ? 'line-clamp-2' : 'truncate')}>{item.title}</div>
          {density === 'full' && time && <div className="truncate text-[10px] leading-[14px] tabular-nums opacity-75">{time}</div>}
          {density === 'compact' && time && <div className="truncate text-[9.5px] leading-[12px] tabular-nums opacity-70">{formatHHMM(item.startMin)}</div>}
        </>
      )}
      {resizable && item.editable && onGrab && (
        <span
          // Griper man de nederste pikslene, endrer man lengden i stedet for
          // å flytte. Samme kant som i Notion — usynlig til man er over den.
          onPointerDown={(e) => {
            e.stopPropagation();
            onGrab(e, item, 'resize');
          }}
          className="absolute inset-x-0 bottom-0 h-[6px] cursor-ns-resize"
        />
      )}
    </button>
  );
}
