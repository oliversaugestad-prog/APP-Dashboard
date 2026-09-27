import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Flytende panel under (eller over) et anker, lagt i body slik at det ikke klippes av tabeller med scroll.
 * Lukkes ved klikk utenfor og med Esc.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  children,
  width = 260,
  maxHeight = 440,
  label,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: (focusAnchor?: boolean) => void;
  children: ReactNode;
  width?: number;
  maxHeight?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const place = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.max(r.width, width);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom;
    const top = below < maxHeight && r.top > below ? Math.max(8, r.top - Math.min(maxHeight + 4, r.top - 8)) : r.bottom + 4;
    setPos({ top, left, width: w });
  };

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchorRef.current?.contains(t)) onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current(true);
      }
    };
    const onScroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) place();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !pos) return null;
  return createPortal(
    <div ref={ref} className="popover" role="dialog" aria-label={label} style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight }}>
      {children}
    </div>,
    document.body,
  );
}

/** Enkel meny i et popover-panel. */
export function MenuItem({ icon, children, onClick, danger }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}>
      {icon && (
        <span aria-hidden="true" className="menu-icon">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
