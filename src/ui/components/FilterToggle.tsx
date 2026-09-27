import { SlidersHorizontal } from 'lucide-react';

/** Knapp som viser/skjuler filtrene på mobil. På store skjermer er filtrene alltid synlige. */
export function FilterToggle({ open, onToggle, active }: { open: boolean; onToggle: () => void; active: number }) {
  return (
    <button type="button" className="btn small mobile-only filter-toggle" aria-expanded={open} onClick={onToggle}>
      <SlidersHorizontal size={15} aria-hidden="true" /> Filtre{active > 0 ? ` (${active})` : ''}
    </button>
  );
}
