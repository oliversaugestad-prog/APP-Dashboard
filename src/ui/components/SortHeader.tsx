import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  className,
  icon,
}: {
  label: string;
  k: K;
  sort: { key: K; dir: 1 | -1 };
  onSort: (k: K) => void;
  className?: string;
  icon?: ReactNode;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-btn" data-active={active} onClick={() => onSort(k)}>
        {icon && (
          <span aria-hidden="true" style={{ display: 'inline-flex', opacity: 0.8 }}>
            {icon}
          </span>
        )}
        {label}
        <Icon size={13} aria-hidden="true" style={{ opacity: active ? 1 : 0.45 }} />
      </button>
    </th>
  );
}
