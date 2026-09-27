import { monthSummaries, personTotals, totals } from './finance';
import { formatNok, oreToInput, parseNok } from './money';
import { addMonths, formatMonth, monthOf } from './dates';
import type { Transaction } from './types';

let n = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'amount_ore' | 'type' | 'occurred_on'>): Transaction {
  return {
    id: String(++n),
    project_id: 'p',
    name: 'x',
    category: '',
    person_id: null,
    note: '',
    created_by: null,
    created_at: '',
    updated_at: '',
    month: monthOf(p.occurred_on),
    ...p,
  };
}

describe('money', () => {
  it('formaterer NOK', () => {
    expect(formatNok(123450)).toBe('1 234,50 kr');
    expect(formatNok(-99)).toBe('−0,99 kr');
    expect(formatNok(500, { sign: true })).toBe('+5,00 kr');
  });
  it('tolker beløp', () => {
    expect(parseNok('1 234,50')).toBe(123450);
    expect(parseNok('1234.5')).toBe(123450);
    expect(parseNok('1.234,50')).toBe(123450);
    expect(parseNok('1.234')).toBe(123400);
    expect(parseNok('12 500')).toBe(1250000);
    expect(parseNok('kr 99')).toBe(9900);
    expect(parseNok('0,1')).toBe(10);
    expect(parseNok('-20')).toBe(-2000);
    expect(parseNok('')).toBeNull();
    expect(parseNok('abc')).toBeNull();
    expect(parseNok('1,234,5')).toBeNull();
    expect(parseNok('1,999')).toBe(199900);
  });
  it('gjør øre om til redigerbar tekst og tilbake', () => {
    for (const v of [0, 5, 123450, 100]) expect(parseNok(oreToInput(v))).toBe(v);
  });
});

describe('dates', () => {
  it('flytter måneder over årsskifte', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });
  it('viser månedsnavn på norsk', () => {
    expect(formatMonth('2026-09-01')).toBe('September 2026');
  });
});

describe('monthSummaries', () => {
  const txs = [
    tx({ amount_ore: 2_000_000, type: 'income', occurred_on: '2026-09-01' }),
    tx({ amount_ore: 500_000, type: 'expense', occurred_on: '2026-09-10' }),
    tx({ amount_ore: 700_000, type: 'expense', occurred_on: '2026-09-30' }),
    tx({ amount_ore: 300_000, type: 'expense', occurred_on: '2026-11-02' }),
  ];
  const budgets = [
    { project_id: 'p', month: '2026-09-01', budget_ore: 1_000_000 },
    { project_id: 'p', month: '2026-10-01', budget_ore: 400_000 },
  ];
  const s = monthSummaries(txs, budgets, 100_000);

  it('tar med måneder med poster eller budsjett, sortert', () => {
    expect(s.map((m) => m.month)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
  });
  it('summerer inntekter, utgifter og resultat', () => {
    expect(s[0]).toMatchObject({ income: 2_000_000, expenses: 1_200_000, result: 800_000, count: 3 });
  });
  it('holder saldo og budsjett adskilt', () => {
    expect(s[0].startBalance).toBe(100_000);
    expect(s[0].endBalance).toBe(900_000);
    expect(s[1].startBalance).toBe(900_000);
    expect(s[2].startBalance).toBe(900_000);
    expect(s[2].endBalance).toBe(600_000);
  });
  it('viser overskredet budsjett', () => {
    expect(s[0].remaining).toBe(-200_000);
    expect(s[0].overBudget).toBe(true);
    expect(s[0].usedRatio).toBeCloseTo(1.2);
    expect(s[1]).toMatchObject({ remaining: 400_000, overBudget: false, usedRatio: 0 });
    expect(s[2]).toMatchObject({ budget: null, remaining: null, usedRatio: null, overBudget: false });
  });
  it('flytter posten til ny måned når datoen endres', () => {
    const moved = txs.map((t, i) => (i === 1 ? { ...t, occurred_on: '2026-10-05', month: monthOf('2026-10-05') } : t));
    const m = monthSummaries(moved, budgets, 0);
    expect(m[0].expenses).toBe(700_000);
    expect(m[1].expenses).toBe(500_000);
    expect(m[1].overBudget).toBe(true);
  });
  it('tar med ekstra måneder uten data', () => {
    expect(monthSummaries([], [], 5, ['2026-01-01'])[0]).toMatchObject({ startBalance: 5, endBalance: 5, count: 0 });
  });
});

describe('personTotals', () => {
  it('skiller betalt og mottatt per person', () => {
    const map = personTotals([
      tx({ amount_ore: 100, type: 'expense', occurred_on: '2026-09-01', person_id: 'a' }),
      tx({ amount_ore: 250, type: 'expense', occurred_on: '2026-09-02', person_id: 'a' }),
      tx({ amount_ore: 1000, type: 'income', occurred_on: '2026-09-02', person_id: 'a' }),
      tx({ amount_ore: 40, type: 'expense', occurred_on: '2026-09-03', person_id: null }),
    ]);
    expect(map.get('a')).toMatchObject({ paid: 350, received: 1000, expenseCount: 2, incomeCount: 1 });
    expect(map.get(null)).toMatchObject({ paid: 40, received: 0 });
    expect(totals([...map.values()].flatMap((p) => p.items))).toEqual({ income: 1000, expenses: 390, result: 610 });
  });
});
