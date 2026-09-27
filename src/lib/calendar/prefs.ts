/**
 * Kalenderens egne innstillinger: visning, skjulte kilder, sidepanelet.
 * I localStorage — valg som hører til skjermen du sitter ved, ikke kontoen.
 */
const KEY = 'prosjektpanel:cal:v1';

export type CalMode = 'day' | 'week' | 'month';

export type CalPrefs = {
  mode: CalMode;
  hidden: string[];
  railOpen: boolean;
};

export const DEFAULT_PREFS: CalPrefs = { mode: 'week', hidden: [], railOpen: true };

export function readPrefs(): CalPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<CalPrefs>;
    return {
      mode: parsed.mode === 'day' || parsed.mode === 'week' || parsed.mode === 'month' ? parsed.mode : DEFAULT_PREFS.mode,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((h) => typeof h === 'string') : [],
      railOpen: typeof parsed.railOpen === 'boolean' ? parsed.railOpen : DEFAULT_PREFS.railOpen,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(patch: Partial<CalPrefs>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    /* privat vindu, full disk — innstillingen er ikke verdt en feilmelding */
  }
}
