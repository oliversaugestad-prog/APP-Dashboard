import { daysUntil, today } from './dates';
import type { Task, TaskKind, TaskStatus } from './types';

export type DueFilter = 'all' | 'overdue' | 'week' | 'month' | 'none';
export type TaskSortKey = 'due' | 'title' | 'status' | 'assignee' | 'category' | 'kind' | 'created';

export interface TaskFilter {
  assignee: string; // '' = alle, 'none' = uten ansvarlig, ellers bruker-id
  status: TaskStatus | '' | 'open';
  category: string;
  kind: TaskKind | '';
  due: DueFilter;
  query: string;
}

export const EMPTY_FILTER: TaskFilter = { assignee: '', status: '', category: '', kind: '', due: 'all', query: '' };

export function isOverdue(t: Task, now = today()): boolean {
  return t.status !== 'done' && !!t.due_date && t.due_date < now;
}

export function filterTasks(tasks: Task[], f: TaskFilter, now = today()): Task[] {
  const q = f.query.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.assignee === 'none' ? t.assignee_id !== null : f.assignee && t.assignee_id !== f.assignee) return false;
    if (f.status === 'open' ? t.status === 'done' : f.status && t.status !== f.status) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.kind && t.kind !== f.kind) return false;
    if (f.due !== 'all') {
      if (f.due === 'none') {
        if (t.due_date) return false;
      } else {
        if (!t.due_date) return false;
        const d = daysUntil(t.due_date, now);
        if (f.due === 'overdue' && !isOverdue(t, now)) return false;
        if (f.due === 'week' && (d < 0 || d > 7)) return false;
        if (f.due === 'month' && (d < 0 || d > 31)) return false;
      }
    }
    if (q && !`${t.title} ${t.description} ${t.category}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const STATUS_ORDER: Record<TaskStatus, number> = { in_progress: 0, not_started: 1, done: 2 };

export function sortTasks(tasks: Task[], key: TaskSortKey, dir: 1 | -1, nameOf: (id: string | null) => string): Task[] {
  const cmpStr = (a: string, b: string) => a.localeCompare(b, 'nb', { sensitivity: 'base' });
  const cmp = (a: Task, b: Task): number => {
    switch (key) {
      case 'due':
        // Oppgaver uten frist havner alltid sist.
        if (!a.due_date || !b.due_date) return a.due_date ? -dir : b.due_date ? dir : 0;
        return cmpStr(a.due_date, b.due_date);
      case 'title':
        return cmpStr(a.title, b.title);
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      case 'assignee':
        if (!a.assignee_id || !b.assignee_id) return a.assignee_id ? -dir : b.assignee_id ? dir : 0;
        return cmpStr(nameOf(a.assignee_id), nameOf(b.assignee_id));
      case 'category':
        if (!a.category || !b.category) return a.category ? -dir : b.category ? dir : 0;
        return cmpStr(a.category, b.category);
      case 'kind':
        return cmpStr(a.kind, b.kind);
      case 'created':
        return cmpStr(a.created_at, b.created_at);
    }
  };
  return [...tasks].sort((a, b) => cmp(a, b) * dir || cmpStr(b.created_at, a.created_at));
}
