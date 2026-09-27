import { CalendarClock, Lightbulb, ListTodo, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { updateTask } from '../../lib/api';
import { daysUntil, formatDateShort, today } from '../../lib/dates';
import { EMPTY_FILTER, filterTasks, isOverdue, sortTasks, type DueFilter, type TaskFilter, type TaskSortKey } from '../../lib/tasks';
import { KIND_LABEL, STATUS_LABEL, type Task, type TaskKind, type TaskStatus } from '../../lib/types';
import { useAuth } from '../../state/auth';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { Empty, KindBadge, PersonName, StatusBadge, Tag } from '../components/common';
import { FilterToggle } from '../components/FilterToggle';
import { SortHeader } from '../components/SortHeader';
import { TaskDialog } from '../components/TaskForm';
import { Page, TaskSubnav } from '../Layout';

type View = 'all' | 'mine' | 'ideas';

export function TasksPage() {
  const { tasks: saved, people, taskCategories, nameOf, reload } = useProject();
  // Raske endringer (fullføre, status, idé → oppgave) vises med én gang, før serveren har svart.
  const [pending, setPending] = useState<Record<string, Partial<Task>>>({});
  const tasks = useMemo(() => saved.map((t) => (pending[t.id] ? { ...t, ...pending[t.id] } : t)), [saved, pending]);
  const { userId } = useAuth();
  const toast = useToast();
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

  const quickUpdate = async (task: Task, patch: Partial<Pick<Task, 'status' | 'kind'>>, message: string) => {
    setPending((p) => ({ ...p, [task.id]: { ...p[task.id], ...patch } }));
    try {
      await updateTask(task.id, patch);
      await reload();
      toast.ok(message);
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(({ [task.id]: _, ...rest }) => rest);
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
      <div className="metrics four">
        <Metric label="Åpne oppgaver" value={open.length} />
        <Metric label="Mine åpne" value={mineOpen} />
        <Metric label="Forfalt" value={overdue} tone={overdue ? 'neg' : undefined} />
        <Metric label="Ideer" value={viewTasks.ideas.length} />
      </div>

      <div className="card flush">
        <div className="stack-sm" style={{ padding: '14px 16px' }}>
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
            <label className="check small">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
              Skjul fullførte
            </label>
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
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
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

        {shown.length === 0 ? (
          <Empty
            icon={view === 'ideas' ? <Lightbulb size={24} /> : <ListTodo size={24} />}
            title={tasks.length === 0 ? 'Ingen oppgaver ennå' : 'Ingen treff'}
            action={
              tasks.length === 0 ? (
                <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                  <Plus size={16} aria-hidden="true" /> Legg til den første
                </button>
              ) : undefined
            }
          >
            {tasks.length === 0 ? 'Legg til oppgaver og ideer, fordel ansvar og sett frister.' : 'Prøv å endre filtrene.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th className="w-check">
                    <span className="sr-only">Fullført</span>
                  </th>
                  <SortHeader label="Tittel" k="title" sort={sort} onSort={onSort} />
                  <SortHeader label="Kategori" k="category" sort={sort} onSort={onSort} />
                  <th className="wide-cell">Beskrivelse</th>
                  <SortHeader label="Status" k="status" sort={sort} onSort={onSort} />
                  <SortHeader label="Ansvarlig" k="assignee" sort={sort} onSort={onSort} />
                  <SortHeader label="Frist" k="due" sort={sort} onSort={onSort} />
                  <SortHeader label="Type" k="kind" sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={() => setEditing(t)} onUpdate={quickUpdate} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="xsmall subtle" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          Viser {shown.length} av {viewTasks[view].length}
        </div>
      </div>

      <TaskDialog
        open={creating || editing !== null}
        task={editing}
        defaults={view === 'ideas' ? { kind: 'idea' } : view === 'mine' ? { assignee_id: userId } : undefined}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </Page>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'neg' }) {
  return (
    <div className="metric">
      <span className="m-label">{label}</span>
      <span className={`m-value num ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

function ViewChip({ label, count, active, onClick, icon }: { label: string; count: number; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      <span aria-hidden="true" style={{ display: 'inline-flex' }}>
        {icon}
      </span>
      {label} <span className="count">{count}</span>
    </button>
  );
}

function DueDate({ task }: { task: Task }) {
  if (!task.due_date) return <span className="subtle">–</span>;
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
  onUpdate,
}: {
  task: Task;
  onOpen: () => void;
  onUpdate: (t: Task, patch: Partial<Pick<Task, 'status' | 'kind'>>, message: string) => void;
}) {
  const { personById } = useProject();
  const person = task.assignee_id ? personById.get(task.assignee_id) : null;
  const done = task.status === 'done';
  return (
    <tr className={done ? 'done' : ''}>
      <td className="w-check">
        {task.kind === 'task' ? (
          <input
            type="checkbox"
            className="task-check"
            checked={done}
            aria-label={done ? `Marker «${task.title}» som ikke fullført` : `Fullfør «${task.title}»`}
            onChange={() => onUpdate(task, { status: done ? 'not_started' : 'done' }, done ? 'Oppgaven er åpnet igjen.' : 'Oppgaven er fullført.')}
          />
        ) : (
          <Lightbulb size={18} aria-label="Idé" style={{ color: 'var(--warning)', marginLeft: 1 }} />
        )}
      </td>
      <td className="title-cell">
        <button type="button" className="row-btn title-text" onClick={onOpen}>
          {task.title}
        </button>
        {task.kind === 'idea' && (
          <div style={{ marginTop: 4 }}>
            <button type="button" className="link-btn xsmall" onClick={() => onUpdate(task, { kind: 'task' }, `«${task.title}» er nå en oppgave.`)}>
              Gjør til oppgave
            </button>
          </div>
        )}
      </td>
      <td className="desktop-cell">
        <Tag label={task.category} />
      </td>
      <td className="desc-cell desktop-cell wide-cell" title={task.description || undefined}>
        {task.description || <span className="subtle">–</span>}
      </td>
      <td className="m-end">
        <span className="status-picker">
          <select
            aria-label={`Status for «${task.title}»`}
            value={task.status}
            onChange={(e) => onUpdate(task, { status: e.target.value as TaskStatus }, `Status: ${STATUS_LABEL[e.target.value as TaskStatus]}.`)}
          >
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <StatusBadge status={task.status} />
        </span>
      </td>
      <td className="desktop-cell">
        <PersonName person={person} />
      </td>
      <td className="desktop-cell">
        <DueDate task={task} />
      </td>
      <td className="desktop-cell">
        <KindBadge kind={task.kind} />
      </td>
      <td className="m-sub mobile-meta">
        {task.category && <Tag label={task.category} />}
        {person && <PersonName person={person} />}
        {task.due_date && (
          <span className="row tight">
            <CalendarClock size={13} aria-hidden="true" /> <DueDate task={task} />
          </span>
        )}
        {task.kind === 'idea' && <span className="badge warn">{KIND_LABEL.idea}</span>}
      </td>
    </tr>
  );
}
