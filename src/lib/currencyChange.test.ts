import { planCurrencyChange, ratesNeeded } from './currencyChange';
import type { Transaction } from './types';

const tx = (p: Partial<Transaction>): Transaction =>
  ({
    id: 'x',
    project_id: 'p',
    name: '',
    amount_ore: 0,
    occurred_on: '2026-09-15',
    month: '2026-09-01',
    type: 'expense',
    category: '',
    person_id: null,
    note: '',
    orig_currency: 'NOK',
    orig_amount: 10000,
    fx_rate: 1,
    fx_date: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    ...p,
  }) as Transaction;

// Grunnlag DKK: enheter valuta per 1 DKK.
const series = {
  '2026-09-01': { NOK: 1.55, EUR: 0.134 },
  '2026-09-15': { NOK: 1.6, EUR: 0.1341 },
  '2026-10-01': { NOK: 1.5, EUR: 0.134 },
};

describe('bytte regnskapsvaluta', () => {
  it('finner valutaer og tidsrom som trengs', () => {
    const need = ratesNeeded({
      from: 'NOK',
      to: 'DKK',
      transactions: [tx({ orig_currency: 'EUR', occurred_on: '2026-08-20' }), tx({ orig_currency: 'DKK' })],
      budgets: [{ project_id: 'p', month: '2026-09-01', budget_ore: 1 }],
      today: '2026-10-02',
    });
    expect(need.symbols.sort()).toEqual(['EUR', 'NOK']);
    expect([need.start, need.end]).toEqual(['2026-08-20', '2026-10-02']);
  });

  it('regner om poster, budsjetter og startsaldo', () => {
    const plan = planCurrencyChange({
      from: 'NOK',
      to: 'DKK',
      opening: 150000,
      transactions: [
        tx({ id: 'a', orig_currency: 'NOK', orig_amount: 16000, occurred_on: '2026-09-15' }),
        tx({ id: 'b', orig_currency: 'DKK', orig_amount: 5000, amount_ore: 8000, occurred_on: '2026-09-16' }),
        tx({ id: 'c', orig_currency: 'EUR', orig_amount: 1341, occurred_on: '2026-09-20' }),
      ],
      budgets: [{ project_id: 'p', month: '2026-09-01', budget_ore: 155000 }],
      series,
      today: '2026-10-02',
    });
    expect(plan.tx).toEqual([
      { id: 'a', amount: 10000, rate: 1 / 1.6, fx_date: '2026-09-15' },
      { id: 'b', amount: 5000, rate: 1, fx_date: '2026-09-16' },
      { id: 'c', amount: 10000, rate: 1 / 0.1341, fx_date: '2026-09-15' },
    ]);
    expect(plan.budgets).toEqual([{ month: '2026-09-01', amount: 100000 }]);
    expect(plan.opening).toBe(100000);
  });

  it('feiler tydelig når en kurs mangler', () => {
    expect(() =>
      planCurrencyChange({ from: 'NOK', to: 'DKK', opening: 0, transactions: [tx({ orig_currency: 'USD' })], budgets: [], series, today: '2026-10-02' }),
    ).toThrow('Fant ingen kurs fra USD til DKK');
  });
});
