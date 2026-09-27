import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string;
  k: K;
  sort: { key: K; dir: 1 | -1 };
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" data-active={active} onClick={() => onSort(k)}>
        {label}
        <Icon size={13} aria-hidden="true" style={{ opacity: active ? 1 : 0.45 }} />
      </button>
    </th>
  );
}
