import type { MonthBudget, Transaction } from './types';

export interface MonthSummary {
  month: string;
  income: number;
  expenses: number;
  /** Inntekter minus utgifter i måneden. */
  result: number;
  /** Saldo ved inngangen til måneden: prosjektets startsaldo + resultatet i alle tidligere måneder. */
  startBalance: number;
  /** Startsaldo + inntekter − utgifter. */
  endBalance: number;
  budget: number | null;
  /** Budsjett − utgifter. Negativt betyr overskredet. Null uten budsjett. */
  remaining: number | null;
  /** Andel av budsjettet som er brukt (0–∞). Null uten budsjett eller når budsjettet er 0. */
  usedRatio: number | null;
  overBudget: boolean;
  count: number;
}

export function totals(txs: Transaction[]): { income: number; expenses: number; result: number } {
  let income = 0;
  let expenses = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount_ore;
    else expenses += t.amount_ore;
  }
  return { income, expenses, result: income - expenses };
}

/** Fortegnsbeløp: inntekt positiv, utgift negativ. */
export function signed(t: Pick<Transaction, 'type' | 'amount_ore'>): number {
  return t.type === 'income' ? t.amount_ore : -t.amount_ore;
}

/**
 * Lager ett sammendrag per måned. Tar med alle måneder som har poster eller budsjett,
 * pluss eventuelle ekstra måneder (f.eks. inneværende måned). Sortert eldst først.
 */
export function monthSummaries(txs: Transaction[], budgets: MonthBudget[], openingBalance: number, extraMonths: string[] = []): MonthSummary[] {
  const byMonth = new Map<string, Transaction[]>();
  for (const t of txs) {
    const list = byMonth.get(t.month) ?? [];
    list.push(t);
    byMonth.set(t.month, list);
  }
  const budgetBy = new Map(budgets.map((b) => [b.month, b.budget_ore]));
  const months = [...new Set([...byMonth.keys(), ...budgetBy.keys(), ...extraMonths])].sort();

  let balance = openingBalance;
  return months.map((month) => {
    const list = byMonth.get(month) ?? [];
    const { income, expenses, result } = totals(list);
    const budget = budgetBy.has(month) ? budgetBy.get(month)! : null;
    const remaining = budget === null ? null : budget - expenses;
    const summary: MonthSummary = {
      month,
      income,
      expenses,
      result,
      startBalance: balance,
      endBalance: balance + result,
      budget,
      remaining,
      usedRatio: budget ? expenses / budget : budget === 0 && expenses > 0 ? Infinity : budget === 0 ? 0 : null,
      overBudget: remaining !== null && remaining < 0,
      count: list.length,
    };
    balance += result;
    return summary;
  });
}

export interface PersonTotals {
  personId: string | null;
  paid: number;
  received: number;
  expenseCount: number;
  incomeCount: number;
  items: Transaction[];
}

/** Summer per person: hva de har betalt (utgifter) og mottatt (inntekter). */
export function personTotals(txs: Transaction[]): Map<string | null, PersonTotals> {
  const map = new Map<string | null, PersonTotals>();
  for (const t of txs) {
    const key = t.person_id;
    const p = map.get(key) ?? { personId: key, paid: 0, received: 0, expenseCount: 0, incomeCount: 0, items: [] };
    if (t.type === 'expense') {
      p.paid += t.amount_ore;
      p.expenseCount++;
    } else {
      p.received += t.amount_ore;
      p.incomeCount++;
    }
    p.items.push(t);
    map.set(key, p);
  }
  return map;
}

export interface Group<T> {
  key: string;
  label: string;
  items: T[];
}

export function groupBy<T>(items: T[], keyOf: (t: T) => string, labelOf: (key: string) => string): Group<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    const list = map.get(k) ?? [];
    list.push(it);
    map.set(k, list);
  }
  return [...map.entries()].map(([key, list]) => ({ key, label: labelOf(key), items: list })).sort((a, b) => a.label.localeCompare(b.label, 'nb'));
}
