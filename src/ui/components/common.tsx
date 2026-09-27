import { AlertTriangle, CheckCircle2, CircleAlert, Info, Lightbulb, ListTodo } from 'lucide-react';
import type { ReactNode } from 'react';
import { KIND_LABEL, STATUS_LABEL, type Person, type TaskKind, type TaskStatus } from '../../lib/types';

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children?: ReactNode; title?: ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'error' ? CircleAlert : tone === 'ok' ? CheckCircle2 : Info;
  return (
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden="true" />
      <div className="grow">
        {title && <p style={{ fontWeight: 600, marginBottom: children ? 2 : 0 }}>{title}</p>}
        {children && <div className="muted">{children}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <p style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</p>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const AVATAR_COLORS = ['#2563eb', '#0f8a5f', '#7c3aed', '#c2410c', '#be123c', '#0e7490', '#a21caf', '#4d7c0f'];

export function initials(name: string): string {
  return (
    name
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '•'
  );
}

export function Avatar({ id, name, large }: { id: string; name: string; large?: boolean }) {
  return (
    <span className={`avatar ${large ? 'lg' : ''}`} style={{ background: AVATAR_COLORS[hash(id) % AVATAR_COLORS.length] }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PersonName({ person, fallback = 'Ingen' }: { person: Person | null | undefined; fallback?: string }) {
  if (!person) return <span className="subtle">{fallback}</span>;
  return (
    <span className="person">
      <Avatar id={person.user_id} name={person.name} />
      <span>{person.name}</span>
    </span>
  );
}

/** Farget etikett; samme tekst får alltid samme farge. */
export function Tag({ label }: { label: string }) {
  if (!label) return <span className="subtle">–</span>;
  return <span className={`badge tag-${hash(label.toLowerCase()) % 8}`}>{label}</span>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge pill status-${status}`}>
      <span className="dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function KindBadge({ kind }: { kind: TaskKind }) {
  return kind === 'idea' ? (
    <span className="badge warn">
      <Lightbulb size={12} aria-hidden="true" /> {KIND_LABEL.idea}
    </span>
  ) : (
    <span className="badge accent">
      <ListTodo size={12} aria-hidden="true" /> {KIND_LABEL.task}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ ratio, label }: { ratio: number | null; label: string }) {
  if (ratio === null) return null;
  const pct = Number.isFinite(ratio) ? Math.min(100, Math.max(0, ratio * 100)) : 100;
  const cls = ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : '';
  return (
    <div className={`progress ${cls}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function percent(ratio: number | null): string {
  if (ratio === null) return '–';
  if (!Number.isFinite(ratio)) return '∞ %';
  return `${Math.round(ratio * 100)} %`;
}
