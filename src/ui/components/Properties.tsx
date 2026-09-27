import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calendar,
  CheckSquare,
  CircleChevronDown,
  EyeOff,
  Hash,
  Link2,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  User,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { createProperty, deleteProperty, setTaskProperty, updateProperty } from '../../lib/api';
import { formatDateShort } from '../../lib/dates';
import { formatNumber, nextColor, normalizeUrl, parseNumber, readValue } from '../../lib/properties';
import { PROP_TYPE_LABEL, type PropType, type PropValue, type Task, type TaskProperty } from '../../lib/types';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { DateCell, InlineText, SelectCell } from './Cells';
import { PersonName } from './common';
import { MenuItem, Popover } from './Popover';
import { TagPicker } from './TagPicker';

export const PROP_ICON: Record<PropType, ReactNode> = {
  text: <AlignLeft size={14} />,
  number: <Hash size={14} />,
  select: <CircleChevronDown size={14} />,
  multi_select: <ListChecks size={14} />,
  date: <Calendar size={14} />,
  person: <User size={14} />,
  checkbox: <CheckSquare size={14} />,
  url: <Link2 size={14} />,
};

/** Verdien til én egendefinert egenskap, redigerbar direkte (i tabellen eller i oppgavevinduet). */
export function PropertyCell({
  task,
  prop,
  onSet,
  variant = 'cell',
}: {
  task: Task;
  prop: TaskProperty;
  onSet: (value: PropValue) => void;
  variant?: 'cell' | 'field';
}) {
  const { people, personById, reload, tasks } = useProject();
  const toast = useToast();
  const value = readValue(prop.type, task.custom?.[prop.id]);
  const label = `${prop.name} for «${task.title}»`;

  switch (prop.type) {
    case 'text':
      return <InlineText value={(value as string) ?? ''} label={label} maxLength={2000} onSave={(v) => onSet(v || null)} />;
    case 'url': {
      const url = (value as string) ?? '';
      return (
        <span className="title-wrap">
          <InlineText value={url} label={label} maxLength={2000} onSave={(v) => onSet(v || null)} />
          {url && (
            <a href={normalizeUrl(url)} target="_blank" rel="noreferrer noopener" className="icon-btn xs" aria-label={`Åpne lenken ${url}`} title="Åpne lenke">
              <Link2 size={14} />
            </a>
          )}
        </span>
      );
    }
    case 'number':
      return (
        <NumberCell
          value={value as number | null}
          label={label}
          onSave={(n) => onSet(n)}
          onInvalid={() => toast.error('Skriv inn et tall, for eksempel 12,5.')}
        />
      );
    case 'checkbox':
      return (
        <span className="cell-check">
          <input type="checkbox" className="task-check" checked={value === true} aria-label={label} onChange={(e) => onSet(e.target.checked ? true : null)} />
        </span>
      );
    case 'date':
      return (
        <DateCell label={label} value={(value as string) ?? null} onChange={(v) => onSet(v)}>
          {value ? <span className="num">{formatDateShort(value as string)}</span> : <span className="subtle cell-placeholder" />}
        </DateCell>
      );
    case 'person': {
      const person = value ? personById.get(value as string) : null;
      return (
        <SelectCell<string>
          label={label}
          value={(value as string) ?? ''}
          options={[{ value: '', label: 'Ingen' }, ...people.map((p) => ({ value: p.user_id, label: p.name }))]}
          onChange={(v) => onSet(v || null)}
        >
          {person ? <PersonName person={person} /> : <span className="subtle cell-placeholder" />}
        </SelectCell>
      );
    }
    case 'select':
    case 'multi_select': {
      const multi = prop.type === 'multi_select';
      const selected = multi ? (value as string[]) : value ? [value as string] : [];
      const colorOf = (n: string) => prop.options.find((o) => o.name === n)?.color ?? 7;
      const saveOptions = async (options: TaskProperty['options']) => {
        await updateProperty(prop.id, { options });
        await reload();
      };
      return (
        <TagPicker
          options={prop.options}
          value={selected}
          multi={multi}
          variant={variant}
          label={label}
          colorOf={colorOf}
          onChange={(names) => onSet(multi ? names : (names[0] ?? null))}
          onCreate={async (name) => {
            try {
              await saveOptions([...prop.options, { name, color: nextColor(prop.options) }]);
            } catch (e) {
              toast.error(e);
            }
          }}
          onRecolor={async (name, color) => {
            try {
              await saveOptions(prop.options.map((o) => (o.name === name ? { ...o, color } : o)));
            } catch (e) {
              toast.error(e);
            }
          }}
          renameHint="Endrer verdien på alle oppgaver som bruker den."
          onRename={async (oldName, next) => {
            try {
              const exists = prop.options.some((o) => o.name === next);
              const options = exists
                ? prop.options.filter((o) => o.name !== oldName)
                : prop.options.map((o) => (o.name === oldName ? { ...o, name: next } : o));
              await updateProperty(prop.id, { options });
              // Oppdater verdiene i alle oppgaver som brukte det gamle navnet.
              for (const t of tasks) {
                const v = readValue(prop.type, t.custom?.[prop.id]);
                if (multi && (v as string[]).includes(oldName)) {
                  await setTaskProperty(t.id, prop.id, [...new Set((v as string[]).map((x) => (x === oldName ? next : x)))]);
                } else if (!multi && v === oldName) {
                  await setTaskProperty(t.id, prop.id, next);
                }
              }
              await reload();
              toast.ok(`«${oldName}» heter nå «${next}».`);
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      );
    }
  }
}

function NumberCell({ value, label, onSave, onInvalid }: { value: number | null; label: string; onSave: (n: number | null) => void; onInvalid: () => void }) {
  return (
    <span className="cell-number">
      <InlineText
        value={value === null ? '' : formatNumber(value)}
        label={label}
        maxLength={30}
        onSave={(v) => {
          if (!v) return onSave(null);
          const n = parseNumber(v);
          if (n === null) onInvalid();
          else onSave(n);
        }}
      />
    </span>
  );
}

/** Kolonneoverskrift for en egendefinert egenskap, med meny (navn, sortering, flytting, skjul, slett). */
export function PropertyHeader({
  prop,
  sortDir,
  onSort,
  onHide,
  onMove,
  canMoveLeft,
  canMoveRight,
}: {
  prop: TaskProperty;
  sortDir: 1 | -1 | null;
  onSort: (dir: 1 | -1) => void;
  onHide: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}) {
  const { reload } = useProject();
  const toast = useToast();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  const [name, setName] = useState(prop.name);

  const close = (focus = false) => {
    setOpen(false);
    setMode('menu');
    if (focus) ref.current?.focus();
  };

  const run = async (fn: () => Promise<void>, message?: string) => {
    try {
      await fn();
      await reload();
      if (message) toast.ok(message);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <th className="col-prop" aria-sort={sortDir === null ? 'none' : sortDir === 1 ? 'ascending' : 'descending'}>
      <button
        ref={ref}
        type="button"
        className="sort-btn prop-head"
        data-active={sortDir !== null}
        aria-label={`Egenskap ${prop.name} (${PROP_TYPE_LABEL[prop.type]}). Åpne meny`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span aria-hidden="true" style={{ display: 'inline-flex', opacity: 0.8 }}>
          {PROP_ICON[prop.type]}
        </span>
        <span className="cell-text">{prop.name}</span>
        {sortDir !== null && (sortDir === 1 ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />)}
        <MoreHorizontal size={14} aria-hidden="true" className="prop-more" />
      </button>
      <Popover anchorRef={ref} open={open} onClose={close} width={240} label={`Meny for ${prop.name}`}>
        {mode === 'menu' && (
          <div className="stack-sm" style={{ gap: 2 }}>
            <div className="menu-label">
              {prop.name} · {PROP_TYPE_LABEL[prop.type]}
            </div>
            <MenuItem
              icon={<Pencil size={15} />}
              onClick={() => {
                setName(prop.name);
                setMode('rename');
              }}
            >
              Gi nytt navn
            </MenuItem>
            <MenuItem icon={<ArrowUp size={15} />} onClick={() => (onSort(1), close())}>
              Sorter stigende
            </MenuItem>
            <MenuItem icon={<ArrowDown size={15} />} onClick={() => (onSort(-1), close())}>
              Sorter synkende
            </MenuItem>
            {canMoveLeft && (
              <MenuItem icon={<ArrowLeft size={15} />} onClick={() => (onMove(-1), close())}>
                Flytt til venstre
              </MenuItem>
            )}
            {canMoveRight && (
              <MenuItem icon={<ArrowRight size={15} />} onClick={() => (onMove(1), close())}>
                Flytt til høyre
              </MenuItem>
            )}
            <MenuItem icon={<EyeOff size={15} />} onClick={() => (onHide(), close())}>
              Skjul i visningen
            </MenuItem>
            <div className="menu-sep" />
            <MenuItem icon={<Trash2 size={15} />} danger onClick={() => setMode('delete')}>
              Slett egenskap
            </MenuItem>
          </div>
        )}
        {mode === 'rename' && (
          <form
            className="stack-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void run(() => updateProperty(prop.id, { name: name.trim() })).then(() => close(true));
            }}
          >
            <label className="field">
              <span>Navn på egenskapen</span>
              <input className="input sm" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="button" className="btn ghost small" onClick={() => setMode('menu')}>
                Avbryt
              </button>
              <button type="submit" className="btn primary small">
                Lagre
              </button>
            </div>
          </form>
        )}
        {mode === 'delete' && (
          <div className="stack-sm">
            <p className="small">
              Slette <strong>{prop.name}</strong> og verdiene i alle oppgaver? Det kan ikke angres.
            </p>
            <div className="form-actions">
              <button type="button" className="btn ghost small" onClick={() => setMode('menu')}>
                Avbryt
              </button>
              <button
                type="button"
                className="btn danger small"
                onClick={() => void run(() => deleteProperty(prop.id), `«${prop.name}» er slettet.`).then(() => close(true))}
              >
                Slett
              </button>
            </div>
          </div>
        )}
      </Popover>
    </th>
  );
}

const TYPES: PropType[] = ['text', 'number', 'select', 'multi_select', 'date', 'person', 'checkbox', 'url'];

/** «+» i tabelloverskriften: legg til en ny egenskap (kolonne). */
export function AddPropertyHeader() {
  const { project, properties, reload } = useProject();
  const toast = useToast();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PropType>('text');
  const [busy, setBusy] = useState(false);

  const close = (focus = false) => {
    setOpen(false);
    setName('');
    setType('text');
    if (focus) ref.current?.focus();
  };

  const create = async () => {
    const n = name.trim() || PROP_TYPE_LABEL[type];
    setBusy(true);
    try {
      await createProperty(project.id, { name: n, type, position: Math.max(0, ...properties.map((p) => p.position)) + 1 });
      await reload();
      toast.ok(`Egenskapen «${n}» er lagt til.`);
      close(true);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <th className="col-add">
      <button
        ref={ref}
        type="button"
        className="icon-btn sm"
        aria-label="Legg til egenskap"
        title="Legg til egenskap"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Plus size={16} />
      </button>
      <Popover anchorRef={ref} open={open} onClose={close} width={260} label="Ny egenskap">
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="field">
            <span>Navn på egenskapen</span>
            <input className="input sm" autoFocus value={name} maxLength={60} placeholder={PROP_TYPE_LABEL[type]} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="menu-label">Type</div>
          <div className="type-grid" role="radiogroup" aria-label="Type">
            {TYPES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} className={`type-opt ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
                <span aria-hidden="true" className="menu-icon">
                  {PROP_ICON[t]}
                </span>
                {PROP_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary small" disabled={busy}>
              <Plus size={15} aria-hidden="true" /> Legg til
            </button>
          </div>
        </form>
      </Popover>
    </th>
  );
}

export interface ColumnDef {
  key: string;
  label: string;
  icon: ReactNode;
}

/** «Egenskaper»-knappen: vis og skjul kolonner i denne visningen. */
export function PropertiesMenu({ columns, hidden, onToggle }: { columns: ColumnDef[]; hidden: Set<string>; onToggle: (key: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const count = columns.filter((c) => hidden.has(c.key)).length;
  return (
    <>
      <button ref={ref} type="button" className="btn small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={15} aria-hidden="true" /> Egenskaper{count ? ` (${count} skjult)` : ''}
      </button>
      <Popover anchorRef={ref} open={open} onClose={(f) => (setOpen(false), f && ref.current?.focus())} width={260} label="Egenskaper">
        <div className="menu-label">Vis i tabellen</div>
        <div className="popover-list">
          {columns.map((c) => (
            <label key={c.key} className="menu-item">
              <span aria-hidden="true" className="menu-icon">
                {c.icon}
              </span>
              <span className="grow">{c.label}</span>
              <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => onToggle(c.key)} aria-label={`Vis ${c.label}`} />
            </label>
          ))}
        </div>
        <p className="popover-hint">Legg til nye egenskaper med + i tabelloverskriften.</p>
      </Popover>
    </>
  );
}
