import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadProject, type ProjectData } from '../lib/api';
import { setDisplayCurrency } from '../lib/money';
import type { CategoryScope, Person } from '../lib/types';
import { useAuth } from './auth';

export interface ProjectState extends ProjectData {
  people: Person[];
  personById: Map<string, Person>;
  nameOf: (id: string | null) => string;
  me: Person | null;
  isOwner: boolean;
  /** Kategorier som allerede er brukt i prosjektet (til forslag i skjemaer). */
  taskCategories: string[];
  financeCategories: string[];
  /** Fargeindeks for en kategori. Kategorier som ikke er lagret ennå får en fast farge ut fra navnet. */
  colorOf: (scope: CategoryScope, name: string) => number;
  reload: () => Promise<void>;
}

const Ctx = createContext<ProjectState | null>(null);

type Load = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error'; message: string } | { kind: 'ready'; data: ProjectData };

export function useProjectLoader(projectId: string): { load: Load; reload: () => Promise<void> } {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const reload = useCallback(async () => {
    try {
      const data = await loadProject(projectId);
      setLoad(data ? { kind: 'ready', data } : { kind: 'missing' });
    } catch (e) {
      setLoad((prev) => (prev.kind === 'ready' ? prev : { kind: 'error', message: e instanceof Error ? e.message : String(e) }));
    }
  }, [projectId]);

  useEffect(() => {
    setLoad({ kind: 'loading' });
    void reload();
    // Hent ferske data når fanen blir synlig igjen, slik at endringer fra andre medlemmer vises.
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  return { load, reload };
}

export function ProjectProvider({ data, reload, children }: { data: ProjectData; reload: () => Promise<void>; children: ReactNode }) {
  const { userId } = useAuth();
  // Beløp i hele appen vises i prosjektets regnskapsvaluta.
  setDisplayCurrency(data.project.currency);
  const value = useMemo<ProjectState>(() => {
    const profileBy = new Map(data.profiles.map((p) => [p.id, p]));
    const people: Person[] = data.members
      .map((m) => {
        const p = profileBy.get(m.user_id);
        return { ...m, name: p?.display_name || p?.email || 'Ukjent', email: p?.email ?? '' };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
    const personById = new Map(people.map((p) => [p.user_id, p]));
    const me = personById.get(userId) ?? null;
    const colorBy = new Map(data.categories.map((c) => [`${c.scope}:${c.name}`, c.color]));
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
    return {
      ...data,
      people,
      personById,
      nameOf: (id) => (id ? (personById.get(id)?.name ?? 'Tidligere medlem') : ''),
      me,
      isOwner: me?.role === 'owner',
      taskCategories: uniq([...data.categories.filter((c) => c.scope === 'task').map((c) => c.name), ...data.tasks.map((t) => t.category)]),
      financeCategories: uniq([...data.categories.filter((c) => c.scope === 'finance').map((c) => c.name), ...data.transactions.map((t) => t.category)]),
      colorOf: (scope, name) => colorBy.get(`${scope}:${name}`) ?? hashColor(name),
      reload,
    };
  }, [data, reload, userId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProject utenfor ProjectProvider');
  return v;
}

export function hashColor(name: string): number {
  let h = 0;
  const s = name.toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 8;
}
