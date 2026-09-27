import { ChevronLeft, ChevronRight, Plus, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { addMonths, formatMonth, monthSlug, slugToMonth, today } from '../../lib/dates';
import { monthSummaries } from '../../lib/finance';
import { formatNok } from '../../lib/money';
import type { Transaction } from '../../lib/types';
import { useProject } from '../../state/project';
import { BudgetDialog } from '../components/BudgetDialog';
import { Empty, percent, Progress } from '../components/common';
import { TransactionDialog } from '../components/TransactionForm';
import { applyTxFilter, EMPTY_TX_FILTER, TxFilters, type TxFilter } from '../components/TxFilters';
import { TxTable, type Grouping } from '../components/TxTable';
import { FinanceSubnav, Page } from '../Layout';

export function MonthDetailPage() {
  const { month: slug = '' } = useParams();
  const month = slugToMonth(slug);
  const { transactions, budgets, project, isOwner } = useProject();
  const [filter, setFilter] = useState<TxFilter>(EMPTY_TX_FILTER);
  const [grouping, setGrouping] = useState<Grouping>('type');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const summary = useMemo(() => {
    if (!month) return null;
    return monthSummaries(transactions, budgets, project.opening_balance_ore, [month]).find((m) => m.month === month)!;
  }, [transactions, budgets, project.opening_balance_ore, month]);

  if (!month || !summary) return <Navigate to={`/p/${project.id}/okonomi/maneder`} replace />;

  const monthTxs = transactions.filter((t) => t.month === month);
  const shown = applyTxFilter(monthTxs, filter);
  const base = `/p/${project.id}/okonomi/maneder`;
  const title = formatMonth(month);
  const isCurrent = month.slice(0, 7) === today().slice(0, 7);

  return (
    <Page
      title={title}
      back={{ to: base, label: 'Tilbake til månedsoversikten' }}
      subnav={<FinanceSubnav />}
      actions={
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={18} aria-hidden="true" />
          <span className="desktop-only">Ny post</span>
          <span className="mobile-only">Ny</span>
        </button>
      }
    >
      <div className="spread">
        <Link to={`${base}/${monthSlug(addMonths(month, -1))}`} className="btn ghost small">
          <ChevronLeft size={16} aria-hidden="true" /> {formatMonth(addMonths(month, -1))}
        </Link>
        <Link to={`${base}/${monthSlug(addMonths(month, 1))}`} className="btn ghost small">
          {formatMonth(addMonths(month, 1))} <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="saldo-h">
          <div className="card-head">
            <h2 id="saldo-h">Saldo</h2>
            {isCurrent && <span className="badge accent">Denne måneden</span>}
          </div>
          <div className="calc">
            <span className="op" aria-hidden="true" />
            <span>Startsaldo</span>
            <span className="val">{formatNok(summary.startBalance)}</span>
            <span className="op" aria-hidden="true">
              +
            </span>
            <span>Inntekter</span>
            <span className="val pos">{formatNok(summary.income)}</span>
            <span className="op" aria-hidden="true">
              −
            </span>
            <span>Utgifter</span>
            <span className="val">{formatNok(summary.expenses)}</span>
            <span className="line" />
            <span className="op" aria-hidden="true">
              =
            </span>
            <span className="total">Sluttsaldo</span>
            <span className={`val total ${summary.endBalance < 0 ? 'neg' : ''}`}>{formatNok(summary.endBalance)}</span>
          </div>
          <p className="xsmall subtle" style={{ marginTop: 12 }}>
            Startsaldo er prosjektets startsaldo ({formatNok(project.opening_balance_ore, { short: true })}) pluss resultatet i alle tidligere måneder.
            {isOwner && (
              <>
                {' '}
                <Link to={`/p/${project.id}/innstillinger`}>Endre startsaldo</Link>
              </>
            )}
          </p>
        </section>

        <section className="card" aria-labelledby="budsjett-h">
          <div className="card-head">
            <h2 id="budsjett-h">Budsjett</h2>
            <button type="button" className="btn small" onClick={() => setBudgetOpen(true)}>
              {summary.budget === null ? 'Sett budsjett' : 'Endre'}
            </button>
          </div>
          {summary.budget === null ? (
            <p className="muted small">Ingen budsjett for denne måneden. Sett et utgiftsbudsjett for å følge med på forbruket.</p>
          ) : (
            <div className="stack-sm">
              <div className="progress-label">
                <span>{percent(summary.usedRatio)} av budsjettet er brukt</span>
                {summary.overBudget && <span className="badge error">Over budsjett</span>}
              </div>
              <Progress ratio={summary.usedRatio} label="Andel av budsjettet som er brukt" />
              <dl className="kv" style={{ marginTop: 6 }}>
                <dt>Budsjett</dt>
                <dd>{formatNok(summary.budget)}</dd>
                <dt>Utgifter</dt>
                <dd>{formatNok(summary.expenses)}</dd>
                <dt>{summary.overBudget ? 'Overskredet med' : 'Igjen'}</dt>
                <dd className={summary.overBudget ? 'neg strong' : 'strong'}>{formatNok(Math.abs(summary.remaining ?? 0))}</dd>
              </dl>
            </div>
          )}
        </section>
      </div>

      <div className="card flush">
        <div className="card-head">
          <h2>Poster i {title.toLowerCase()}</h2>
        </div>
        <div style={{ padding: '0 16px 14px' }}>
          <TxFilters filter={filter} onChange={setFilter} grouping={grouping} onGrouping={setGrouping} />
        </div>
        {monthTxs.length === 0 ? (
          <Empty icon={<Receipt size={24} />} title="Ingen poster denne måneden" />
        ) : shown.length === 0 ? (
          <Empty icon={<Receipt size={24} />} title="Ingen treff">
            Prøv å endre filtrene.
          </Empty>
        ) : (
          <TxTable txs={shown} grouping={grouping} onOpen={setEditing} showMonth={false} />
        )}
      </div>

      <TransactionDialog
        open={creating || editing !== null}
        tx={editing}
        defaults={isCurrent ? undefined : { occurred_on: month }}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <BudgetDialog open={budgetOpen} month={month} onClose={() => setBudgetOpen(false)} />
    </Page>
  );
}
