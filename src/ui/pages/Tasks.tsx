import {
  AlignLeft,
  Calendar,
  CalendarClock,
  CaseSensitive,
  CircleChevronDown,
  Lightbulb,
  ListTodo,
  Loader,
  Maximize2,
  Plus,
  Repeat,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createTask, setTaskProperty, updateProperty, updateTask, type TaskInput } from '../../lib/api';
import { compareValues, isEmpty, readValue } from '../../lib/properties';
import { daysUntil, formatDateShort, today } from '../../lib/dates';
import { EMPTY_FILTER, filterTasks, isOverdue, sortTasks, type DueFilter, type TaskFilter, type TaskSortKey } from '../../lib/tasks';
import { describeRule, NO_REPEAT, ruleFrom, ruleToRow, type RepeatRule } from '../../lib/recurrence';
import { KIND_LABEL, STATUS_LABEL, type PropValue, type Task, type TaskKind, type TaskProperty, type TaskStatus } from '../../lib/types';
import { useAuth } from '../../state/auth';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { CategoryPicker } from '../components/CategoryPicker';
import { DateCell, InlineText, SelectCell } from '../components/Cells';
import { Empty, KindBadge, PersonName, StatusBadge, Tag } from '../components/common';
import { FilterToggle } from '../components/FilterToggle';
import { AddPropertyHeader, PROP_ICON, PropertiesMenu, PropertyCell, PropertyHeader, type ColumnDef } from '../components/Properties';
import { MenuItem, Popover } from '../components/Popover';
import { RepeatEditor } from '../components/RepeatEditor';
import { SortHeader } from '../components/SortHeader';
import { TaskDialog } from '../components/TaskForm';
import { Page, TaskSubnav } from '../Layout';

type View = 'all' | 'mine' | 'ideas' | 'recurring';
type Patch = Partial<TaskInput>;
type SortKey = TaskSortKey | `prop:${string}`;

/** Innebygde kolonner som kan skjules (tittel vises alltid). */
const BUILTIN_COLUMNS: ColumnDef[] = [
  { key: 'category', label: 'Kategori', icon: <CircleChevronDown size={14} /> },
  { key: 'description', label: 'Beskrivelse', icon: <AlignLeft size={14} /> },
  { key: 'status', label: 'Status', icon: <Loader size={14} /> },
  { key: 'assignee', label: 'Ansvarlig', icon: <Users size={14} /> },
  { key: 'due', label: 'Frist', icon: <Calendar size={14} /> },
  { key: 'kind', label: 'Type', icon: <CircleChevronDown size={14} /> },
  { key: 'repeat', label: 'Gjentas', icon: <Repeat size={14} /> },
];

/** Skjulte kolonner huskes per prosjekt i denne nettleseren. */
function useHiddenColumns(projectId: string): [Set<string>, (key: string) => void] {
  const storageKey = `prosjektpanel:hidden:v2:${projectId}`;
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey) ?? localStorage.getItem(`prosjektpanel:hidden:${projectId}`);
      // «Gjentas» er skjult til man slår den på; gjentakende oppgaver har ↻ ved tittelen.
      return new Set(stored ? [...(JSON.parse(stored) as string[]), ...(localStorage.getItem(storageKey) ? [] : ['repeat'])] : ['repeat']);
    } catch {
      return new Set(['repeat']);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...hidden]));
    } catch {
      /* lagring kan være blokkert */
    }
  }, [hidden, storageKey]);
  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return [hidden, toggle];
}

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }));
const KIND_OPTIONS = (Object.keys(KIND_LABEL) as TaskKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));

export function TasksPage() {
  const { tasks: saved, people, taskCategories, nameOf, reload, project, properties } = useProject();
  const { userId } = useAuth();
  const toast = useToast();
  // Endringer i tabellen vises med én gang, før serveren har svart.
  const [pending, setPending] = useState<Record<string, Patch>>({});
  const [pendingCustom, setPendingCustom] = useState<Record<string, Record<string, PropValue>>>({});
  const tasks = useMemo(
    () =>
      saved.map((t) => {
        let next = pending[t.id] ? ({ ...t, ...pending[t.id] } as Task) : t;
        if (pendingCustom[t.id]) next = { ...next, custom: { ...next.custom, ...pendingCustom[t.id] } };
        return next;
      }),
    [saved, pending, pendingCustom],
  );
  const [hidden, toggleHidden] = useHiddenColumns(project.id);
  const show = (key: string) => !hidden.has(key);
  const visibleProps = properties.filter((p) => show(p.id));
  const [view, setView] = useState<View>('all');
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 });
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const viewTasks = useMemo(
    () => ({
      all: tasks,
      mine: tasks.filter((t) => t.assignee_id === userId && t.kind === 'task'),
      ideas: tasks.filter((t) => t.kind === 'idea'),
      recurring: tasks.filter((t) => t.kind === 'task' && t.repeat_freq && t.status !== 'done'),
    }),
    [tasks, userId],
  );

  const shown = useMemo(() => {
    const f = { ...filter, status: hideDone && !filter.status ? ('open' as const) : filter.status };
    const filtered = filterTasks(viewTasks[view], f);
    if (!sort.key.startsWith('prop:')) return sortTasks(filtered, sort.key as TaskSortKey, sort.dir, nameOf);
    const prop = properties.find((p) => `prop:${p.id}` === sort.key);
    if (!prop) return filtered;
    const val = (t: Task) => readValue(prop.type, t.custom?.[prop.id]);
    // Tomme verdier havner alltid sist, som i Notion.
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (isEmpty(va) || isEmpty(vb)) return Number(isEmpty(va)) - Number(isEmpty(vb));
      return compareValues(prop.type, va, vb, nameOf) * sort.dir;
    });
  }, [viewTasks, view, filter, hideDone, sort, nameOf, properties]);

  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const setF = <K extends keyof TaskFilter>(k: K, v: TaskFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const activeCount = (['assignee', 'status', 'category', 'kind'] as const).filter((k) => filter[k]).length + (filter.due !== 'all' ? 1 : 0);
  const filtersActive = activeCount > 0 || filter.query !== '';

  const save = async (task: Task, patch: Patch, message?: string) => {
    setPending((p) => ({ ...p, [task.id]: { ...p[task.id], ...patch } }));
    try {
      await updateTask(task.id, patch);
      await reload();
      const spawned = patch.status === 'done' && task.status !== 'done' && task.repeat_freq && task.kind === 'task';
      if (spawned) toast.ok('Fullført. Neste forekomst er lagt til.');
      else if (message) toast.ok(message);
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(({ [task.id]: _, ...rest }) => rest);
    }
  };

  const saveProp = async (task: Task, prop: TaskProperty, value: PropValue) => {
    setPendingCustom((p) => ({ ...p, [task.id]: { ...p[task.id], [prop.id]: value } }));
    try {
      await setTaskProperty(task.id, prop.id, value);
      await reload();
    } catch (e) {
      toast.error(e);
    } finally {
      // Fjern bare vår egen ventende verdi; en nyere endring av samme felt kan fortsatt være på vei.
      setPendingCustom((p) => {
        const cur = { ...p[task.id] };
        if (cur[prop.id] === value) delete cur[prop.id];
        const { [task.id]: _, ...rest } = p;
        return Object.keys(cur).length ? { ...rest, [task.id]: cur } : rest;
      });
    }
  };

  const moveProp = async (prop: TaskProperty, dir: -1 | 1) => {
    const order = [...properties];
    const i = order.findIndex((p) => p.id === prop.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    try {
      await Promise.all(order.map((p, idx) => (p.position === idx ? null : updateProperty(p.id, { position: idx }))));
      await reload();
    } catch (e) {
      toast.error(e);
    }
  };

  // Summen av kolonnebreddene i styles.css (.table.notion .col-*), så tabellen ikke klemmer kolonnene.
  const COL_WIDTH: Record<string, number> = { category: 120, description: 206, status: 132, assignee: 140, due: 80, kind: 104, repeat: 150 };
  const tableWidth = 40 + 260 + 44 + BUILTIN_COLUMNS.filter((c) => show(c.key)).reduce((sum, c) => sum + COL_WIDTH[c.key], 0) + visibleProps.length * 160;
  const columnCount = 2 + BUILTIN_COLUMNS.filter((c) => show(c.key)).length + visibleProps.length + 1;

  const defaults: Partial<TaskInput> | undefined = view === 'ideas' ? { kind: 'idea' } : view === 'mine' ? { assignee_id: userId } : undefined;

  const quickAdd = async (title: string) => {
    try {
      await createTask(project.id, {
        title,
        description: '',
        due_date: null,
        category: filter.category,
        assignee_id: view === 'mine' ? userId : filter.assignee && filter.assignee !== 'none' ? filter.assignee : null,
        kind: view === 'ideas' ? 'idea' : 'task',
        status: 'not_started',
      });
      await reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const open = tasks.filter((t) => t.kind === 'task' && t.status !== 'done');
  const overdue = open.filter((t) => isOverdue(t)).length;
  const mineOpen = open.filter((t) => t.assignee_id === userId).length;

  return (
    <Page
      title="Oppgaver"
      subnav={<TaskSubnav />}
      actions={
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={18} aria-hidden="true" />
          <span className="desktop-only">Ny oppgave</span>
          <span className="mobile-only">Ny</span>
        </button>
      }
    >
      <div className="card flush">
        <div className="stack-sm" style={{ padding: '12px 14px' }}>
          <div className="spread">
            <div className="chips" role="group" aria-label="Visning">
              <ViewChip label="Alle" count={viewTasks.all.length} active={view === 'all'} onClick={() => setView('all')} icon={<ListTodo size={15} />} />
              <ViewChip
                label="Mine oppgaver"
                count={viewTasks.mine.length}
                active={view === 'mine'}
                onClick={() => setView('mine')}
                icon={<CalendarClock size={15} />}
              />
              <ViewChip
                label="Ideer"
                count={viewTasks.ideas.length}
                active={view === 'ideas'}
                onClick={() => setView('ideas')}
                icon={<Lightbulb size={15} />}
              />
              <ViewChip
                label="Gjentakende"
                count={viewTasks.recurring.length}
                active={view === 'recurring'}
                onClick={() => setView('recurring')}
                icon={<Repeat size={15} />}
              />
            </div>
            <div className="stat-line" aria-label="Sammendrag">
              <span>
                <strong>{open.length}</strong> åpne
              </span>
              <span>
                <strong>{mineOpen}</strong> mine
              </span>
              <span className={overdue ? 'neg' : ''}>
                <strong className={overdue ? 'neg' : ''}>{overdue}</strong> forfalt
              </span>
              <label className="check small" style={{ minHeight: 0 }}>
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                Skjul fullførte
              </label>
            </div>
          </div>
          <div className="toolbar">
            <label className="search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Søk</span>
              <input className="input sm" type="search" placeholder="Søk i oppgaver" value={filter.query} onChange={(e) => setF('query', e.target.value)} />
            </label>
            <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} active={activeCount} />
            <span className="desktop-only">
              <PropertiesMenu
                columns={[...BUILTIN_COLUMNS, ...properties.map((p) => ({ key: p.id, label: p.name, icon: PROP_ICON[p.type] }))]}
                hidden={hidden}
                onToggle={toggleHidden}
              />
            </span>
            <div className={`filters ${filtersOpen ? 'open' : ''}`}>
              <select className="select sm" aria-label="Ansvarlig" value={filter.assignee} onChange={(e) => setF('assignee', e.target.value)}>
                <option value="">Alle personer</option>
                <option value="none">Uten ansvarlig</option>
                {people.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select className="select sm" aria-label="Status" value={filter.status} onChange={(e) => setF('status', e.target.value as TaskFilter['status'])}>
                <option value="">Alle statuser</option>
                <option value="open">Ikke fullført</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select className="select sm" aria-label="Kategori" value={filter.category} onChange={(e) => setF('category', e.target.value)}>
                <option value="">Alle kategorier</option>
                {taskCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {view === 'all' && (
                <select className="select sm" aria-label="Type" value={filter.kind} onChange={(e) => setF('kind', e.target.value as TaskKind | '')}>
                  <option value="">Oppgaver og ideer</option>
                  <option value="task">Bare oppgaver</option>
                  <option value="idea">Bare ideer</option>
                </select>
              )}
              <select className="select sm" aria-label="Forfallsdato" value={filter.due} onChange={(e) => setF('due', e.target.value as DueFilter)}>
                <option value="all">Alle frister</option>
                <option value="overdue">Forfalt</option>
                <option value="week">Neste 7 dager</option>
                <option value="month">Neste 31 dager</option>
                <option value="none">Uten frist</option>
              </select>
              <select
                className="select sm mobile-only"
                aria-label="Sorter etter"
                value={`${sort.key}:${sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':');
                  setSort({ key: key as TaskSortKey, dir: Number(dir) as 1 | -1 });
                }}
              >
                <option value="due:1">Frist (tidligst først)</option>
                <option value="due:-1">Frist (senest først)</option>
                <option value="status:1">Status</option>
                <option value="assignee:1">Ansvarlig</option>
                <option value="category:1">Kategori</option>
                <option value="kind:1">Type</option>
                <option value="title:1">Tittel</option>
                <option value="created:-1">Nyeste først</option>
              </select>
              {filtersActive && (
                <button type="button" className="btn ghost small" onClick={() => setFilter(EMPTY_FILTER)}>
                  <X size={15} aria-hidden="true" /> Nullstill
                </button>
              )}
            </div>
          </div>
        </div>

        {tasks.length === 0 ? (
          <Empty
            icon={<ListTodo size={24} />}
            title="Ingen oppgaver ennå"
            action={
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden="true" /> Legg til den første
              </button>
            }
          >
            Legg til oppgaver og ideer, fordel ansvar og sett frister.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data-table notion responsive" style={{ minWidth: tableWidth }}>
              <thead>
                <tr>
                  <th className="w-check">
                    <span className="sr-only">Fullført</span>
                  </th>
                  <SortHeader label="Tittel" k="title" sort={sort} onSort={onSort} className="col-title" icon={<CaseSensitive size={15} />} />
                  {show('category') && (
                    <SortHeader className="col-cat" label="Kategori" k="category" sort={sort} onSort={onSort} icon={<CircleChevronDown size={14} />} />
                  )}
                  {show('description') && (
                    <th className="col-desc">
                      <span className="th-inner">
                        <AlignLeft size={14} aria-hidden="true" /> Beskrivelse
                      </span>
                    </th>
                  )}
                  {show('status') && <SortHeader className="col-status" label="Status" k="status" sort={sort} onSort={onSort} icon={<Loader size={14} />} />}
                  {show('assignee') && (
                    <SortHeader className="col-person" label="Ansvarlig" k="assignee" sort={sort} onSort={onSort} icon={<Users size={14} />} />
                  )}
                  {show('due') && <SortHeader className="col-due" label="Frist" k="due" sort={sort} onSort={onSort} icon={<Calendar size={14} />} />}
                  {show('kind') && <SortHeader className="col-kind" label="Type" k="kind" sort={sort} onSort={onSort} icon={<CircleChevronDown size={14} />} />}
                  {show('repeat') && (
                    <th className="col-repeat">
                      <span className="th-inner">
                        <Repeat size={14} aria-hidden="true" /> Gjentas
                      </span>
                    </th>
                  )}
                  {visibleProps.map((p, i) => (
                    <PropertyHeader
                      key={p.id}
                      prop={p}
                      sortDir={sort.key === `prop:${p.id}` ? sort.dir : null}
                      onSort={(dir) => setSort({ key: `prop:${p.id}`, dir })}
                      onHide={() => toggleHidden(p.id)}
                      onMove={(dir) => void moveProp(p, dir)}
                      canMoveLeft={i > 0 || properties.indexOf(p) > 0}
                      canMoveRight={properties.indexOf(p) < properties.length - 1}
                    />
                  ))}
                  <AddPropertyHeader />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={() => setEditing(t)} onSave={save} show={show} props={visibleProps} onSaveProp={saveProp} />
                ))}
                {shown.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={columnCount} className="subtle small" style={{ textAlign: 'center' }}>
                      Ingen treff. Prøv å endre filtrene.
                    </td>
                  </tr>
                )}
                <AddRow onAdd={quickAdd} label={view === 'ideas' ? 'Ny idé' : 'Ny oppgave'} colSpan={columnCount} />
              </tbody>
            </table>
          </div>
        )}
        <div className="xsmall subtle" style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
          Viser {shown.length} av {viewTasks[view].length} · Klikk på en celle for å endre den direkte
        </div>
      </div>

      <TaskDialog
        open={creating || editing !== null}
        task={editing}
        defaults={defaults}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </Page>
  );
}

function ViewChip({ label, count, active, onClick, icon }: { label: string; count: number; active: boolean; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      <span aria-hidden="true" style={{ display: 'inline-flex' }}>
        {icon}
      </span>
      {label} <span className="count">{count}</span>
    </button>
  );
}

/** «+ Ny oppgave» nederst i tabellen: skriv en tittel og trykk Enter. */
function AddRow({ onAdd, label, colSpan }: { onAdd: (title: string) => Promise<void>; label: string; colSpan: number }) {
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const submit = async () => {
    const v = title.trim();
    if (!v) return setActive(false);
    setBusy(true);
    await onAdd(v);
    setBusy(false);
    setTitle('');
    ref.current?.focus();
  };
  return (
    <tr className="add-row">
      <td colSpan={colSpan}>
        {active ? (
          <input
            ref={ref}
            autoFocus
            className="cell-input"
            style={{ maxWidth: 480 }}
            aria-label={`${label}: tittel`}
            placeholder="Skriv tittel og trykk Enter"
            value={title}
            disabled={busy}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setActive(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              } else if (e.key === 'Escape') {
                setTitle('');
                setActive(false);
              }
            }}
          />
        ) : (
          <button type="button" className="add-row-btn" onClick={() => setActive(true)}>
            <Plus size={16} aria-hidden="true" /> {label}
          </button>
        )}
      </td>
    </tr>
  );
}

function DueText({ task }: { task: Task }) {
  if (!task.due_date) return <span className="subtle cell-placeholder" />;
  const overdue = isOverdue(task);
  const d = daysUntil(task.due_date, today());
  const soon = task.status !== 'done' && d >= 0 && d <= 3;
  return (
    <span className={`num ${overdue ? 'neg' : soon ? 'warn-text' : ''}`} title={overdue ? 'Forfalt' : undefined}>
      {formatDateShort(task.due_date)}
      {overdue && <span className="sr-only"> (forfalt)</span>}
    </span>
  );
}

function TaskRow({
  task,
  onOpen,
  onSave,
  show,
  props,
  onSaveProp,
}: {
  task: Task;
  onOpen: () => void;
  onSave: (t: Task, patch: Patch, message?: string) => void;
  show: (key: string) => boolean;
  props: TaskProperty[];
  onSaveProp: (t: Task, prop: TaskProperty, value: PropValue) => void;
}) {
  const { personById, people } = useProject();
  const person = task.assignee_id ? personById.get(task.assignee_id) : null;
  const done = task.status === 'done';
  const personOptions = [{ value: '', label: 'Ingen ansvarlig' }, ...people.map((p) => ({ value: p.user_id, label: p.name }))];
  return (
    <tr className={done ? 'done' : ''}>
      <td className="w-check">
        {task.kind === 'task' ? (
          <input
            type="checkbox"
            className="task-check"
            checked={done}
            aria-label={done ? `Marker «${task.title}» som ikke fullført` : `Fullfør «${task.title}»`}
            onChange={() => onSave(task, { status: done ? 'not_started' : 'done' }, done ? 'Oppgaven er åpnet igjen.' : 'Oppgaven er fullført.')}
          />
        ) : (
          <Lightbulb size={17} aria-label="Idé" style={{ color: 'var(--warning)' }} />
        )}
      </td>
      <td className="title-cell">
        <div className="title-wrap">
          <InlineText value={task.title} label="Tittel" required maxLength={200} onSave={(v) => onSave(task, { title: v })} />
          {task.repeat_freq && task.kind === 'task' && <Repeat size={13} className="subtle" aria-label="Gjentakende" style={{ flex: 'none' }} />}
          <span className="title-actions">
            {task.kind === 'idea' && (
              <button
                type="button"
                className="link-btn xsmall hover-action"
                style={{ flex: 'none' }}
                onClick={() => onSave(task, { kind: 'task' }, `«${task.title}» er nå en oppgave.`)}
              >
                Gjør til oppgave
              </button>
            )}
            <button type="button" className="open-btn" onClick={onOpen} aria-label={`Åpne «${task.title}»`}>
              <Maximize2 size={12} aria-hidden="true" /> ÅPNE
            </button>
          </span>
        </div>
      </td>
      {show('category') && (
        <td className="desktop-cell">
          <CategoryPicker
            scope="task"
            variant="cell"
            label={`Kategori for «${task.title}»`}
            value={task.category}
            onChange={(v) => onSave(task, { category: v })}
          />
        </td>
      )}
      {show('description') && (
        <td className="desc-cell desktop-cell">
          <InlineText value={task.description} label="Beskrivelse" maxLength={2000} onSave={(v) => onSave(task, { description: v })} />
        </td>
      )}
      {show('status') && (
        <td className="m-end">
          <SelectCell<TaskStatus>
            label={`Status for «${task.title}»`}
            value={task.status}
            options={STATUS_OPTIONS}
            onChange={(v) => onSave(task, { status: v }, `Status: ${STATUS_LABEL[v]}.`)}
          >
            <StatusBadge status={task.status} />
          </SelectCell>
        </td>
      )}
      {show('assignee') && (
        <td className="desktop-cell">
          <SelectCell<string>
            label={`Ansvarlig for «${task.title}»`}
            value={task.assignee_id ?? ''}
            options={personOptions}
            onChange={(v) => onSave(task, { assignee_id: v || null })}
          >
            {person ? <PersonName person={person} /> : <span className="subtle cell-placeholder" />}
          </SelectCell>
        </td>
      )}
      {show('due') && (
        <td className="desktop-cell">
          <DateCell label={`Frist for «${task.title}»`} value={task.due_date} onChange={(v) => onSave(task, { due_date: v })}>
            <DueText task={task} />
          </DateCell>
        </td>
      )}
      {show('kind') && (
        <td className="desktop-cell">
          <SelectCell<TaskKind>
            label={`Type for «${task.title}»`}
            value={task.kind}
            options={KIND_OPTIONS}
            onChange={(v) => onSave(task, { kind: v }, v === 'task' ? `«${task.title}» er nå en oppgave.` : `«${task.title}» er nå en idé.`)}
          >
            <KindBadge kind={task.kind} />
          </SelectCell>
        </td>
      )}
      {show('repeat') && (
        <td className="desktop-cell">
          {task.kind === 'task' ? (
            <RepeatCell task={task} onSave={(patch, message) => onSave(task, patch, message)} />
          ) : (
            <span className="subtle cell-placeholder" />
          )}
        </td>
      )}
      {props.map((p) => (
        <td key={p.id} className="desktop-cell prop-cell">
          <PropertyCell task={task} prop={p} onSet={(v) => onSaveProp(task, p, v)} />
        </td>
      ))}
      <td className="desktop-cell col-add-cell" aria-hidden="true" />
      <td className="m-sub mobile-meta">
        {task.category && <Tag label={task.category} scope="task" />}
        {person && <PersonName person={person} />}
        {task.due_date && (
          <span className="row tight">
            <CalendarClock size={13} aria-hidden="true" /> <DueText task={task} />
          </span>
        )}
        {task.kind === 'idea' && <span className="badge warn">{KIND_LABEL.idea}</span>}
      </td>
    </tr>
  );
}

/** «Gjentas»-cellen: vis regelen, og endre den i en liten popup. */
function RepeatCell({ task, onSave }: { task: Task; onSave: (patch: Patch, message?: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<RepeatRule>(() => ruleFrom(task));
  const current = ruleFrom(task);
  const close = (focus = false) => {
    setOpen(false);
    if (focus) ref.current?.focus();
  };
  const commit = (r: RepeatRule) => {
    onSave(
      { ...ruleToRow(r), repeat_anchor: r.freq ? task.due_date : null },
      r.freq ? `Gjentas: ${describeRule(r).toLowerCase()}.` : 'Gjentakelsen er fjernet.',
    );
    close(true);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="cell-btn"
        aria-label={`Gjentakelse for «${task.title}»: ${current.freq ? describeRule(current) : 'ingen'}`}
        onClick={() => {
          setRule(ruleFrom(task));
          setOpen((o) => !o);
        }}
      >
        {current.freq ? <span className="cell-text">{describeRule(current)}</span> : <span className="subtle cell-placeholder" />}
      </button>
      <Popover anchorRef={ref} open={open} onClose={close} width={300} label={`Gjentakelse for ${task.title}`}>
        <div className="stack-sm">
          <div className="menu-label">Gjentakelse</div>
          <RepeatEditor rule={rule} onChange={setRule} startDate={task.due_date} />
          {!task.due_date && rule.freq && <p className="popover-hint">Uten frist regnes neste forekomst fra dagen oppgaven fullføres.</p>}
          <div className="form-actions">
            {current.freq && <MenuItem onClick={() => commit(NO_REPEAT)}>Fjern</MenuItem>}
            <button type="button" className="btn primary small" onClick={() => commit(rule)}>
              Lagre
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
