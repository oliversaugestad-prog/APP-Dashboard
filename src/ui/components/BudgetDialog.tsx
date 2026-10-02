import { useState, type FormEvent } from 'react';
import { setBudget } from '../../lib/api';
import { formatMonth, monthOf, monthSlug } from '../../lib/dates';
import { oreToInput, parseNok } from '../../lib/money';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { Dialog } from './Dialog';

/** Sett, endre eller fjern utgiftsbudsjettet for en måned. Uten `month` velger brukeren måned selv. */
export function BudgetDialog({ open, onClose, month }: { open: boolean; onClose: () => void; month: string | null }) {
  return (
    <Dialog open={open} onClose={onClose} title={month ? `Budsjett for ${formatMonth(month).toLowerCase()}` : 'Legg til måned med budsjett'}>
      {open && <BudgetForm key={month ?? 'new'} month={month} onDone={onClose} />}
    </Dialog>
  );
}

function BudgetForm({ month, onDone }: { month: string | null; onDone: () => void }) {
  const { project, budgets, reload } = useProject();
  const toast = useToast();
  const [slug, setSlug] = useState(month ? monthSlug(month) : '');
  const selected = slug ? monthOf(`${slug}-01`) : null;
  const existing = budgets.find((b) => b.month === selected);
  const [amount, setAmount] = useState(existing ? oreToInput(existing.budget_ore) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (value: number | null) => {
    if (!selected) return setError('Velg en måned.');
    setBusy(true);
    try {
      await setBudget(project.id, selected, value);
      await reload();
      toast.ok(value === null ? 'Budsjettet er fjernet.' : 'Budsjettet er lagret.');
      onDone();
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseNok(amount);
    if (v === null || v < 0) return setError('Skriv inn et gyldig beløp, for eksempel 15 000.');
    void save(v);
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {!month && (
        <label className="field">
          <span>Måned</span>
          <input
            className="input"
            type="month"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              const b = budgets.find((x) => x.month === `${e.target.value}-01`);
              if (b) setAmount(oreToInput(b.budget_ore));
            }}
          />
        </label>
      )}
      <label className="field">
        <span>Utgiftsbudsjett ({project.currency})</span>
        <input className="input amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        <span className="hint">Hvor mye prosjektet planlegger å bruke denne måneden. Budsjettet påvirker ikke saldoen.</span>
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {existing && (
          <button type="button" className="btn ghost small left" onClick={() => save(null)} disabled={busy}>
            Fjern budsjett
          </button>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Lagrer …' : 'Lagre budsjett'}
        </button>
      </div>
    </form>
  );
}
