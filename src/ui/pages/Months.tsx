import { CalendarPlus, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMonth, monthOf, monthSlug, today } from '../../lib/dates';
import { monthSummaries, type MonthSummary } from '../../lib/finance';
import { formatNok } from '../../lib/money';
import { useProject } from '../../state/project';
import { BudgetDialog } from '../components/BudgetDialog';
import { percent, Progress } from '../components/common';
import { FinanceSubnav, Page } from '../Layout';

export function MonthsPage() {
  const { transactions, budgets, project } = useProject();
  const [budgetFor, setBudgetFor] = useState<string | null | undefined>(undefined);
  const current = monthOf(today());
  const months = useMemo(
    () => monthSummaries(transactions, budgets, project.opening_balance_ore, [current]).reverse(),
    [transactions, budgets, project.opening_balance_ore, current],
  );

  return (
    <Page
      title="Månedsoversikt"
      subnav={<FinanceSubnav />}
      actions={
        <button type="button" className="btn" onClick={() => setBudgetFor(null)}>
          <CalendarPlus size={18} aria-hidden="true" />
          <span className="desktop-only">Budsjett for ny måned</span>
          <span className="mobile-only">Budsjett</span>
        </button>
      }
    >
      <p className="muted small">
        <strong>Budsjett</strong> er hvor mye dere planlegger å bruke i måneden. <strong>Saldo</strong> er pengene prosjektet faktisk har, regnet fra
        startsaldoen og alle registrerte poster.
      </p>
      <div className="month-grid">
        {months.map((m) => (
          <MonthCard key={m.month} m={m} current={m.month === current} projectId={project.id} onBudget={() => setBudgetFor(m.month)} />
        ))}
      </div>
      <BudgetDialog open={budgetFor !== undefined} month={budgetFor ?? null} onClose={() => setBudgetFor(undefined)} />
    </Page>
  );
}

export function MonthCard({ m, current, projectId, onBudget }: { m: MonthSummary; current: boolean; projectId: string; onBudget: () => void }) {
  const to = `/p/${projectId}/okonomi/maneder/${monthSlug(m.month)}`;
  return (
    <section className={`card month-card ${m.overBudget ? 'over' : current ? 'current' : ''}`} aria-labelledby={`m-${m.month}`}>
      <div className="spread">
        <h3 id={`m-${m.month}`}>
          <Link to={to} className="row-btn" style={{ color: 'inherit' }}>
            {formatMonth(m.month)}
          </Link>
        </h3>
        {m.overBudget ? <span className="badge error">Over budsjett</span> : current ? <span className="badge accent">Denne måneden</span> : null}
      </div>

      {m.budget !== null ? (
        <div>
          <div className="progress-label">
            <span>Budsjett {formatNok(m.budget, { short: true })}</span>
            <span className={m.overBudget ? 'neg' : ''}>{percent(m.usedRatio)} brukt</span>
          </div>
          <Progress ratio={m.usedRatio} label={`Andel av budsjettet for ${formatMonth(m.month)} som er brukt`} />
        </div>
      ) : (
        <div className="spread small">
          <span className="subtle">Ikke noe budsjett satt</span>
          <button type="button" className="link-btn small" onClick={onBudget}>
            Sett budsjett
          </button>
        </div>
      )}

      <dl className="kv">
        <dt>Utgifter</dt>
        <dd>{formatNok(m.expenses)}</dd>
        <dt>Inntekter</dt>
        <dd className="pos">{formatNok(m.income)}</dd>
        <dt>Resultat</dt>
        <dd className={m.result < 0 ? 'neg' : m.result > 0 ? 'pos' : ''}>{formatNok(m.result, { sign: m.result > 0 })}</dd>
        {m.remaining !== null && (
          <>
            <dt>{m.overBudget ? 'Budsjett overskredet med' : 'Igjen av budsjettet'}</dt>
            <dd className={m.overBudget ? 'neg strong' : 'strong'}>{formatNok(Math.abs(m.remaining))}</dd>
          </>
        )}
        <div className="sep" />
        <dt className="subtle">Saldo ved månedsslutt</dt>
        <dd className="subtle">{formatNok(m.endBalance)}</dd>
      </dl>

      <div className="spread xsmall">
        <span className="subtle">{m.count === 1 ? '1 post' : `${m.count} poster`}</span>
        <span className="row tight">
          {m.budget !== null && (
            <button type="button" className="link-btn xsmall" onClick={onBudget}>
              Endre budsjett
            </button>
          )}
          <Link to={to} className="row tight" aria-label={`Åpne ${formatMonth(m.month)}`}>
            Åpne <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </span>
      </div>
    </section>
  );
}
