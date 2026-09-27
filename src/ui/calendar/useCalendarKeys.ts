/**
 * Tastatursnarveiene.
 *
 * Notion-kalenderen er laget for å styres med tastaturet, og det er en stor del
 * av hvorfor den føles rask. Samme sett her:
 *
 *   T           i dag            D / W / M   dag, uke, måned
 *   ← →         fram og tilbake  N           ny begivenhet
 *
 * Lytteren ligger på `document`, så den virker uten at noe er fokusert — men
 * den holder seg unna så snart man skriver et sted, eller en dialog står åpen.
 * Uten den sperren ville et «d» i tittelfeltet byttet visning.
 */
import { useEffect } from 'react';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable === true;
}

export function useCalendarKeys({
  enabled = true,
  onToday,
  onStep,
  onMode,
  onNew,
  onEscape,
}: {
  enabled?: boolean;
  onToday: () => void;
  onStep: (dir: 1 | -1) => void;
  onMode: (m: 'day' | 'week' | 'month') => void;
  onNew: () => void;
  onEscape?: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      // En åpen dialog eier tastaturet så lenge den står der.
      if (document.querySelector("[role='dialog']")) {
        if (e.key === 'Escape') onEscape?.();
        return;
      }
      switch (e.key) {
        case 't':
        case 'T':
          onToday();
          break;
        case 'd':
        case 'D':
          onMode('day');
          break;
        case 'w':
        case 'W':
        case 'u': // «uke» / «uge» på norsk og dansk
        case 'U':
          onMode('week');
          break;
        case 'm':
        case 'M':
          onMode('month');
          break;
        case 'n':
        case 'N':
          onNew();
          break;
        case 'ArrowLeft':
          onStep(-1);
          break;
        case 'ArrowRight':
          onStep(1);
          break;
        case 'Escape':
          onEscape?.();
          return;
        default:
          return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, onEscape, onMode, onNew, onStep, onToday]);
}
