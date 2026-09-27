import { StickyNote } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateShort, formatMonth, monthSlug } from '../../lib/dates';
import { groupBy, signed, totals, type Group } from '../../lib/finance';
import { formatNok } from '../../lib/money';
import { TYPE_LABEL, type Transaction } from '../../lib/types';
import { useProject } from '../../state/project';
import { PersonName, Tag } from './common';
import { SortHeader } from './SortHeader';

export type Grouping = 'none' | 'type' | 'category' | 'person' | 'month';
type SortKey = 'date' | 'name' | 'amount' | 'category' | 'person' | 'type';

export function Amount({ tx }: { tx: Pick<Transaction, 'type' | 'amount_ore'> }) {
  const v = signed(tx);
  return <span className={`num ${v > 0 ? 'pos' : ''}`}>{formatNok(v, { sign: v > 0 })}</span>;
}

export function TxTable({
  txs,
  grouping = 'none',
  onOpen,
  showMonth = true,
}: {
  txs: Transaction[];
  grouping?: Grouping;
  onOpen: (t: Transaction) => void;
  showMonth?: boolean;
}) {
  const { personById, nameOf, project } = useProject();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'date' || key === 'amount' ? -1 : 1 }));

  const sorted = useMemo(() => {
    const c = (a: string, b: string) => a.localeCompare(b, 'nb', { sensitivity: 'base' });
    const cmp = (a: Transaction, b: Transaction): number => {
      switch (sort.key) {
        case 'date':
          return c(a.occurred_on, b.occurred_on);
        case 'name':
          return c(a.name, b.name);
        case 'amount':
          return signed(a) - signed(b);
        case 'category':
          return c(a.category, b.category);
        case 'person':
          return c(nameOf(a.person_id), nameOf(b.person_id));
        case 'type':
          return c(a.type, b.type);
      }
    };
    return [...txs].sort((a, b) => cmp(a, b) * sort.dir || c(b.created_at, a.created_at));
  }, [txs, sort, nameOf]);

  const groups: Group<Transaction>[] = useMemo(() => {
    if (grouping === 'none') return [{ key: '', label: '', items: sorted }];
    const keyOf = (t: Transaction) =>
      grouping === 'type' ? t.type : grouping === 'category' ? t.category : grouping === 'person' ? (t.person_id ?? '') : t.month;
    const labelOf = (k: string) =>
      grouping === 'type'
        ? TYPE_LABEL[k as Transaction['type']]
        : grouping === 'category'
          ? k || 'Uten kategori'
          : grouping === 'person'
            ? k
              ? nameOf(k)
              : 'Ingen person'
            : formatMonth(k);
    const gs = groupBy(sorted, keyOf, labelOf);
    if (grouping === 'type') gs.sort((a) => (a.key === 'income' ? -1 : 1));
    if (grouping === 'month') gs.sort((a, b) => b.key.localeCompare(a.key));
    return gs;
  }, [sorted, grouping, nameOf]);

  const all = totals(txs);
  const cols = showMonth ? 8 : 7;

  return (
    <div className="table-wrap">
      <table className="table responsive nocheck">
        <thead>
          <tr>
            <SortHeader label="Navn" k="name" sort={sort} onSort={onSort} />
            <SortHeader label="Beløp" k="amount" sort={sort} onSort={onSort} className="r" />
            <SortHeader label="Type" k="type" sort={sort} onSort={onSort} />
            <SortHeader label="Dato" k="date" sort={sort} onSort={onSort} />
            <SortHeader label="Kategori" k="category" sort={sort} onSort={onSort} />
            {showMonth && <th>Måned</th>}
            <SortHeader label="Person" k="person" sort={sort} onSort={onSort} />
            <th className="wide-cell">Registrert av</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const gt = totals(g.items);
            return (
              <Fragment key={g.key || 'all'}>
                {grouping !== 'none' && (
                  <tr className="group-row">
                    <td colSpan={cols}>
                      <span className="spread">
                        <span>
                          {g.label} <span className="subtle">· {g.items.length}</span>
                        </span>
                        <span className="num">{formatNok(gt.result, { sign: gt.result > 0 })}</span>
                      </span>
                    </td>
                  </tr>
                )}
                {g.items.map((t) => (
                  <tr key={t.id}>
                    <td className="title-cell">
                      <button type="button" className="row-btn" onClick={() => onOpen(t)}>
                        {t.name}
                      </button>
                      {t.note && (
                        <StickyNote size={13} aria-label="Har notat" style={{ marginLeft: 6, color: 'var(--text-3)', verticalAlign: -1 }}>
                          <title>{t.note}</title>
                        </StickyNote>
                      )}
                    </td>
                    <td className="r m-end">
                      <Amount tx={t} />
                    </td>
                    <td className="desktop-cell">
                      <span className={`badge ${t.type === 'income' ? 'ok' : 'error'}`}>{TYPE_LABEL[t.type]}</span>
                    </td>
                    <td className="desktop-cell num">{formatDateShort(t.occurred_on)}</td>
                    <td className="desktop-cell">
                      <Tag label={t.category} scope="finance" />
                    </td>
                    {showMonth && (
                      <td className="desktop-cell">
                        <Link to={`/p/${project.id}/okonomi/maneder/${monthSlug(t.month)}`} className="small">
                          {formatMonth(t.month)}
                        </Link>
                      </td>
                    )}
                    <td className="desktop-cell">
                      <PersonName person={t.person_id ? personById.get(t.person_id) : null} fallback="–" />
                    </td>
                    <td className="desktop-cell wide-cell small muted">{nameOf(t.created_by) || '–'}</td>
                    <td className="m-sub mobile-meta">
                      <span className="num">{formatDateShort(t.occurred_on)}</span>
                      {t.category && <Tag label={t.category} scope="finance" />}
                      {t.person_id && (
                        <span>
                          {t.type === 'expense' ? 'Betalt av' : 'Mottatt av'} {nameOf(t.person_id)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Sum ({txs.length})</td>
            <td className="r num" colSpan={1}>
              <span className={all.result > 0 ? 'pos' : ''}>{formatNok(all.result, { sign: all.result > 0 })}</span>
            </td>
            <td className="desktop-cell small muted" colSpan={cols - 2}>
              Inntekter {formatNok(all.income)} · Utgifter {formatNok(all.expenses)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
