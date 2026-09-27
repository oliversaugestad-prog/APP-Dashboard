import { EMPTY_FILTER, filterTasks, isOverdue, sortTasks } from './tasks';
import type { Task } from './types';

function task(p: Partial<Task>): Task {
  return {
    id: Math.random().toString(),
    project_id: 'p',
    title: 'T',
    description: '',
    due_date: null,
    category: '',
    assignee_id: null,
    kind: 'task',
    status: 'not_started',
    completed_at: null,
    created_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '',
    custom: {},
    ...p,
  };
}

const NOW = '2026-09-27';
const tasks = [
  task({ title: 'Booke band', due_date: '2026-09-20', assignee_id: 'a', category: 'Program' }),
  task({ title: 'Plakat', due_date: '2026-10-01', assignee_id: 'b', status: 'in_progress', category: 'Markedsføring' }),
  task({ title: 'Fyrverkeri?', kind: 'idea' }),
  task({ title: 'Kjøpe kopper', due_date: '2026-09-01', assignee_id: 'a', status: 'done' }),
];

describe('filterTasks', () => {
  it('filtrerer på person, status, type, kategori og søk', () => {
    expect(filterTasks(tasks, { ...EMPTY_FILTER, assignee: 'a' }, NOW)).toHaveLength(2);
    expect(filterTasks(tasks, { ...EMPTY_FILTER, assignee: 'none' }, NOW).map((t) => t.title)).toEqual(['Fyrverkeri?']);
    expect(filterTasks(tasks, { ...EMPTY_FILTER, status: 'open' }, NOW)).toHaveLength(3);
    expect(filterTasks(tasks, { ...EMPTY_FILTER, kind: 'idea' }, NOW)).toHaveLength(1);
    expect(filterTasks(tasks, { ...EMPTY_FILTER, category: 'Program' }, NOW)).toHaveLength(1);
    expect(filterTasks(tasks, { ...EMPTY_FILTER, query: 'plak' }, NOW)).toHaveLength(1);
  });
  it('filtrerer på frist', () => {
    expect(filterTasks(tasks, { ...EMPTY_FILTER, due: 'overdue' }, NOW).map((t) => t.title)).toEqual(['Booke band']);
    expect(filterTasks(tasks, { ...EMPTY_FILTER, due: 'week' }, NOW).map((t) => t.title)).toEqual(['Plakat']);
    expect(filterTasks(tasks, { ...EMPTY_FILTER, due: 'none' }, NOW).map((t) => t.title)).toEqual(['Fyrverkeri?']);
  });
  it('fullførte oppgaver er aldri forfalt', () => {
    expect(isOverdue(tasks[3], NOW)).toBe(false);
  });
});

describe('sortTasks', () => {
  const names: Record<string, string> = { a: 'Åse', b: 'Bjørn' };
  const nameOf = (id: string | null) => (id ? names[id] : '');
  it('sorterer på frist med tomme sist i begge retninger', () => {
    expect(sortTasks(tasks, 'due', 1, nameOf).map((t) => t.title)).toEqual(['Kjøpe kopper', 'Booke band', 'Plakat', 'Fyrverkeri?']);
    expect(sortTasks(tasks, 'due', -1, nameOf).map((t) => t.title)).toEqual(['Plakat', 'Booke band', 'Kjøpe kopper', 'Fyrverkeri?']);
  });
  it('sorterer på person etter norsk alfabet', () => {
    expect(sortTasks(tasks, 'assignee', 1, nameOf).map((t) => t.assignee_id)).toEqual(['b', 'a', 'a', null]);
  });
  it('sorterer på status med pågående først', () => {
    expect(sortTasks(tasks, 'status', 1, nameOf)[0].title).toBe('Plakat');
  });
});
