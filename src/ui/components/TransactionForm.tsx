import { Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { createTransaction, deleteTransaction, updateTransaction, type TransactionInput } from '../../lib/api';
import { formatDate, formatMonth, monthOf, today } from '../../lib/dates';
import { convertMinor, CURRENCIES, fetchRate, formatRate, parseRate } from '../../lib/fx';
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
  const base = project.currency;
  const lastKey = `prosjektpanel:currency:${project.id}`;
  const [currency, setCurrency] = useState<string>(() => {
    if (tx) return tx.orig_currency;
    try {
      return localStorage.getItem(lastKey) ?? base;
    } catch {
      return base;
    }
  });
  const [amount, setAmount] = useState(tx ? oreToInput(tx.orig_amount) : '');
  // Kursen: hentes automatisk for valuta + dato, men kan skrives inn for hånd.
  const [rateText, setRateText] = useState(tx && tx.orig_currency !== base ? String(tx.fx_rate).replace('.', ',') : '');
  const [rateInfo, setRateInfo] = useState<{ key: string; date: string | null; source: 'auto' | 'manual' | 'saved' } | null>(
    tx && tx.orig_currency !== base ? { key: `${tx.orig_currency}|${tx.occurred_on}`, date: tx.fx_date, source: 'saved' } : null,
  );
  const [rateState, setRateState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [date, setDate] = useState(tx?.occurred_on ?? defaults?.occurred_on ?? today());
  const [category, setCategory] = useState(tx?.category ?? '');
  const [personId, setPersonId] = useState<string>(tx ? (tx.person_id ?? '') : people.some((p) => p.user_id === userId) ? userId : '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsed = parseNok(amount);
  const foreign = currency !== base;
  const rate = foreign ? parseRate(rateText) : 1;
  const converted = parsed !== null && rate ? convertMinor(parsed, rate) : null;

  // Hent kursen når valuta eller dato endres — men ikke over en kurs brukeren har skrevet selv.
  useEffect(() => {
    if (!foreign || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const key = `${currency}|${date}`;
    if (rateInfo?.key === key) return;
    let cancelled = false;
    setRateState('loading');
    fetchRate(currency, base, date)
      .then((r) => {
        if (cancelled) return;
        setRateText(String(Number(r.rate.toPrecision(8))).replace('.', ','));
        setRateInfo({ key, date: r.date, source: 'auto' });
        setRateState('idle');
      })
      .catch(() => {
        if (cancelled) return;
        setRateInfo({ key, date: null, source: 'manual' });
        setRateState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [foreign, currency, date, base, rateInfo?.key]);
  const suggestions = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Skriv inn et navn eller en beskrivelse.');
    if (parsed === null || parsed <= 0) return setError('Skriv inn et beløp større enn 0, for eksempel 1 250,50.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Velg en dato.');
    if (foreign && (!rate || rateState === 'loading')) return setError(`Mangler valutakurs fra ${currency} til ${base}. Skriv inn kursen.`);
    if (!converted || converted <= 0) return setError('Beløpet blir 0 etter omregning. Sjekk kursen.');
    try {
      localStorage.setItem(lastKey, currency);
    } catch {
      /* ikke viktig */
    }
    const input: TransactionInput = {
      type,
      name: name.trim(),
      amount_ore: converted,
      orig_currency: currency,
      orig_amount: parsed,
      fx_rate: rate ?? 1,
      fx_date: foreign ? (rateInfo?.date ?? date) : date,
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
        <div className="field">
          <label htmlFor={`${listId}-amt`}>Beløp</label>
          <div className="row tight">
            <input
              id={`${listId}-amt`}
              className="input amount grow"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              aria-describedby={`${listId}-amount`}
            />
            <select className="select" aria-label="Valuta" style={{ width: 96 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code} title={c.name}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <span className="hint" id={`${listId}-amount`}>
            {parsed === null || parsed <= 0
              ? 'Skriv beløpet uten fortegn.'
              : foreign
                ? converted
                  ? `= ${formatNok(type === 'expense' ? -converted : converted, { sign: true })} i ${base}`
                  : 'Venter på kurs …'
                : formatNok(type === 'expense' ? -parsed : parsed, { sign: true })}
          </span>
        </div>
        <label className="field">
          <span>Dato</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <span className="hint">Hører til {date ? formatMonth(monthOf(date)).toLowerCase() : '–'}.</span>
        </label>
        {foreign && (
          <div className="field full fx-box">
            <label htmlFor={`${listId}-rate`}>
              Valutakurs ({currency} → {base})
            </label>
            <div className="row tight wrap">
              <span className="small muted">1 {currency} =</span>
              <input
                id={`${listId}-rate`}
                className="input sm amount"
                style={{ width: 130 }}
                inputMode="decimal"
                value={rateText}
                onChange={(e) => {
                  setRateText(e.target.value);
                  setRateInfo({ key: `${currency}|${date}`, date, source: 'manual' });
                  setRateState('idle');
                }}
              />
              <span className="small muted">{base}</span>
              {rateInfo?.source === 'manual' && rateState !== 'error' && (
                <button type="button" className="link-btn small" onClick={() => setRateInfo(null)}>
                  Hent dagens kurs
                </button>
              )}
            </div>
            <span className="hint" role="status">
              {rateState === 'loading'
                ? 'Henter kurs …'
                : rateState === 'error'
                  ? 'Kunne ikke hente kursen automatisk. Skriv den inn selv.'
                  : rateInfo?.source === 'manual'
                    ? 'Egen kurs.'
                    : rate
                      ? `${formatRate(currency, base, rate)} · ECB-kurs for ${rateInfo?.date ? formatDate(rateInfo.date) : formatDate(date)}`
                      : ''}
            </span>
          </div>
        )}
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
