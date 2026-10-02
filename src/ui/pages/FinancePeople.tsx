import { UserRoundX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateShort, formatMonth } from '../../lib/dates';
import { personTotals, totals, type PersonTotals } from '../../lib/finance';
import { formatNok } from '../../lib/money';
import type { Person, Transaction } from '../../lib/types';
import { useProject } from '../../state/project';
import { Avatar, Tag } from '../components/common';
import { TransactionDialog } from '../components/TransactionForm';
import { FinanceSubnav, Page } from '../Layout';

export function FinancePeoplePage() {
  const { transactions, people, personById } = useProject();
  const [period, setPeriod] = useState('');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const months = useMemo(() => [...new Set(transactions.map((t) => t.month))].sort().reverse(), [transactions]);
  const txs = useMemo(() => (period ? transactions.filter((t) => t.month === period) : transactions), [transactions, period]);
  const byPerson = useMemo(() => personTotals(txs), [txs]);
  const empty = (id: string | null): PersonTotals => ({ personId: id, paid: 0, received: 0, expenseCount: 0, incomeCount: 0, items: [] });

  // Alle nåværende medlemmer, pluss poster uten person eller fra tidligere medlemmer.
  const rows: { person: Person | null; key: string; label: string; t: PersonTotals }[] = [
    ...people.map((p) => ({ person: p, key: p.user_id, label: p.name, t: byPerson.get(p.user_id) ?? empty(p.user_id) })),
    ...[...byPerson.values()]
      .filter((t) => t.personId === null || !personById.has(t.personId))
      .map((t) => ({ person: null, key: t.personId ?? 'none', label: t.personId ? 'Tidligere medlem' : 'Ingen person / prosjektet', t })),
  ];
  const sum = totals(txs);
  const periodLabel = period ? formatMonth(period) : 'Hele prosjektet';

  return (
    <Page title="Betalinger per person" subnav={<FinanceSubnav />}>
      <div className="spread">
        <p className="muted small">Hvem som har betalt utgifter og mottatt inntekter. «Betalt» er utlegg personen har gjort for prosjektet.</p>
        <label className="field" style={{ minWidth: 200 }}>
          <span className="sr-only">Periode</span>
          <select className="select sm" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Periode">
            <option value="">Hele prosjektet</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card flush" aria-labelledby="sum-h">
        <div className="card-head">
          <h2 id="sum-h">Summer · {periodLabel}</h2>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="r">Har betalt (utgifter)</th>
                <th className="r desktop-cell">Antall</th>
                <th className="r">Har mottatt (inntekter)</th>
                <th className="r desktop-cell">Antall</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <span className="person">
                      {r.person ? <Avatar id={r.person.user_id} name={r.person.name} /> : <UserRoundX size={18} aria-hidden="true" className="subtle" />}
                      <span>{r.label}</span>
                    </span>
                  </td>
                  <td className="r num">{formatNok(r.t.paid)}</td>
                  <td className="r num desktop-cell subtle">{r.t.expenseCount}</td>
                  <td className="r num pos">{formatNok(r.t.received)}</td>
                  <td className="r num desktop-cell subtle">{r.t.incomeCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Totalt</td>
                <td className="r num">{formatNok(sum.expenses)}</td>
                <td className="r num desktop-cell">{txs.filter((t) => t.type === 'expense').length}</td>
                <td className="r num pos">{formatNok(sum.income)}</td>
                <td className="r num desktop-cell">{txs.filter((t) => t.type === 'income').length}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="layout-grid cols-3">
        {rows
          .filter((r) => r.t.items.length > 0)
          .map((r) => (
            <PersonCard key={r.key} label={r.label} person={r.person} t={r.t} total={sum.expenses} onOpen={setEditing} />
          ))}
      </div>

      <TransactionDialog open={editing !== null} tx={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function PersonCard({
  label,
  person,
  t,
  total,
  onOpen,
}: {
  label: string;
  person: Person | null;
  t: PersonTotals;
  total: number;
  onOpen: (t: Transaction) => void;
}) {
  const expenses = t.items.filter((x) => x.type === 'expense').sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const income = t.items.filter((x) => x.type === 'income').sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const share = total > 0 ? Math.round((t.paid / total) * 100) : 0;
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
          <h2 style={{ fontSize: '1rem' }}>{label}</h2>
          <p className="xsmall subtle">
            {share} % av utgiftene er betalt av {person ? 'denne personen' : 'prosjektet / ingen'}
          </p>
        </div>
      </div>
      <dl className="kv">
        <dt>Har betalt</dt>
        <dd>{formatNok(t.paid)}</dd>
        <dt>Har mottatt</dt>
        <dd className="pos">{formatNok(t.received)}</dd>
      </dl>
      {expenses.length > 0 && <TxList title="Utgifter betalt" items={expenses} onOpen={onOpen} />}
      {income.length > 0 && <TxList title="Inntekter mottatt" items={income} onOpen={onOpen} />}
    </section>
  );
}

function TxList({ title, items, onOpen }: { title: string; items: Transaction[]; onOpen: (t: Transaction) => void }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h3 className="xsmall subtle" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 650 }}>
        {title}
      </h3>
      <ul className="list">
        {items.map((x) => (
          <li key={x.id} className="list-row">
            <div className="li-main">
              <button type="button" className="row-btn li-title" onClick={() => onOpen(x)} style={{ display: 'block', width: '100%' }}>
                {x.name}
              </button>
              <div className="li-sub row tight wrap">
                <span>{formatDateShort(x.occurred_on)}</span>
                {x.category && <Tag label={x.category} scope="finance" />}
              </div>
            </div>
            <span className={`num small ${x.type === 'income' ? 'pos' : ''}`}>{formatNok(x.amount_ore)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
