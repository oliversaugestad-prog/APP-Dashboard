export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'prosjektpanel:theme';

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* lagring kan være blokkert */
  }
  return 'system';
}

export function setTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* ignorer */
  }
}

/** Temaet som faktisk vises nå. */
export function effectiveTheme(choice: ThemeChoice = getTheme()): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
