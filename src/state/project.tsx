import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadProject, type ProjectData } from '../lib/api';
import type { Person } from '../lib/types';
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
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb'));
    return {
      ...data,
      people,
      personById,
      nameOf: (id) => (id ? (personById.get(id)?.name ?? 'Tidligere medlem') : ''),
      me,
      isOwner: me?.role === 'owner',
      taskCategories: uniq(data.tasks.map((t) => t.category)),
      financeCategories: uniq(data.transactions.map((t) => t.category)),
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
