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
  Search,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createTask, updateTask, type TaskInput } from '../../lib/api';
import { daysUntil, formatDateShort, today } from '../../lib/dates';
import { EMPTY_FILTER, filterTasks, isOverdue, sortTasks, type DueFilter, type TaskFilter, type TaskSortKey } from '../../lib/tasks';
import { KIND_LABEL, STATUS_LABEL, type Task, type TaskKind, type TaskStatus } from '../../lib/types';
import { useAuth } from '../../state/auth';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { CategoryPicker } from '../components/CategoryPicker';
import { DateCell, InlineText, SelectCell } from '../components/Cells';
import { Empty, KindBadge, PersonName, StatusBadge, Tag } from '../components/common';
import { FilterToggle } from '../components/FilterToggle';
import { SortHeader } from '../components/SortHeader';
import { TaskDialog } from '../components/TaskForm';
import { Page, TaskSubnav } from '../Layout';

type View = 'all' | 'mine' | 'ideas';
type Patch = Partial<TaskInput>;

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }));
const KIND_OPTIONS = (Object.keys(KIND_LABEL) as TaskKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));

export function TasksPage() {
  const { tasks: saved, people, taskCategories, nameOf, reload, project } = useProject();
  const { userId } = useAuth();
  const toast = useToast();
  // Endringer i tabellen vises med én gang, før serveren har svart.
  const [pending, setPending] = useState<Record<string, Patch>>({});
  const tasks = useMemo(() => saved.map((t) => (pending[t.id] ? ({ ...t, ...pending[t.id] } as Task) : t)), [saved, pending]);
  const [view, setView] = useState<View>('all');
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<{ key: TaskSortKey; dir: 1 | -1 }>({ key: 'due', dir: 1 });
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const viewTasks = useMemo(
    () => ({
      all: tasks,
      mine: tasks.filter((t) => t.assignee_id === userId && t.kind === 'task'),
      ideas: tasks.filter((t) => t.kind === 'idea'),
    }),
    [tasks, userId],
  );

  const shown = useMemo(() => {
    const f = { ...filter, status: hideDone && !filter.status ? ('open' as const) : filter.status };
    return sortTasks(filterTasks(viewTasks[view], f), sort.key, sort.dir, nameOf);
  }, [viewTasks, view, filter, hideDone, sort, nameOf]);

  const onSort = (key: TaskSortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const setF = <K extends keyof TaskFilter>(k: K, v: TaskFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const activeCount = (['assignee', 'status', 'category', 'kind'] as const).filter((k) => filter[k]).length + (filter.due !== 'all' ? 1 : 0);
  const filtersActive = activeCount > 0 || filter.query !== '';

  const save = async (task: Task, patch: Patch, message?: string) => {
    setPending((p) => ({ ...p, [task.id]: { ...p[task.id], ...patch } }));
    try {
      await updateTask(task.id, patch);
      await reload();
      if (message) toast.ok(message);
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(({ [task.id]: _, ...rest }) => rest);
    }
  };

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
            <table className="table notion responsive">
              <thead>
                <tr>
                  <th className="w-check">
                    <span className="sr-only">Fullført</span>
                  </th>
                  <SortHeader label="Tittel" k="title" sort={sort} onSort={onSort} className="col-title" icon={<CaseSensitive size={15} />} />
                  <SortHeader className="col-cat" label="Kategori" k="category" sort={sort} onSort={onSort} icon={<CircleChevronDown size={14} />} />
                  <th className="col-desc">
                    <span className="th-inner">
                      <AlignLeft size={14} aria-hidden="true" /> Beskrivelse
                    </span>
                  </th>
                  <SortHeader className="col-status" label="Status" k="status" sort={sort} onSort={onSort} icon={<Loader size={14} />} />
                  <SortHeader className="col-person" label="Ansvarlig" k="assignee" sort={sort} onSort={onSort} icon={<Users size={14} />} />
                  <SortHeader className="col-due" label="Frist" k="due" sort={sort} onSort={onSort} icon={<Calendar size={14} />} />
                  <SortHeader className="col-kind" label="Type" k="kind" sort={sort} onSort={onSort} icon={<CircleChevronDown size={14} />} />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={() => setEditing(t)} onSave={save} />
                ))}
                {shown.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={8} className="subtle small" style={{ textAlign: 'center' }}>
                      Ingen treff. Prøv å endre filtrene.
                    </td>
                  </tr>
                )}
                <AddRow onAdd={quickAdd} label={view === 'ideas' ? 'Ny idé' : 'Ny oppgave'} />
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
function AddRow({ onAdd, label }: { onAdd: (title: string) => Promise<void>; label: string }) {
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
      <td colSpan={8}>
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

function TaskRow({ task, onOpen, onSave }: { task: Task; onOpen: () => void; onSave: (t: Task, patch: Patch, message?: string) => void }) {
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
          {task.kind === 'idea' && (
            <button
              type="button"
              className="link-btn xsmall"
              style={{ flex: 'none' }}
              onClick={() => onSave(task, { kind: 'task' }, `«${task.title}» er nå en oppgave.`)}
            >
              Gjør til oppgave
            </button>
          )}
          <button type="button" className="open-btn" onClick={onOpen} aria-label={`Åpne «${task.title}»`}>
            <Maximize2 size={12} aria-hidden="true" /> ÅPNE
          </button>
        </div>
      </td>
      <td className="desktop-cell">
        <CategoryPicker
          scope="task"
          variant="cell"
          label={`Kategori for «${task.title}»`}
          value={task.category}
          onChange={(v) => onSave(task, { category: v })}
        />
      </td>
      <td className="desc-cell desktop-cell">
        <InlineText value={task.description} label="Beskrivelse" maxLength={2000} onSave={(v) => onSave(task, { description: v })} />
      </td>
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
      <td className="desktop-cell">
        <DateCell label={`Frist for «${task.title}»`} value={task.due_date} onChange={(v) => onSave(task, { due_date: v })}>
          <DueText task={task} />
        </DateCell>
      </td>
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
