import { UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { formatDateShort } from '../../lib/dates';
import { isOverdue, sortTasks } from '../../lib/tasks';
import type { Person, Task } from '../../lib/types';
import { useProject } from '../../state/project';
import { Avatar, StatusBadge, Tag } from '../components/common';
import { TaskDialog } from '../components/TaskForm';
import { Page, TaskSubnav } from '../Layout';

export function TaskPeoplePage() {
  const { tasks, people, nameOf } = useProject();
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  const real = tasks.filter((t) => t.kind === 'task');
  const unassigned = real.filter((t) => !t.assignee_id);
  // Oppgaver som står på tidligere medlemmer vises ikke her; de har mistet ansvarlig ved fjerning.

  return (
    <Page title="Ansvar per person" subnav={<TaskSubnav />}>
      <div className="spread">
        <p className="muted small">Hvem som har ansvar for hvilke oppgaver. Ideer er ikke med før de er gjort om til oppgaver.</p>
        <label className="check small">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Vis fullførte i listene
        </label>
      </div>
      <div className="layout-grid cols-3">
        {people.map((p) => (
          <PersonTasks
            key={p.user_id}
            person={p}
            tasks={real.filter((t) => t.assignee_id === p.user_id)}
            showDone={showDone}
            onOpen={setEditing}
            nameOf={nameOf}
          />
        ))}
        {unassigned.length > 0 && <PersonTasks person={null} tasks={unassigned} showDone={showDone} onOpen={setEditing} nameOf={nameOf} />}
      </div>
      <TaskDialog open={editing !== null} task={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function PersonTasks({
  person,
  tasks,
  showDone,
  onOpen,
  nameOf,
}: {
  person: Person | null;
  tasks: Task[];
  showDone: boolean;
  onOpen: (t: Task) => void;
  nameOf: (id: string | null) => string;
}) {
  const counts = { not_started: 0, in_progress: 0, done: 0 };
  for (const t of tasks) counts[t.status]++;
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  const list = sortTasks(showDone ? tasks : tasks.filter((t) => t.status !== 'done'), 'due', 1, nameOf);
  return (
    <section className="card person-card">
      <div className="person-head">
        {person ? (
          <Avatar id={person.user_id} name={person.name} large />
        ) : (
          <span className="avatar lg" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }} aria-hidden="true">
            <UserRoundX size={18} />
          </span>
        )}
        <div className="grow">
          <h2 style={{ fontSize: '1rem' }}>{person ? person.name : 'Uten ansvarlig'}</h2>
          <div className="row tight wrap xsmall" style={{ marginTop: 4 }}>
            {person?.handles_tasks && <span className="badge accent">Oppgaver</span>}
            {person?.handles_finance && <span className="badge ok">Økonomi</span>}
            {person && !person.handles_tasks && !person.handles_finance && <span className="badge">Uten ansvarsområde</span>}
          </div>
        </div>
      </div>
      <dl className="kv" style={{ marginBottom: 12 }}>
        <dt>Ikke startet</dt>
        <dd>{counts.not_started}</dd>
        <dt>Pågår</dt>
        <dd>{counts.in_progress}</dd>
        <dt>Fullført</dt>
        <dd>{counts.done}</dd>
        {overdue > 0 && (
          <>
            <dt className="neg">Forfalt</dt>
            <dd className="neg">{overdue}</dd>
          </>
        )}
      </dl>
      {list.length === 0 ? (
        <p className="small subtle">{tasks.length ? 'Alle oppgaver er fullført.' : 'Ingen oppgaver.'}</p>
      ) : (
        <ul className="list">
          {list.map((t) => (
            <li key={t.id} className="list-item">
              <div className="li-main">
                <button type="button" className="row-btn li-title" onClick={() => onOpen(t)} style={{ display: 'block', width: '100%' }}>
                  {t.title}
                </button>
                <div className="li-sub row tight wrap" style={{ marginTop: 2 }}>
                  {t.due_date && <span className={isOverdue(t) ? 'neg' : ''}>Frist {formatDateShort(t.due_date)}</span>}
                  {t.category && <Tag label={t.category} scope="task" />}
                </div>
              </div>
              <StatusBadge status={t.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
