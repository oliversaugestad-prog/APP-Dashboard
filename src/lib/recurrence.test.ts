import { describeRule, nextOccurrence, occurrencesBetween, type RepeatRule } from './recurrence';

const r = (p: Partial<RepeatRule>): RepeatRule => ({ freq: null, interval: 1, weekdays: [], until: null, ...p });

// Samme tilfeller som i supabase/tests/rls_test.sql, så appen og databasen er enige.
describe('nextOccurrence', () => {
  it('daglig og ukentlig', () => {
    expect(nextOccurrence('2026-09-27', r({ freq: 'daily' }))).toBe('2026-09-28');
    expect(nextOccurrence('2026-09-27', r({ freq: 'daily', interval: 3 }))).toBe('2026-09-30');
    expect(nextOccurrence('2026-09-27', r({ freq: 'weekly' }))).toBe('2026-10-04');
    expect(nextOccurrence('2026-09-28', r({ freq: 'weekly', weekdays: [1, 3] }))).toBe('2026-09-30');
    expect(nextOccurrence('2026-09-30', r({ freq: 'weekly', weekdays: [1, 3] }))).toBe('2026-10-05');
    expect(nextOccurrence('2026-09-30', r({ freq: 'weekly', interval: 2, weekdays: [1, 3] }), '2026-09-28')).toBe('2026-10-12');
  });
  it('månedlig og årlig uten å gli ved månedsslutt', () => {
    expect(nextOccurrence('2026-01-31', r({ freq: 'monthly' }))).toBe('2026-02-28');
    expect(nextOccurrence('2026-02-28', r({ freq: 'monthly' }), '2026-01-31')).toBe('2026-03-31');
    expect(nextOccurrence('2026-09-27', r({ freq: 'yearly' }))).toBe('2027-09-27');
  });
  it('stopper ved til-dato og uten regel', () => {
    expect(nextOccurrence('2026-09-27', r({ freq: 'daily', until: '2026-09-27' }))).toBeNull();
    expect(nextOccurrence('2026-09-27', r({}))).toBeNull();
  });
});

describe('occurrencesBetween', () => {
  it('lister forekomster i et vindu', () => {
    expect(occurrencesBetween('2026-09-28', r({ freq: 'weekly', weekdays: [1, 4] }), '2026-09-28', '2026-10-11')).toEqual([
      '2026-09-28',
      '2026-10-01',
      '2026-10-05',
      '2026-10-08',
    ]);
    expect(occurrencesBetween('2026-09-01', r({ freq: 'daily', interval: 10 }), '2026-09-15', '2026-10-01')).toEqual(['2026-09-21', '2026-10-01']);
    expect(occurrencesBetween('2026-09-01', r({}), '2026-09-01', '2026-09-30')).toEqual(['2026-09-01']);
  });
});

describe('describeRule', () => {
  it('beskriver regelen på norsk', () => {
    expect(describeRule(r({ freq: 'daily' }))).toBe('Hver dag');
    expect(describeRule(r({ freq: 'weekly', weekdays: [1, 3] }))).toBe('Hver uke (man, ons)');
    expect(describeRule(r({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }))).toBe('Hver uke (hverdager)');
    expect(describeRule(r({ freq: 'monthly', interval: 2 }))).toBe('Hver 2. måned');
    expect(describeRule(r({ freq: 'yearly', until: '2027-12-01' }))).toBe('Hvert år til 1.12.27');
  });
});
