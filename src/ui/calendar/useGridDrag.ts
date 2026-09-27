/**
 * Å dra i rutenettet: lage, flytte og forlenge.
 *
 * Alle tre er samme gest med ulikt utgangspunkt, så de bor i én hook. To
 * separate systemer som begge lytter på pekeren ender med å slåss om den —
 * særlig på berøringsskjerm, der et drag på en chip også er et drag på flaten
 * under den.
 *
 * `PointerEvent`, ikke mus: da virker det på iPad uten en egen kodesti. Og
 * `setPointerCapture` gjør at draget følger fingeren selv når den forlater
 * kolonnen den startet i.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_EVENT_MIN, SNAP_MIN, clampToDay, pxToMinutes, snapMinutes } from '../../lib/calendar/geometry';
import { HOLD_MS, MOVE_THRESHOLD_PX, isTouchPointer } from '../../lib/calendar/pointer-gesture';

export type DragKind = 'create' | 'move' | 'resize';

export type DragDraft = {
  kind: DragKind;
  /** Nøkkelen til begivenheten som flyttes. Tom ved «create». */
  key?: string;
  day: string;
  /**
   * Siste dag et nytt tidsrom strekker seg over, når draget har gått sidelengs
   * over flere kolonner. Samme klokkeslett hver dag.
   */
  endDay?: string;
  startMin: number;
  endMin: number;
};

type Grabbed = {
  kind: DragKind;
  key?: string;
  /** Minuttet pekeren tok tak i, og dagen den startet på. */
  anchorMin: number;
  anchorDay: number;
  startMin: number;
  endMin: number;
  /** Hvor langt inn i begivenheten pekeren tok tak, ved flytting. */
  grabOffsetMin: number;
  moved: boolean;
  /**
   * Om gesten faktisk eier pekeren. Alltid sant for mus; på berøring først
   * etter at fingeren har ligget stille i HOLD_MS.
   */
  armed: boolean;
};

export function useGridDrag({
  days,
  surfaceRef,
  onCreate,
  onMove,
  onClickEmpty,
}: {
  days: string[];
  /** Flaten dagkolonnene er tegnet i — geometrien måles på den. */
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  onCreate?: (day: string, startMin: number, endMin: number, endDay?: string) => void;
  onMove?: (key: string, day: string, startMin: number, endMin: number) => void;
  /** Et klikk som aldri ble et drag. */
  onClickEmpty?: (day: string, minutes: number) => void;
}) {
  const [draft, setDraft] = useState<DragDraft | null>(null);
  // Pekeropp leser siste utkast gjennom en ref: verdien fra lukningen i
  // effekten under er alltid den fra forrige render.
  const draftRef = useRef<DragDraft | null>(null);
  draftRef.current = draft;
  const grab = useRef<Grabbed | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  /**
   * Sant like etter et drag som faktisk flyttet noe. Nettleseren sender et
   * `click` etter `pointerup` uansett, og uten dette ville hver flytting også
   * åpnet boblen på begivenheten man nettopp slapp.
   */
  const dragged = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const daysRef = useRef(days);
  daysRef.current = days;

  /** Peker -> dagindeks og minutt, begge klippet til det som finnes. */
  const readPointer = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      const el = surfaceRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const colWidth = rect.width / Math.max(1, daysRef.current.length);
      const rawIndex = Math.floor((e.clientX - rect.left) / colWidth);
      const dayIndex = Math.min(daysRef.current.length - 1, Math.max(0, rawIndex));
      const minutes = clampToDay(pxToMinutes(e.clientY - rect.top));
      return { dayIndex, minutes };
    },
    [surfaceRef],
  );

  const begin = useCallback(
    (e: React.PointerEvent, init: Omit<Grabbed, 'anchorMin' | 'anchorDay' | 'moved' | 'armed'>) => {
      const at = readPointer(e);
      if (!at) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      origin.current = { x: e.clientX, y: e.clientY };
      dragged.current = false;
      // Bare ekte fingre må vente. En penn er like presis som en mus, og en
      // peker uten type (jsdom, eldre nettlesere) behandles som mus.
      const touch = isTouchPointer(e.pointerType);
      grab.current = {
        ...init,
        anchorMin: at.minutes,
        anchorDay: at.dayIndex,
        moved: false,
        armed: !touch,
      };
      clearHold();
      if (touch) {
        // Utkastet dukker opp i det fingeren tar tak, som en kvittering på at
        // holdet ble registrert. Uten den vet man ikke om man ventet nok.
        holdTimer.current = setTimeout(() => {
          const g = grab.current;
          if (!g) return;
          g.armed = true;
          setDraft({
            kind: g.kind === 'create' ? 'create' : g.kind,
            key: g.key,
            day: daysRef.current[g.anchorDay],
            startMin: g.startMin,
            endMin: g.endMin,
          });
        }, HOLD_MS);
      }
      // For musen tegnes utkastet først når pekeren har flyttet seg, ellers
      // blinker et felt hver gang man bare klikker.
    },
    [readPointer],
  );

  /** Start et nytt tidsrom i tomrommet. */
  const startCreate = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const at = readPointer(e);
      if (!at) return;
      const start = snapMinutes(at.minutes, SNAP_MIN);
      begin(e, {
        kind: 'create',
        startMin: start,
        endMin: start + MIN_EVENT_MIN,
        grabOffsetMin: 0,
      });
    },
    [begin, readPointer],
  );

  /** Ta tak i en begivenhet — i kroppen for å flytte, i underkanten for å forlenge. */
  const startMove = useCallback(
    (e: React.PointerEvent, item: { key: string; startMin: number; endMin: number }, kind: 'move' | 'resize') => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const at = readPointer(e);
      if (!at) return;
      e.stopPropagation();
      begin(e, {
        kind,
        key: item.key,
        startMin: item.startMin,
        endMin: item.endMin,
        grabOffsetMin: at.minutes - item.startMin,
      });
    },
    [begin, readPointer],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = grab.current;
      const o = origin.current;
      if (!g || !o) return;
      if (!g.armed) {
        // Fingeren rakk å bevege seg før holdet var ferdig: dette er et sveip.
        // Slipp taket helt, så rutenettet får scrolle som det skal.
        const far = Math.abs(e.clientX - o.x) > MOVE_THRESHOLD_PX || Math.abs(e.clientY - o.y) > MOVE_THRESHOLD_PX;
        if (far) {
          clearHold();
          grab.current = null;
          origin.current = null;
        }
        return;
      }
      if (!g.moved) {
        const far = Math.abs(e.clientX - o.x) > MOVE_THRESHOLD_PX || Math.abs(e.clientY - o.y) > MOVE_THRESHOLD_PX;
        if (!far) return;
        g.moved = true;
      }
      const at = readPointer(e);
      if (!at) return;
      const list = daysRef.current;
      if (g.kind === 'create') {
        const now = snapMinutes(at.minutes, SNAP_MIN);
        const start = Math.min(g.anchorMin, now);
        const end = Math.max(g.anchorMin + MIN_EVENT_MIN, now);
        // Sidelengs over flere kolonner: samme tidsrom på hver av dagene.
        const first = Math.min(g.anchorDay, at.dayIndex);
        const last = Math.max(g.anchorDay, at.dayIndex);
        setDraft({
          kind: 'create',
          day: list[first],
          ...(last > first ? { endDay: list[last] } : {}),
          startMin: clampToDay(snapMinutes(start, SNAP_MIN)),
          endMin: clampToDay(Math.max(start + MIN_EVENT_MIN, end)),
        });
        return;
      }
      if (g.kind === 'resize') {
        const end = Math.max(g.startMin + MIN_EVENT_MIN, snapMinutes(at.minutes, SNAP_MIN));
        setDraft({
          kind: 'resize',
          key: g.key,
          day: list[g.anchorDay],
          startMin: g.startMin,
          endMin: clampToDay(end),
        });
        return;
      }
      const duration = g.endMin - g.startMin;
      const start = clampToDay(snapMinutes(at.minutes - g.grabOffsetMin, SNAP_MIN));
      setDraft({
        kind: 'move',
        key: g.key,
        day: list[at.dayIndex],
        startMin: start,
        endMin: clampToDay(start + duration),
      });
    };

    const up = () => {
      const g = grab.current;
      clearHold();
      grab.current = null;
      origin.current = null;
      const d = draftRef.current;
      setDraft(null);
      if (!g || !g.armed) return;
      dragged.current = g.moved;
      if (!g.moved) {
        // Et rent klikk i tomrommet: åpne skjemaet i stedet for å lage noe
        // ferdig. Klikk på en chip håndteres av chipen selv.
        if (g.kind === 'create') {
          onClickEmpty?.(daysRef.current[g.anchorDay], snapMinutes(g.anchorMin, SNAP_MIN));
        }
        return;
      }
      if (!d) return;
      if (d.kind === 'create') onCreate?.(d.day, d.startMin, d.endMin, d.endDay);
      else if (d.key) onMove?.(d.key, d.day, d.startMin, d.endMin);
    };

    const cancel = () => {
      clearHold();
      grab.current = null;
      origin.current = null;
      setDraft(null);
    };

    /**
     * Så lenge et hold eier fingeren, skal ikke nettleseren scrolle med den.
     * `passive: false` er hele poenget — uten den er preventDefault en no-op.
     */
    const blockScroll = (e: TouchEvent) => {
      if (grab.current?.armed) e.preventDefault();
    };

    /**
     * Nullstill «dette var et drag» ved starten av hver nye gest.
     *
     * Flagget ble bare satt, aldri ryddet. Etter ett eneste drag svelget
     * `consumedByDrag()` derfor hvert påfølgende klikk på en skrivebeskyttet
     * time — den startet jo ikke et nytt drag som kunne ha ryddet det.
     * Capture-fasen, så den kommer før Reacts egne handlere.
     */
    const armNewGesture = () => {
      dragged.current = false;
    };

    window.addEventListener('pointerdown', armNewGesture, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', blockScroll, { passive: false });
    return () => {
      clearHold();
      window.removeEventListener('pointerdown', armNewGesture, true);
      window.removeEventListener('touchmove', blockScroll);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [onClickEmpty, onCreate, onMove, readPointer]);

  /** Om siste gest var et drag — spør på klikk, og bare der. */
  const consumedByDrag = useCallback(() => dragged.current, []);

  return { draft, startCreate, startMove, consumedByDrag };
}
