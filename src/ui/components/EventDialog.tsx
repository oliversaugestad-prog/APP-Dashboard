import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createEvent, deleteEvent, updateEvent, type EventInput } from '../../lib/api';
import { TYPE_LABEL } from '../../lib/calendar/appearance';
import { NO_REPEAT, ruleFrom, ruleToRow, type RepeatRule } from '../../lib/recurrence';
import type { CalendarEvent, EventType } from '../../lib/types';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { CategoryPicker } from './CategoryPicker';
import { Dialog } from './Dialog';
import { RepeatEditor } from './RepeatEditor';

export interface EventDraft {
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  repeat?: RepeatRule;
}

const TYPES: EventType[] = ['meeting', 'event', 'deadline', 'work', 'other'];

export function EventDialog({ open, onClose, event, draft }: { open: boolean; onClose: () => void; event: CalendarEvent | null; draft?: EventDraft | null }) {
  return (
    <Dialog open={open} onClose={onClose} title={event ? 'Rediger hendelse' : 'Ny hendelse'}>
      {open && <EventForm key={event?.id ?? JSON.stringify(draft)} event={event} draft={draft ?? null} onDone={onClose} />}
    </Dialog>
  );
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

function EventForm({ event, draft, onDone }: { event: CalendarEvent | null; draft: EventDraft | null; onDone: () => void }) {
  const { project, people, reload } = useProject();
  const toast = useToast();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [title, setTitle] = useState(event?.title ?? '');
  const [type, setType] = useState<EventType>(event?.type ?? 'meeting');
  const [startDate, setStartDate] = useState(event?.start_date ?? draft?.start_date ?? todayKey);
  const [endDate, setEndDate] = useState(event?.end_date ?? draft?.end_date ?? draft?.start_date ?? todayKey);
  const initialStart = event ? hhmm(event.start_time) : (draft?.start_time ?? '10:00');
  const [allDay, setAllDay] = useState(event ? !event.start_time : draft ? draft.start_time === null : false);
  const [startTime, setStartTime] = useState(initialStart || '10:00');
  const [endTime, setEndTime] = useState((event ? hhmm(event.end_time) : draft?.end_time) || '11:00');
  const [category, setCategory] = useState(event?.category ?? '');
  const [personId, setPersonId] = useState(event?.person_id ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [rule, setRule] = useState<RepeatRule>(event ? ruleFrom(event) : (draft?.repeat ?? NO_REPEAT));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Gi hendelsen en tittel.');
    if (endDate < startDate) return setError('Sluttdatoen kan ikke være før startdatoen.');
    if (!allDay && endDate === startDate && endTime <= startTime) return setError('Sluttid må være etter starttid.');
    if (rule.until && rule.until < startDate) return setError('«Til og med» må være etter startdatoen.');
    const input: EventInput = {
      title: title.trim(),
      type,
      start_date: startDate,
      end_date: endDate,
      start_time: allDay ? null : startTime,
      end_time: allDay ? null : endTime,
      category: category.trim(),
      person_id: personId || null,
      location: location.trim(),
      description: description.trim(),
      ...ruleToRow(rule),
    };
    setBusy(true);
    setError(null);
    try {
      if (event) await updateEvent(event.id, input);
      else await createEvent(project.id, input);
      await reload();
      toast.ok(event ? 'Hendelsen er oppdatert.' : 'Hendelsen er lagt i kalenderen.');
      onDone();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setBusy(true);
    try {
      await deleteEvent(event.id);
      await reload();
      toast.ok(event.repeat_freq ? 'Hele serien er slettet.' : 'Hendelsen er slettet.');
      onDone();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <label className="field">
        <span>Tittel</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
      </label>
      <div className="segmented" role="group" aria-label="Type" style={{ flexWrap: 'wrap' }}>
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <label className="check small">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Hele dagen
      </label>
      <div className="form-grid two">
        <label className="field">
          <span>Fra dato</span>
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => {
              const v = e.target.value;
              // Flytt sluttdatoen med, så lengden på hendelsen beholdes.
              if (v && endDate < v) setEndDate(v);
              setStartDate(v);
            }}
          />
        </label>
        <label className="field">
          <span>Til dato</span>
          <input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        {!allDay && (
          <>
            <label className="field">
              <span>Fra kl.</span>
              <input className="input" type="time" value={startTime} step={900} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="field">
              <span>Til kl.</span>
              <input className="input" type="time" value={endTime} step={900} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </>
        )}
        <div className="field">
          <span>Kategori</span>
          <CategoryPicker scope="task" label="Kategori" value={category} onChange={setCategory} />
        </div>
        <label className="field">
          <span>Person</span>
          <select className="select" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Ingen</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>Sted eller lenke</span>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />
        </label>
        <label className="field full">
          <span>Beskrivelse</span>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} style={{ minHeight: 64 }} />
        </label>
        <div className="field full">
          <span>Gjentakelse</span>
          <RepeatEditor rule={rule} onChange={setRule} startDate={startDate} />
        </div>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {event &&
          (confirmDelete ? (
            <span className="row tight left">
              <button type="button" className="btn danger small" onClick={remove} disabled={busy}>
                Ja, slett{event.repeat_freq ? ' hele serien' : ''}
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
          {busy ? 'Lagrer …' : 'Lagre'}
        </button>
      </div>
    </form>
  );
}
