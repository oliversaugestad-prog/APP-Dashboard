import { Check, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { renameCategory, setCategoryColor } from '../../lib/api';
import type { CategoryScope } from '../../lib/types';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';

interface Props {
  scope: CategoryScope;
  value: string;
  onChange: (name: string) => void;
  /** «field» ser ut som et skjemafelt, «cell» er for redigering direkte i tabellen. */
  variant?: 'field' | 'cell';
  label: string;
  /** Ekstra forslag som ikke er lagret i prosjektet ennå (f.eks. standardkategorier). */
  suggestions?: string[];
}

type Item = { kind: 'pick'; name: string; saved: boolean } | { kind: 'create'; name: string } | { kind: 'clear' };

const SWATCH_LABELS = ['Blå', 'Grønn', 'Lilla', 'Oransje', 'Rød', 'Turkis', 'Rosa', 'Grå'];

/** Velg en tidligere brukt kategori, eller opprett en ny. Kategoriene vises med prosjektets farger. */
export function CategoryPicker({ scope, value, onChange, variant = 'field', label, suggestions = [] }: Props) {
  const { categories, colorOf, project, reload } = useProject();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const saved = useMemo(() => categories.filter((c) => c.scope === scope).map((c) => c.name), [categories, scope]);
  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = [...new Set([...saved, ...suggestions])].sort((a, b) => a.localeCompare(b, 'nb'));
    const list: Item[] = names.filter((n) => !q || n.toLowerCase().includes(q)).map((n) => ({ kind: 'pick', name: n, saved: saved.includes(n) }));
    if (q && !names.some((n) => n.toLowerCase() === q)) list.push({ kind: 'create', name: query.trim().slice(0, 60) });
    if (value && !q) list.push({ kind: 'clear' });
    return list;
  }, [saved, suggestions, query, value]);

  useEffect(() => setActive(0), [query]);

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 260);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom;
    const top = below < 440 && r.top > below ? Math.max(8, r.top - Math.min(444, r.top - 8)) : r.bottom + 4;
    setPos({ top, left: Math.max(8, left), width });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    const onScroll = (e: Event) => {
      if (!popRef.current?.contains(e.target as Node)) place();
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !popRef.current?.contains(document.activeElement)) close(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const close = (focusTrigger = false) => {
    setOpen(false);
    setQuery('');
    setPaletteFor(null);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (item: Item) => {
    if (item.kind === 'clear') onChange('');
    else onChange(item.name);
    close(true);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) choose(items[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const rename = async (oldName: string, name: string) => {
    const next = name.trim();
    if (!next || next === oldName) return setPaletteFor(null);
    try {
      await renameCategory(project.id, scope, oldName, next);
      await reload();
      if (value === oldName) onChange(next);
      setPaletteFor(null);
      popRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
      toast.ok(`Kategorien heter nå «${next}».`);
    } catch (err) {
      toast.error(err);
    }
  };

  const recolor = async (name: string, color: number) => {
    try {
      await setCategoryColor(project.id, scope, name, color);
      await reload();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={variant === 'field' ? 'input picker-trigger' : 'cell-btn'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value || 'ingen'}`}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {value ? (
          <span className={`badge tag tag-${colorOf(scope, value)}`}>{value}</span>
        ) : (
          <span className="subtle">{variant === 'field' ? 'Velg eller opprett' : ''}</span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={popRef} className="popover" style={{ top: pos.top, left: pos.left, width: pos.width }} onKeyDown={onKey}>
            <input
              className="input sm"
              autoFocus
              placeholder="Søk eller opprett kategori"
              aria-label={label}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
              value={query}
              maxLength={60}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="popover-hint">Velg en kategori eller skriv for å lage en ny</div>
            <ul className="popover-list" role="listbox" id={listId} aria-label={label}>
              {items.length === 0 && <li className="popover-empty">Ingen kategorier ennå. Skriv et navn for å lage en.</li>}
              {items.map((it, i) => (
                <li key={it.kind === 'clear' ? '__clear' : `${it.kind}:${it.name}`}>
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={`popover-item ${i === active ? 'active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(it)}
                  >
                    {it.kind === 'pick' && (
                      <>
                        <span className={`badge tag tag-${colorOf(scope, it.name)}`}>{it.name}</span>
                        <span className="grow" />
                        {it.name === value && <Check size={15} aria-label="Valgt" />}
                        {it.saved && (
                          <button
                            type="button"
                            className="icon-btn xs"
                            aria-label={`Rediger ${it.name}`}
                            title="Endre navn eller farge"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewName(it.name);
                              setPaletteFor(paletteFor === it.name ? null : it.name);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                      </>
                    )}
                    {it.kind === 'create' && (
                      <>
                        <Plus size={15} aria-hidden="true" /> Opprett <span className="badge tag tag-7">{it.name}</span>
                      </>
                    )}
                    {it.kind === 'clear' && (
                      <>
                        <X size={15} aria-hidden="true" /> Fjern kategori
                      </>
                    )}
                  </div>
                  {it.kind === 'pick' && paletteFor === it.name && (
                    <div className="cat-edit">
                      <form
                        className="row tight"
                        onSubmit={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void rename(it.name, newName);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <input
                          className="input sm"
                          aria-label={`Nytt navn for ${it.name}`}
                          value={newName}
                          maxLength={60}
                          onChange={(e) => setNewName(e.target.value)}
                        />
                        <button type="submit" className="btn small">
                          Lagre
                        </button>
                      </form>
                      <p className="popover-hint">Endrer navnet på alle {scope === 'task' ? 'oppgaver' : 'poster'} med denne kategorien.</p>
                      <div className="swatch-row" role="group" aria-label={`Farge for ${it.name}`}>
                        {SWATCH_LABELS.map((l, c) => (
                          <button
                            key={c}
                            type="button"
                            className={`swatch tag-${c} ${colorOf(scope, it.name) === c ? 'on' : ''}`}
                            aria-label={l}
                            aria-pressed={colorOf(scope, it.name) === c}
                            onClick={() => recolor(it.name, c)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
