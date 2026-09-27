import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { FilterToggle } from './FilterToggle';
import { formatMonth } from '../../lib/dates';
import type { Transaction, TxType } from '../../lib/types';
import { useProject } from '../../state/project';
import type { Grouping } from './TxTable';

export interface TxFilter {
  query: string;
  type: TxType | '';
  category: string;
  person: string; // '' = alle, 'none' = ingen person
  month: string;
}

export const EMPTY_TX_FILTER: TxFilter = { query: '', type: '', category: '', person: '', month: '' };

export function applyTxFilter(txs: Transaction[], f: TxFilter): Transaction[] {
  const q = f.query.trim().toLowerCase();
  return txs.filter(
    (t) =>
      (!f.type || t.type === f.type) &&
      (!f.category || t.category === (f.category === '__none' ? '' : f.category)) &&
      (!f.person || (f.person === 'none' ? t.person_id === null : t.person_id === f.person)) &&
      (!f.month || t.month === f.month) &&
      (!q || `${t.name} ${t.note} ${t.category}`.toLowerCase().includes(q)),
  );
}

export function TxFilters({
  filter,
  onChange,
  grouping,
  onGrouping,
  months,
}: {
  filter: TxFilter;
  onChange: (f: TxFilter) => void;
  grouping: Grouping;
  onGrouping: (g: Grouping) => void;
  months?: string[];
}) {
  const { people, financeCategories } = useProject();
  const set = <K extends keyof TxFilter>(k: K, v: TxFilter[K]) => onChange({ ...filter, [k]: v });
  const [open, setOpen] = useState(false);
  const activeCount = (['type', 'category', 'person', 'month'] as const).filter((k) => filter[k]).length + (grouping !== 'none' ? 1 : 0);
  const active = JSON.stringify(filter) !== JSON.stringify(EMPTY_TX_FILTER);
  return (
    <div className="toolbar">
      <label className="search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Søk</span>
        <input className="input sm" type="search" placeholder="Søk i poster" value={filter.query} onChange={(e) => set('query', e.target.value)} />
      </label>
      <FilterToggle open={open} onToggle={() => setOpen((o) => !o)} active={activeCount} />
      <div className={`filters ${open ? 'open' : ''}`}>
        <select className="select sm" aria-label="Type" value={filter.type} onChange={(e) => set('type', e.target.value as TxType | '')}>
          <option value="">Inntekter og utgifter</option>
          <option value="income">Bare inntekter</option>
          <option value="expense">Bare utgifter</option>
        </select>
        <select className="select sm" aria-label="Kategori" value={filter.category} onChange={(e) => set('category', e.target.value)}>
          <option value="">Alle kategorier</option>
          {financeCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__none">Uten kategori</option>
        </select>
        <select className="select sm" aria-label="Person" value={filter.person} onChange={(e) => set('person', e.target.value)}>
          <option value="">Alle personer</option>
          {people.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.name}
            </option>
          ))}
          <option value="none">Ingen person</option>
        </select>
        {months && (
          <select className="select sm" aria-label="Måned" value={filter.month} onChange={(e) => set('month', e.target.value)}>
            <option value="">Alle måneder</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        )}
        <select className="select sm" aria-label="Grupper etter" value={grouping} onChange={(e) => onGrouping(e.target.value as Grouping)}>
          <option value="none">Ingen gruppering</option>
          <option value="type">Grupper: type</option>
          <option value="category">Grupper: kategori</option>
          <option value="person">Grupper: person</option>
          {months && <option value="month">Grupper: måned</option>}
        </select>
        {active && (
          <button type="button" className="btn ghost small" onClick={() => onChange(EMPTY_TX_FILTER)}>
            <X size={15} aria-hidden="true" /> Nullstill
          </button>
        )}
      </div>
    </div>
  );
}
