import { describeRule, isoWeekday, type RepeatFreq, type RepeatRule } from '../../lib/recurrence';

const FREQS: { value: RepeatFreq | ''; label: string }[] = [
  { value: '', label: 'Gjentas ikke' },
  { value: 'daily', label: 'Daglig' },
  { value: 'weekly', label: 'Ukentlig' },
  { value: 'monthly', label: 'Månedlig' },
  { value: 'yearly', label: 'Årlig' },
];
const UNIT: Record<RepeatFreq, string> = { daily: 'dag', weekly: 'uke', monthly: 'måned', yearly: 'år' };
const DAYS = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];
const DAY_NAMES = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];

/** Velg gjentakelse: hyppighet, hver N-te, ukedager og til-dato. */
export function RepeatEditor({ rule, onChange, startDate }: { rule: RepeatRule; onChange: (r: RepeatRule) => void; startDate?: string | null }) {
  const set = (patch: Partial<RepeatRule>) => onChange({ ...rule, ...patch });
  return (
    <div className="stack-sm">
      <div className="row tight wrap">
        <select
          className="select sm"
          aria-label="Gjentakelse"
          style={{ width: 'auto' }}
          value={rule.freq ?? ''}
          onChange={(e) => {
            const freq = (e.target.value || null) as RepeatFreq | null;
            // Ukentlig starter på samme ukedag som datoen, så valget stemmer med det man ser.
            const weekdays = freq === 'weekly' && !rule.weekdays.length && startDate ? [isoWeekday(startDate)] : rule.weekdays;
            set({ freq, weekdays });
          }}
        >
          {FREQS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {rule.freq && (
          <label className="row tight small">
            hver
            <input
              className="input sm"
              type="number"
              min={1}
              max={99}
              aria-label="Intervall"
              style={{ width: 64 }}
              value={rule.interval}
              onChange={(e) => set({ interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })}
            />
            {UNIT[rule.freq]}
            {rule.interval > 1 ? (rule.freq === 'daily' ? 'er' : rule.freq === 'weekly' ? 'r' : rule.freq === 'monthly' ? 'er' : '') : ''}
          </label>
        )}
      </div>
      {rule.freq === 'weekly' && (
        <div className="row tight" role="group" aria-label="Ukedager">
          {DAYS.map((d, i) => {
            const on = rule.weekdays.includes(i + 1);
            return (
              <button
                key={i}
                type="button"
                className={`weekday-btn ${on ? 'on' : ''}`}
                aria-pressed={on}
                aria-label={DAY_NAMES[i]}
                onClick={() => set({ weekdays: on ? rule.weekdays.filter((x) => x !== i + 1) : [...rule.weekdays, i + 1] })}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
      {rule.freq && (
        <label className="row tight small">
          Til og med
          <input
            className="input sm"
            type="date"
            aria-label="Gjentas til"
            style={{ width: 'auto' }}
            value={rule.until ?? ''}
            onChange={(e) => set({ until: e.target.value || null })}
          />
          <span className="hint">{rule.until ? '' : '(ingen sluttdato)'}</span>
        </label>
      )}
      {rule.freq && <span className="hint">{describeRule(rule)}</span>}
    </div>
  );
}
