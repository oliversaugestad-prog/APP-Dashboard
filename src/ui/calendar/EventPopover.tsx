/**
 * Den lille boblen som åpner seg når man klikker på en begivenhet (som i StudyPath).
 *
 * Den lar deg klikke deg gjennom uken uten å miste kalenderen. Full
 * redigering bor i dialogen, ett klikk unna.
 */
import { CheckSquare, Clock, FileText, MapPin, Pencil, Repeat, Trash2, User } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { courseInk, courseTint, typeBarColor } from '../../lib/calendar/appearance';
import { formatHHMM } from '../../lib/calendar/geometry';
import type { CalItem } from '../../lib/calendar/model';

export function EventPopover({
  item,
  anchor,
  typeLabel,
  dateLabel,
  repeatLabel,
  personName,
  onClose,
  onEdit,
  onDelete,
  onToggleDone,
}: {
  item: CalItem | null;
  anchor: DOMRect | null;
  typeLabel?: string;
  dateLabel?: string;
  repeatLabel?: string;
  personName?: string;
  onClose: () => void;
  onEdit: (item: CalItem) => void;
  onDelete?: (item: CalItem) => void;
  onToggleDone?: (item: CalItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = !!item && !!anchor;

  useLayoutEffect(() => {
    if (!open || !anchor) return setPos(null);
    const w = 320;
    const h = ref.current?.offsetHeight ?? 240;
    // Til høyre for chipen, ellers til venstre, og alltid innenfor vinduet.
    let left = anchor.right + 8;
    if (left + w > window.innerWidth - 8) left = anchor.left - w - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [open, anchor, item]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Klikket som åpnet boblen skal ikke lukke den igjen.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open || !item) return null;
  const ink = courseInk(item.color);
  const time = item.allDay ? 'Hele dagen' : `${formatHHMM(item.startMin)}–${formatHHMM(item.endMin)}`;
  const isLink = item.location && /^https?:\/\//i.test(item.location);
  const isTask = item.ref.kind === 'task';

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={item.title}
      className="tw fixed z-[80] w-80 overflow-hidden rounded-md border border-border bg-card text-foreground shadow-xl"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <div className="px-3.5 py-3" style={{ background: courseTint(item.color, 22), color: ink }}>
        <div className={`text-[13px] font-semibold leading-snug ${item.done ? 'line-through' : ''}`}>{item.title}</div>
        {item.subtitle && item.subtitle !== item.title && <div className="mt-0.5 text-[11px] opacity-80">{item.subtitle}</div>}
      </div>

      <div className="space-y-2 px-3.5 py-3 text-[12px]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums text-foreground">
            {dateLabel ? `${dateLabel} · ` : ''}
            {time}
          </span>
        </div>
        {typeLabel && (
          <div className="flex items-center gap-2">
            <span className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: typeBarColor(item.type) }} aria-hidden />
            <span className="text-foreground">{typeLabel}</span>
          </div>
        )}
        {repeatLabel && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Repeat className="h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground">{repeatLabel}</span>
          </div>
        )}
        {personName && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground">{personName}</span>
          </div>
        )}
        {item.location && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="mt-[2px] h-3.5 w-3.5 shrink-0" />
            {isLink ? (
              <a href={item.location} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
                {item.location}
              </a>
            ) : (
              <span className="text-foreground">{item.location}</span>
            )}
          </div>
        )}
        {item.description && item.description !== item.title && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <FileText className="mt-[2px] h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-3 whitespace-pre-wrap text-foreground">{item.description}</span>
          </div>
        )}
        {item.ref.kind === 'task' && item.ref.projected && <div className="text-muted-foreground">Kommende forekomst. Den lages når forrige er fullført.</div>}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        {onDelete && !isTask ? (
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-destructive hover:bg-muted"
            onClick={() => onDelete(item)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Slett
          </button>
        ) : onToggleDone && isTask && !(item.ref.kind === 'task' && item.ref.projected) ? (
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground hover:bg-muted"
            onClick={() => onToggleDone(item)}
          >
            <CheckSquare className="h-3.5 w-3.5" /> {item.done ? 'Åpne igjen' : 'Fullfør'}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-foreground hover:bg-muted"
          onClick={() => onEdit(item)}
        >
          <Pencil className="h-3.5 w-3.5" /> Detaljer
        </button>
      </div>
    </div>,
    document.body,
  );
}
