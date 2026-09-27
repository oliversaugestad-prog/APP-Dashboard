export type Role = 'owner' | 'member';
export type TaskKind = 'task' | 'idea';
export type TaskStatus = 'not_started' | 'in_progress' | 'done';
export type TxType = 'expense' | 'income';

export interface Profile {
  id: string;
  display_name: string;
  email: string;
}

export interface Project {
  id: string;
  name: string;
  opening_balance_ore: number;
  created_at: string;
}

export interface Member {
  project_id: string;
  user_id: string;
  role: Role;
  handles_tasks: boolean;
  handles_finance: boolean;
  joined_at: string;
}

/** Medlem med navn og e-post fra profilen. */
export interface Person extends Member {
  name: string;
  email: string;
}

export interface Invitation {
  id: string;
  project_id: string;
  email: string;
  handles_tasks: boolean;
  handles_finance: boolean;
  invited_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  category: string;
  assignee_id: string | null;
  kind: TaskKind;
  status: TaskStatus;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  project_id: string;
  name: string;
  amount_ore: number;
  occurred_on: string;
  /** Første dag i måneden posten tilhører (YYYY-MM-01), utledet av datoen i databasen. */
  month: string;
  type: TxType;
  category: string;
  person_id: string | null;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CategoryScope = 'task' | 'finance';

export interface Category {
  project_id: string;
  scope: CategoryScope;
  name: string;
  /** Fargeindeks 0–7 (se .tag-N i styles.css). */
  color: number;
}

export interface MonthBudget {
  project_id: string;
  month: string;
  budget_ore: number;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Ikke startet',
  in_progress: 'Pågår',
  done: 'Fullført',
};

export const KIND_LABEL: Record<TaskKind, string> = { task: 'Oppgave', idea: 'Idé' };
export const TYPE_LABEL: Record<TxType, string> = { expense: 'Utgift', income: 'Inntekt' };
export const ROLE_LABEL: Record<Role, string> = { owner: 'Eier', member: 'Medlem' };

export const EXPENSE_CATEGORIES = ['Produktkjøp', 'Abonnement', 'Transport', 'Lønn', 'Mat og drikke', 'Lokaler', 'Utstyr', 'Markedsføring', 'Annen utgift'];
export const INCOME_CATEGORIES = ['Salg', 'Billetter', 'Tilskudd og sponsor', 'Lønn', 'Annen inntekt'];
