import { Plus, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { totals } from '../../lib/finance';
import { formatNok } from '../../lib/money';
import type { Transaction } from '../../lib/types';
import { useProject } from '../../state/project';
import { Empty } from '../components/common';
import { TransactionDialog } from '../components/TransactionForm';
import { applyTxFilter, EMPTY_TX_FILTER, TxFilters, type TxFilter } from '../components/TxFilters';
import { TxTable, type Grouping } from '../components/TxTable';
import { FinanceSubnav, Page } from '../Layout';

export function FinancePage() {
  const { transactions, project } = useProject();
  const [filter, setFilter] = useState<TxFilter>(EMPTY_TX_FILTER);
  const [grouping, setGrouping] = useState<Grouping>('none');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [creating, setCreating] = useState(false);

  const months = useMemo(() => [...new Set(transactions.map((t) => t.month))].sort().reverse(), [transactions]);
  const shown = useMemo(() => applyTxFilter(transactions, filter), [transactions, filter]);
  const all = totals(transactions);
  const sel = totals(shown);
  const filtered = shown.length !== transactions.length;

  return (
    <Page
      title="Økonomi"
      subnav={<FinanceSubnav />}
      actions={
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={18} aria-hidden="true" />
          <span className="desktop-only">Ny post</span>
          <span className="mobile-only">Ny</span>
        </button>
      }
    >
      <div className="metrics four">
        <div className="metric">
          <span className="m-label">Inntekter{filtered ? ' (utvalg)' : ''}</span>
          <span className="m-value num pos">{formatNok(sel.income)}</span>
        </div>
        <div className="metric">
          <span className="m-label">Utgifter{filtered ? ' (utvalg)' : ''}</span>
          <span className="m-value num">{formatNok(sel.expenses)}</span>
        </div>
        <div className="metric">
          <span className="m-label">Resultat{filtered ? ' (utvalg)' : ''}</span>
          <span className={`m-value num ${sel.result < 0 ? 'neg' : sel.result > 0 ? 'pos' : ''}`}>{formatNok(sel.result, { sign: sel.result > 0 })}</span>
        </div>
        <div className="metric">
          <span className="m-label">Saldo nå</span>
          <span className="m-value num">{formatNok(project.opening_balance_ore + all.result)}</span>
          <span className="m-foot">Startsaldo {formatNok(project.opening_balance_ore, { short: true })} + alle poster</span>
        </div>
      </div>

      <div className="card flush">
        <div style={{ padding: '14px 16px' }}>
          <TxFilters filter={filter} onChange={setFilter} grouping={grouping} onGrouping={setGrouping} months={months} />
        </div>
        {transactions.length === 0 ? (
          <Empty
            icon={<Receipt size={24} />}
            title="Ingen poster ennå"
            action={
              <button type="button" className="btn primary" onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden="true" /> Registrer den første
              </button>
            }
          >
            Registrer utgifter, inntekter og lønn. Postene havner automatisk i riktig måned.
          </Empty>
        ) : shown.length === 0 ? (
          <Empty icon={<Receipt size={24} />} title="Ingen treff">
            Prøv å endre filtrene.
          </Empty>
        ) : (
          <TxTable txs={shown} grouping={grouping} onOpen={setEditing} />
        )}
      </div>

      <TransactionDialog
        open={creating || editing !== null}
        tx={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </Page>
  );
}
