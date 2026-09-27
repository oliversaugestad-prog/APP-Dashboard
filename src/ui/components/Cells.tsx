import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Tekst som kan redigeres direkte i tabellen: klikk for å endre, Enter lagrer, Esc avbryter. */
export function InlineText({
  value,
  onSave,
  label,
  placeholder = '',
  required = false,
  maxLength,
  className = '',
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v === value.trim() || (required && !v)) return;
    onSave(v);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        className="cell-input"
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={`cell-btn ${className}`}
      aria-label={`${label}: ${value || 'tom'}. Klikk for å endre`}
      title={value || undefined}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value ? <span className="cell-text">{value}</span> : <span className="subtle cell-placeholder">{placeholder}</span>}
    </button>
  );
}

/** Nedtrekksliste lagt usynlig over en visning (etikett, person osv.), slik at hele cellen kan klikkes. */
export function SelectCell<T extends string>({
  value,
  options,
  onChange,
  label,
  children,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="cell-select">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="cell-select-view" aria-hidden="true">
        {children}
      </span>
    </span>
  );
}

/** Dato som kan endres direkte: klikk åpner datovelgeren. */
export function DateCell({
  value,
  onChange,
  label,
  children,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="cell-date">
      <button
        type="button"
        className="cell-btn"
        aria-label={`${label}: ${value ?? 'ingen'}. Klikk for å endre`}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
      >
        {children}
      </button>
      <input ref={ref} type="date" tabIndex={-1} aria-hidden="true" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
    </span>
  );
}
