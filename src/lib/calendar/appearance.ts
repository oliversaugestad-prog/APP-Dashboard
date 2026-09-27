/**
 * Hvordan en rad ser ut (portert fra StudyPath).
 *
 *   FYLL    kategorien: kategoriens pastell. Uten kategori: grått.
 *   KANT    hva slags rad det er: fire piksler i en mettet farge.
 *           Møte blå, arrangement fiolett, frist rød, arbeidsøkt grønn,
 *           oppgave korall, annet grå.
 *
 * De to palettene deler ingen farger, så kategori og type kan ikke forveksles.
 */
import { NEUTRAL_COLOR, type CalItemType } from './model';

export const EVENT_PALETTE = {
  red: '#e5484d',
  coral: '#ec6142',
  orange: '#f2801f',
  yellow: '#e3b341',
  green: '#46a758',
  blue: '#3e7bf0',
  purple: '#8e4ec6',
  grey: '#8b8d98',
} as const;

export const TYPE_BAR: Record<CalItemType, string> = {
  meeting: EVENT_PALETTE.blue,
  event: EVENT_PALETTE.purple,
  deadline: EVENT_PALETTE.red,
  work: EVENT_PALETTE.green,
  other: EVENT_PALETTE.grey,
  task: EVENT_PALETTE.coral,
};

export const TYPE_LABEL: Record<CalItemType, string> = {
  meeting: 'Møte',
  event: 'Arrangement',
  deadline: 'Frist',
  work: 'Arbeidsøkt',
  other: 'Annet',
  task: 'Oppgave',
};

/** Kategorifargene (samme rekkefølge som .tag-0 … .tag-7) som pasteller for fyll. */
export const CATEGORY_PASTEL = ['#8fb3f7', '#85cfa0', '#b89af0', '#f4b27a', '#f29aa0', '#7fd0d8', '#eea3cf', NEUTRAL_COLOR];

export type Emphasis = 'teaching' | 'fixed' | 'own';

export function emphasisFor(type: CalItemType | null | undefined): Emphasis {
  if (type === 'deadline' || type === 'event') return 'fixed';
  if (type === 'task' || type === 'work') return 'own';
  return 'teaching';
}

const TINT: Record<Emphasis, number> = { teaching: 30, fixed: 60, own: 18 };
const NEUTRAL_TINT: Record<Emphasis, number> = { teaching: 13, fixed: 22, own: 9 };

export function courseTint(color: string | null | undefined, strength = 32, base = 'var(--card)'): string {
  if (!color) return 'var(--surface-2)';
  return `color-mix(in oklab, ${color} ${strength}%, ${base})`;
}

export function courseInk(color?: string | null): string {
  if (!color || color === NEUTRAL_COLOR) return 'var(--foreground)';
  return `color-mix(in oklch, ${color} 32%, var(--foreground))`;
}

export function typeBarColor(type: CalItemType): string {
  return TYPE_BAR[type];
}

export type ChipSkin = {
  background: string;
  color: string;
  borderLeftWidth: number;
  borderLeftStyle: 'solid' | 'dashed';
  borderLeftColor: string;
};

export function chipSkin(color: string, emphasis: Emphasis, opts: { surface?: string; type?: CalItemType | null } = {}): ChipSkin {
  const { surface = 'var(--card)', type } = opts;
  const neutral = color === NEUTRAL_COLOR;
  return {
    background: courseTint(color, (neutral ? NEUTRAL_TINT : TINT)[emphasis], surface),
    color: courseInk(color),
    borderLeftWidth: 4,
    borderLeftStyle: 'solid',
    borderLeftColor: type ? typeBarColor(type) : color,
  };
}
