import { convertMinor, rateToBase, type RateSeries } from './fx';
import type { MonthBudget, Transaction } from './types';

export interface CurrencyPlan {
  opening: number;
  tx: { id: string; amount: number; rate: number; fx_date: string }[];
  budgets: { month: string; amount: number }[];
}

/** Valutaene vi trenger kurser for, og tidsrommet, når regnskapsvalutaen byttes. */
export function ratesNeeded(input: { from: string; to: string; transactions: Transaction[]; budgets: MonthBudget[]; today: string }) {
  const symbols = new Set<string>([input.from]);
  const dates = [input.today];
  for (const t of input.transactions) {
    symbols.add(t.orig_currency);
    dates.push(t.occurred_on);
  }
  for (const b of input.budgets) dates.push(b.month);
  symbols.delete(input.to);
  dates.sort();
  return { symbols: [...symbols], start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Nye beløp når regnskapsvalutaen byttes fra `from` til `to`.
 *
 *   poster       originalbeløpet regnes om med kursen på postens dato — en post
 *                registrert i den nye valutaen får originalbeløpet tilbake uendret
 *   budsjetter   gammel valuta -> ny med kursen den 1. i måneden
 *   startsaldo   gammel valuta -> ny med dagens kurs
 *
 * `series` har `to` som grunnlag (se fetchSeries). Kaster når en kurs mangler.
 */
export function planCurrencyChange(input: {
  from: string;
  to: string;
  opening: number;
  transactions: Transaction[];
  budgets: MonthBudget[];
  series: RateSeries;
  today: string;
}): CurrencyPlan {
  const { from, to, series } = input;
  const need = (cur: string, date: string) => {
    const r = rateToBase(series, cur, to, date);
    if (!r) throw new Error(`Fant ingen kurs fra ${cur} til ${to} for ${date}.`);
    return r;
  };
  const tx = input.transactions.map((t) => {
    if (t.orig_currency === to) return { id: t.id, amount: t.orig_amount, rate: 1, fx_date: t.occurred_on };
    const r = need(t.orig_currency, t.occurred_on);
    return { id: t.id, amount: Math.max(1, convertMinor(t.orig_amount, r.rate)), rate: r.rate, fx_date: r.date };
  });
  const budgets = input.budgets.map((b) => ({ month: b.month, amount: from === to ? b.budget_ore : convertMinor(b.budget_ore, need(from, b.month).rate) }));
  const opening = from === to ? input.opening : convertMinor(input.opening, need(from, input.today).rate);
  return { opening, tx, budgets };
}
