import { Check, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from './Popover';

export interface TagOption {
  name: string;
  color: number;
}

interface Props {
  options: TagOption[];
  /** Valgte navn (ett for enkeltvalg). */
  value: string[];
  onChange: (names: string[]) => void;
  multi?: boolean;
  variant?: 'field' | 'cell';
  label: string;
  /** Forslag som ikke er lagret ennå, vist med grå farge til de brukes. */
  suggestions?: string[];
  /** Kalles når brukeren lager en ny verdi (før onChange). */
  onCreate?: (name: string) => Promise<void> | void;
  onRename?: (oldName: string, newName: string) => Promise<void>;
  onRecolor?: (name: string, color: number) => Promise<void>;
  renameHint?: string;
  colorOf: (name: string) => number;
}

type Item = { kind: 'pick'; name: string; saved: boolean } | { kind: 'create'; name: string } | { kind: 'clear' };

const SWATCH_LABELS = ['Blå', 'Grønn', 'Lilla', 'Oransje', 'Rød', 'Turkis', 'Rosa', 'Grå'];

/** Velg (eller lag) fargede etiketter, som «Select» og «Multi-select» i Notion. */
export function TagPicker({
  options,
  value,
  onChange,
  multi = false,
  variant = 'field',
  label,
  suggestions = [],
  onCreate,
  onRename,
  onRecolor,
  renameHint,
  colorOf,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [editFor, setEditFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  // Siste valgte verdier, også før forelderen har rukket å oppdatere seg (raske valg etter hverandre).
  const selRef = useRef(value);
  useEffect(() => {
    selRef.current = value;
  }, [value]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const saved = useMemo(() => options.map((o) => o.name), [options]);
  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = [...new Set([...saved, ...suggestions])].sort((a, b) => a.localeCompare(b, 'nb'));
    const list: Item[] = names.filter((n) => !q || n.toLowerCase().includes(q)).map((n) => ({ kind: 'pick', name: n, saved: saved.includes(n) }));
    if (q && !names.some((n) => n.toLowerCase() === q)) list.push({ kind: 'create', name: query.trim().slice(0, 60) });
    if (value.length && !q) list.push({ kind: 'clear' });
    return list;
  }, [saved, suggestions, query, value]);

  useEffect(() => setActive(0), [query]);

  const close = (focusTrigger = false) => {
    setOpen(false);
    setQuery('');
    setEditFor(null);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (item: Item) => {
    if (item.kind === 'clear') {
      selRef.current = [];
      onChange([]);
      return close(true);
    }
    const cur = selRef.current;
    const next = multi ? (cur.includes(item.name) ? cur.filter((v) => v !== item.name) : [...cur, item.name]) : [item.name];
    selRef.current = next;
    if (multi) {
      setQuery('');
      inputRef.current?.focus();
    } else {
      close(true);
    }
    // Valgene behandles i rekkefølge, så en ny verdi aldri overskriver en som fortsatt lagres.
    queue.current = queue.current.then(async () => {
      if (item.kind === 'create') await onCreate?.(item.name);
      onChange(next);
    });
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
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const rename = async (oldName: string) => {
    const next = newName.trim();
    if (next && next !== oldName && onRename) await onRename(oldName, next);
    setEditFor(null);
    inputRef.current?.focus();
  };

  const tags = value.map((v) => (
    <span key={v} className={`badge tag tag-${colorOf(v)}`}>
      {v}
    </span>
  ));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={variant === 'field' ? 'input picker-trigger' : 'cell-btn'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value.join(', ') || 'ingen'}`}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {value.length ? (
          <span className="tag-list">{tags}</span>
        ) : (
          <span className="subtle cell-placeholder">{variant === 'field' ? 'Velg eller opprett' : ''}</span>
        )}
      </button>
      <Popover anchorRef={triggerRef} open={open} onClose={close} label={label}>
        <div onKeyDown={onKey} className="stack-sm" style={{ gap: 6, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <input
            ref={inputRef}
            className="input sm"
            autoFocus
            placeholder={multi ? 'Søk, velg flere eller opprett' : 'Søk eller opprett'}
            aria-label={label}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            value={query}
            maxLength={60}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="popover-hint">{multi ? 'Velg én eller flere, eller skriv for å lage en ny' : 'Velg en verdi, eller skriv for å lage en ny'}</div>
          <ul className="popover-list" role="listbox" id={listId} aria-label={label} aria-multiselectable={multi || undefined}>
            {items.length === 0 && <li className="popover-empty">Ingen valg ennå. Skriv et navn for å lage et.</li>}
            {items.map((it, i) => (
              <li key={it.kind === 'clear' ? '__clear' : `${it.kind}:${it.name}`}>
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={it.kind === 'pick' ? value.includes(it.name) : false}
                  className={`popover-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(it)}
                >
                  {it.kind === 'pick' && (
                    <>
                      <span className={`badge tag tag-${it.saved ? colorOf(it.name) : 7}`}>{it.name}</span>
                      <span className="grow" />
                      {value.includes(it.name) && <Check size={15} aria-label="Valgt" />}
                      {it.saved && (onRename || onRecolor) && (
                        <button
                          type="button"
                          className="icon-btn xs"
                          aria-label={`Rediger ${it.name}`}
                          title="Endre navn eller farge"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            setNewName(it.name);
                            setEditFor(editFor === it.name ? null : it.name);
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
                      <X size={15} aria-hidden="true" /> Fjern {multi ? 'alle' : 'valg'}
                    </>
                  )}
                </div>
                {it.kind === 'pick' && editFor === it.name && (
                  <div className="cat-edit" onKeyDown={(e) => e.stopPropagation()}>
                    {onRename && (
                      <form
                        className="row tight"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void rename(it.name);
                        }}
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
                    )}
                    {renameHint && <p className="popover-hint">{renameHint}</p>}
                    {onRecolor && (
                      <div className="swatch-row" role="group" aria-label={`Farge for ${it.name}`}>
                        {SWATCH_LABELS.map((l, c) => (
                          <button
                            key={c}
                            type="button"
                            className={`swatch tag-${c} ${colorOf(it.name) === c ? 'on' : ''}`}
                            aria-label={l}
                            aria-pressed={colorOf(it.name) === c}
                            onClick={() => void onRecolor(it.name, c)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Popover>
    </>
  );
}
