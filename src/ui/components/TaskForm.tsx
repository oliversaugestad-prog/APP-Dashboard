import { Lightbulb, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createTask, deleteTask, setTaskProperty, updateTask, type TaskInput } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { NO_REPEAT, ruleFrom, ruleToRow, type RepeatRule } from '../../lib/recurrence';
import { STATUS_LABEL, type Task, type TaskKind, type TaskStatus } from '../../lib/types';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { CategoryPicker } from './CategoryPicker';
import { Dialog } from './Dialog';
import { Segmented } from './common';
import { RepeatEditor } from './RepeatEditor';
import { PROP_ICON, PropertyCell } from './Properties';

interface Props {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  defaults?: Partial<TaskInput>;
}

export function TaskDialog({ open, onClose, task, defaults }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={task ? (task.kind === 'idea' ? 'Rediger idé' : 'Rediger oppgave') : 'Ny oppgave eller idé'}>
      {open && <TaskForm key={task?.id ?? 'new'} task={task} defaults={defaults} onDone={onClose} />}
    </Dialog>
  );
}

function TaskForm({ task, defaults, onDone }: { task: Task | null; defaults?: Partial<TaskInput>; onDone: () => void }) {
  const { project, people, reload, nameOf, properties, tasks } = useProject();
  // Egendefinerte egenskaper lagres med én gang, så vi viser alltid siste versjon av oppgaven.
  const live = task ? (tasks.find((t) => t.id === task.id) ?? task) : null;
  const toast = useToast();
  const [rule, setRule] = useState<RepeatRule>(() => (task ? ruleFrom(task) : NO_REPEAT));
  const [form, setForm] = useState<TaskInput>(() => ({
    title: task?.title ?? '',
    description: task?.description ?? '',
    due_date: task?.due_date ?? null,
    category: task?.category ?? '',
    assignee_id: task?.assignee_id ?? null,
    kind: task?.kind ?? 'task',
    status: task?.status ?? 'not_started',
    ...(!task ? defaults : {}),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('Gi oppgaven en tittel.');
    setBusy(true);
    setError(null);
    const ruleChanged = JSON.stringify(ruleToRow(rule)) !== JSON.stringify(task ? ruleToRow(ruleFrom(task)) : ruleToRow(NO_REPEAT));
    const input: TaskInput = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      ...ruleToRow(rule),
      // Serien regnes fra fristen når regelen settes eller endres.
      repeat_anchor: rule.freq ? (ruleChanged || !task?.repeat_anchor ? form.due_date : task.repeat_anchor) : null,
    };
    try {
      if (task) await updateTask(task.id, input);
      else await createTask(project.id, input);
      await reload();
      toast.ok(task ? 'Endringene er lagret.' : input.kind === 'idea' ? 'Ideen er lagt til.' : 'Oppgaven er lagt til.');
      onDone();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await deleteTask(task.id);
      await reload();
      toast.ok('Slettet.');
      onDone();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Segmented<TaskKind>
        label="Type"
        value={form.kind}
        onChange={(v) => set('kind', v)}
        options={[
          { value: 'task', label: 'Oppgave' },
          { value: 'idea', label: 'Idé' },
        ]}
      />
      {task?.kind === 'idea' && form.kind === 'task' && <p className="hint">Ideen blir gjort om til en oppgave når du lagrer.</p>}
      <div className="form-grid two">
        <label className="field full">
          <span>Tittel</span>
          <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} required />
        </label>
        <label className="field full">
          <span>Kort beskrivelse</span>
          <textarea className="textarea" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
        </label>
        <label className="field">
          <span>Ansvarlig</span>
          <select className="select" value={form.assignee_id ?? ''} onChange={(e) => set('assignee_id', e.target.value || null)}>
            <option value="">Ingen ansvarlig</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.name}
                {!p.handles_tasks ? ' (ikke oppgaveansvar)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Forfallsdato</span>
          <input className="input" type="date" value={form.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} />
        </label>
        <div className="field">
          <span>Kategori eller etikett</span>
          <CategoryPicker scope="task" label="Kategori eller etikett" value={form.category} onChange={(v) => set('category', v)} />
        </div>
        <label className="field">
          <span>Status</span>
          <select className="select" value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {form.kind === 'task' && (
          <div className="field full">
            <span>Gjentakelse</span>
            <RepeatEditor rule={rule} onChange={setRule} startDate={form.due_date} />
            {rule.freq && (
              <span className="hint">
                {form.due_date
                  ? 'Når oppgaven fullføres, lages neste forekomst automatisk med ny frist.'
                  : 'Uten frist regnes neste forekomst fra dagen oppgaven fullføres.'}
              </span>
            )}
          </div>
        )}
      </div>
      {live && properties.length > 0 && (
        <div className="prop-fields" aria-label="Egenskaper">
          {properties.map((p) => (
            <div key={p.id} style={{ display: 'contents' }}>
              <span className="prop-name">
                <span aria-hidden="true" className="menu-icon">
                  {PROP_ICON[p.type]}
                </span>
                {p.name}
              </span>
              <PropertyCell
                task={live}
                prop={p}
                variant="field"
                onSet={async (v) => {
                  try {
                    await setTaskProperty(live.id, p.id, v);
                    await reload();
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}
      {!task && properties.length > 0 && <p className="hint">Egendefinerte egenskaper kan fylles ut i tabellen eller når oppgaven er lagret.</p>}
      {task && (
        <p className="xsmall subtle">
          Registrert av {nameOf(task.created_by) || 'ukjent'} {formatDate(task.created_at)}
          {task.completed_at ? ` · Fullført ${formatDate(task.completed_at)}` : ''}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {task &&
          (confirmDelete ? (
            <span className="row tight left">
              <button type="button" className="btn danger small" onClick={remove} disabled={busy}>
                Ja, slett
              </button>
              <button type="button" className="btn ghost small" onClick={() => setConfirmDelete(false)}>
                Avbryt
              </button>
            </span>
          ) : (
            <button type="button" className="btn ghost small left" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} aria-hidden="true" /> Slett
            </button>
          ))}
        <button type="submit" className="btn primary" disabled={busy}>
          {task?.kind === 'idea' && form.kind === 'task' ? (
            <>
              <Lightbulb size={16} aria-hidden="true" /> Gjør til oppgave
            </>
          ) : busy ? (
            'Lagrer …'
          ) : (
            'Lagre'
          )}
        </button>
      </div>
    </form>
  );
}
