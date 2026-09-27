import { Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { createTransaction, deleteTransaction, updateTransaction, type TransactionInput } from '../../lib/api';
import { formatDate, formatMonth, monthOf, today } from '../../lib/dates';
import { formatNok, oreToInput, parseNok } from '../../lib/money';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type Transaction, type TxType } from '../../lib/types';
import { useAuth } from '../../state/auth';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { CategoryPicker } from './CategoryPicker';
import { Dialog } from './Dialog';
import { Segmented } from './common';

export function TransactionDialog({
  open,
  onClose,
  tx,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  tx: Transaction | null;
  defaults?: Partial<TransactionInput>;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={tx ? 'Rediger post' : 'Ny økonomisk post'}>
      {open && <TransactionForm key={tx?.id ?? 'new'} tx={tx} defaults={defaults} onDone={onClose} />}
    </Dialog>
  );
}

function TransactionForm({ tx, defaults, onDone }: { tx: Transaction | null; defaults?: Partial<TransactionInput>; onDone: () => void }) {
  const { project, people, reload, nameOf } = useProject();
  const { userId } = useAuth();
  const toast = useToast();
  const listId = useId();
  const [type, setType] = useState<TxType>(tx?.type ?? defaults?.type ?? 'expense');
  const [name, setName] = useState(tx?.name ?? '');
  const [amount, setAmount] = useState(tx ? oreToInput(tx.amount_ore) : '');
  const [date, setDate] = useState(tx?.occurred_on ?? defaults?.occurred_on ?? today());
  const [category, setCategory] = useState(tx?.category ?? '');
  const [personId, setPersonId] = useState<string>(tx ? (tx.person_id ?? '') : people.some((p) => p.user_id === userId) ? userId : '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsed = parseNok(amount);
  const suggestions = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Skriv inn et navn eller en beskrivelse.');
    if (parsed === null || parsed <= 0) return setError('Skriv inn et beløp større enn 0, for eksempel 1 250,50.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Velg en dato.');
    const input: TransactionInput = {
      type,
      name: name.trim(),
      amount_ore: parsed,
      occurred_on: date,
      category: category.trim(),
      person_id: personId || null,
      note: note.trim(),
    };
    setBusy(true);
    setError(null);
    try {
      if (tx) await updateTransaction(tx.id, input);
      else await createTransaction(project.id, input);
      await reload();
      const moved = tx && monthOf(tx.occurred_on) !== monthOf(date);
      toast.ok(moved ? `Lagret og flyttet til ${formatMonth(monthOf(date)).toLowerCase()}.` : tx ? 'Endringene er lagret.' : 'Posten er registrert.');
      onDone();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!tx) return;
    setBusy(true);
    try {
      await deleteTransaction(tx.id);
      await reload();
      toast.ok('Posten er slettet.');
      onDone();
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Segmented<TxType>
        className="type"
        label="Type"
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Utgift' },
          { value: 'income', label: 'Inntekt' },
        ]}
      />
      <div className="form-grid two">
        <label className="field full">
          <span>Navn eller beskrivelse</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder={type === 'expense' ? 'F.eks. Leie av lokale' : 'F.eks. Billettsalg'}
          />
        </label>
        <label className="field">
          <span>Beløp (NOK)</span>
          <input
            className="input amount"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            aria-describedby={`${listId}-amount`}
          />
          <span className="hint" id={`${listId}-amount`}>
            {parsed !== null && parsed > 0 ? formatNok(type === 'expense' ? -parsed : parsed, { sign: true }) : 'Skriv beløpet uten fortegn.'}
          </span>
        </label>
        <label className="field">
          <span>Dato</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <span className="hint">Hører til {date ? formatMonth(monthOf(date)).toLowerCase() : '–'}.</span>
        </label>
        <div className="field">
          <span>Kategori</span>
          <CategoryPicker scope="finance" label="Kategori" value={category} onChange={setCategory} suggestions={suggestions} />
          {category.trim().toLowerCase() === 'lønn' && (
            <span className="hint">
              {type === 'expense' ? 'Lønn prosjektet betaler ut, registreres som utgift.' : 'Lønn prosjektet mottar, registreres som inntekt.'}
            </span>
          )}
        </div>
        <label className="field">
          <span>{type === 'expense' ? 'Hvem betalte?' : 'Hvem mottok?'}</span>
          <select className="select" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Ingen / prosjektet</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>Notat (valgfritt)</span>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} style={{ minHeight: 64 }} />
        </label>
      </div>
      {tx && (
        <p className="xsmall subtle">
          Registrert av {nameOf(tx.created_by) || 'ukjent'} {formatDate(tx.created_at)}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {tx &&
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
          {busy ? 'Lagrer …' : tx ? 'Lagre' : 'Registrer'}
        </button>
      </div>
    </form>
  );
}
