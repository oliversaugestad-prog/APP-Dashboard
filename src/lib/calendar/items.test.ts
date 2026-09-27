import type { CalendarEvent, Task } from '../types';
import { buildItems, RECURRING_SOURCE, TASK_SOURCE } from './items';

const ev = (p: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e',
  project_id: 'p',
  title: 'Møte',
  description: '',
  location: '',
  category: '',
  type: 'meeting',
  start_date: '2026-09-28',
  end_date: '2026-09-28',
  start_time: '10:00:00',
  end_time: '11:30:00',
  person_id: null,
  repeat_freq: null,
  repeat_interval: 1,
  repeat_weekdays: [],
  repeat_until: null,
  created_by: null,
  created_at: '',
  ...p,
});

const task = (p: Partial<Task>): Task => ({
  id: 't',
  project_id: 'p',
  title: 'Oppgave',
  description: '',
  due_date: '2026-09-29',
  category: '',
  assignee_id: null,
  kind: 'task',
  status: 'not_started',
  completed_at: null,
  created_by: null,
  created_at: '',
  updated_at: '',
  custom: {},
  repeat_freq: null,
  repeat_interval: 1,
  repeat_weekdays: [],
  repeat_until: null,
  repeat_anchor: null,
  recurs_from: null,
  ...p,
});

const week = { from: '2026-09-28', to: '2026-10-04' };
const noColor = () => null;

describe('buildItems', () => {
  it('gjør en hendelse om til minutter', () => {
    const [item] = buildItems({ events: [ev({})], tasks: [] }, week, noColor);
    expect(item).toMatchObject({ startDate: '2026-09-28', startMin: 600, endMin: 690, allDay: false, editable: true });
  });
  it('viser gjentakende hendelser på hver forekomst, skrivebeskyttet', () => {
    const items = buildItems({ events: [ev({ repeat_freq: 'daily', repeat_interval: 2 })], tasks: [] }, week, noColor);
    expect(items.map((i) => i.startDate)).toEqual(['2026-09-28', '2026-09-30', '2026-10-02', '2026-10-04']);
    expect(items.every((i) => !i.editable)).toBe(true);
  });
  it('tar med en flerdagers hendelse som begynte før vinduet', () => {
    const items = buildItems(
      { events: [ev({ start_date: '2026-09-26', end_date: '2026-09-29', start_time: null, end_time: null })], tasks: [] },
      week,
      noColor,
    );
    expect(items[0]).toMatchObject({ startDate: '2026-09-26', endDate: '2026-09-29', allDay: true });
  });
  it('viser oppgaver på fristen og kommende forekomster av gjentakende', () => {
    const items = buildItems({ events: [], tasks: [task({ repeat_freq: 'weekly', repeat_weekdays: [2, 5] })] }, week, noColor);
    expect(items.map((i) => [i.startDate, i.sourceId])).toEqual([
      ['2026-09-29', TASK_SOURCE],
      ['2026-10-02', RECURRING_SOURCE],
    ]);
  });
  it('fullførte gjentakende oppgaver projiseres ikke, og ideer vises ikke', () => {
    const items = buildItems({ events: [], tasks: [task({ status: 'done', repeat_freq: 'daily' }), task({ id: 'i', kind: 'idea' })] }, week, noColor);
    expect(items).toHaveLength(1);
    expect(items[0].done).toBe(true);
  });
  it('fargelegger etter kategori', () => {
    const [item] = buildItems({ events: [ev({ category: 'Program' })], tasks: [] }, week, () => 0);
    expect(item.color).toBe('#8fb3f7');
  });
});
