import { supabase } from './supabase';
import type { PropValue, TaskProperty, Category, CategoryScope, Invitation, Member, MonthBudget, Profile, Project, Task, Transaction } from './types';

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/* ----------------------------- Profil og prosjekter ----------------------------- */

export async function getMyProfile(userId: string): Promise<Profile | null> {
  return check(await supabase().from('profiles').select('id, display_name, email').eq('id', userId).maybeSingle());
}

export async function updateMyName(userId: string, display_name: string): Promise<void> {
  check(await supabase().from('profiles').update({ display_name }).eq('id', userId));
}

export async function listProjects(): Promise<Project[]> {
  return check(await supabase().from('projects').select('id, name, opening_balance_ore, created_at').order('created_at'));
}

export async function createProject(name: string, openingBalanceOre = 0): Promise<string> {
  return check(await supabase().rpc('create_project', { p_name: name, p_opening_balance_ore: openingBalanceOre })) as string;
}

export async function updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'opening_balance_ore'>>): Promise<void> {
  const rows = check(await supabase().from('projects').update(patch).eq('id', id).select('id'));
  if (!rows.length) throw new Error('Bare prosjekteiere kan endre prosjektet.');
}

export async function deleteProject(id: string): Promise<void> {
  const rows = check(await supabase().from('projects').delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error('Bare prosjekteiere kan slette prosjektet.');
}

/* ----------------------------- Medlemmer og invitasjoner ----------------------------- */

export interface ProjectData {
  project: Project;
  members: Member[];
  profiles: Profile[];
  invitations: Invitation[];
  tasks: Task[];
  transactions: Transaction[];
  budgets: MonthBudget[];
  categories: Category[];
  properties: TaskProperty[];
}

export async function loadProject(id: string): Promise<ProjectData | null> {
  const db = supabase();
  const [project, members, invitations, tasks, transactions, budgets, categories, properties] = await Promise.all([
    db.from('projects').select('id, name, opening_balance_ore, created_at').eq('id', id).maybeSingle(),
    db.from('project_members').select('*').eq('project_id', id),
    db.from('project_invitations').select('*').eq('project_id', id).order('created_at'),
    db.from('tasks').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    db.from('transactions').select('*').eq('project_id', id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
    db.from('month_budgets').select('project_id, month, budget_ore').eq('project_id', id),
    db.from('categories').select('project_id, scope, name, color').eq('project_id', id).order('name'),
    db.from('task_properties').select('id, project_id, name, type, options, position').eq('project_id', id).order('position').order('created_at'),
  ]);
  const p = check(project);
  if (!p) return null;
  const m = check(members) as Member[];
  const profiles = m.length
    ? (check(
        await db
          .from('profiles')
          .select('id, display_name, email')
          .in(
            'id',
            m.map((x) => x.user_id),
          ),
      ) as Profile[])
    : [];
  return {
    project: p as Project,
    members: m,
    profiles,
    invitations: check(invitations) as Invitation[],
    tasks: check(tasks) as Task[],
    transactions: (check(transactions) as Transaction[]).map((t) => ({ ...t, amount_ore: Number(t.amount_ore) })),
    budgets: (check(budgets) as MonthBudget[]).map((b) => ({ ...b, budget_ore: Number(b.budget_ore) })),
    categories: check(categories) as Category[],
    properties: check(properties) as TaskProperty[],
  };
}

export async function updateMember(projectId: string, userId: string, patch: Partial<Pick<Member, 'handles_tasks' | 'handles_finance'>>): Promise<void> {
  const rows = check(await supabase().from('project_members').update(patch).eq('project_id', projectId).eq('user_id', userId).select('user_id'));
  if (!rows.length) throw new Error('Du kan bare endre ditt eget ansvar, med mindre du er eier.');
}

export async function setMemberRole(projectId: string, userId: string, role: Member['role']): Promise<void> {
  check(await supabase().rpc('set_member_role', { p_project: projectId, p_user: userId, p_role: role }));
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  check(await supabase().rpc('remove_member', { p_project: projectId, p_user: userId }));
}

export async function inviteMember(projectId: string, email: string, handles: { handles_tasks: boolean; handles_finance: boolean }): Promise<void> {
  check(
    await supabase()
      .from('project_invitations')
      .insert({ project_id: projectId, email: email.trim().toLowerCase(), ...handles }),
  );
}

export async function cancelInvitation(id: string): Promise<void> {
  check(await supabase().from('project_invitations').delete().eq('id', id));
}

export interface MyInvitation {
  id: string;
  project_id: string;
  project_name: string;
  invited_by_name: string | null;
  created_at: string;
}

/** Invitasjoner til min bekreftede e-postadresse, med prosjektnavn og avsender. */
export async function myInvitations(): Promise<MyInvitation[]> {
  return check(await supabase().rpc('my_invitations')) as MyInvitation[];
}

export async function acceptInvitation(id: string): Promise<string> {
  return check(await supabase().rpc('accept_invitation', { p_invitation: id })) as string;
}

/* ----------------------------- Oppgaver ----------------------------- */

export type TaskInput = Pick<Task, 'title' | 'description' | 'due_date' | 'category' | 'assignee_id' | 'kind' | 'status'>;

export async function createTask(projectId: string, input: TaskInput): Promise<void> {
  check(
    await supabase()
      .from('tasks')
      .insert({ project_id: projectId, ...input }),
  );
}

export async function updateTask(id: string, patch: Partial<TaskInput>): Promise<void> {
  check(await supabase().from('tasks').update(patch).eq('id', id));
}

export async function deleteTask(id: string): Promise<void> {
  check(await supabase().from('tasks').delete().eq('id', id));
}

/* ----------------------------- Økonomi ----------------------------- */

export type TransactionInput = Pick<Transaction, 'name' | 'amount_ore' | 'occurred_on' | 'type' | 'category' | 'person_id' | 'note'>;

export async function createTransaction(projectId: string, input: TransactionInput): Promise<void> {
  check(
    await supabase()
      .from('transactions')
      .insert({ project_id: projectId, ...input }),
  );
}

export async function updateTransaction(id: string, patch: Partial<TransactionInput>): Promise<void> {
  check(await supabase().from('transactions').update(patch).eq('id', id));
}

export async function deleteTransaction(id: string): Promise<void> {
  check(await supabase().from('transactions').delete().eq('id', id));
}

export async function setBudget(projectId: string, month: string, budgetOre: number | null): Promise<void> {
  const db = supabase().from('month_budgets');
  if (budgetOre === null) check(await db.delete().eq('project_id', projectId).eq('month', month));
  else check(await db.upsert({ project_id: projectId, month, budget_ore: budgetOre }, { onConflict: 'project_id,month' }));
}

/* ----------------------------- Kategorier ----------------------------- */

export async function setCategoryColor(projectId: string, scope: CategoryScope, name: string, color: number): Promise<void> {
  check(await supabase().from('categories').update({ color }).eq('project_id', projectId).eq('scope', scope).eq('name', name));
}

/** Nytt navn på en kategori i hele prosjektet (oppdaterer alle oppgaver eller poster som bruker den). */
export async function renameCategory(projectId: string, scope: CategoryScope, oldName: string, newName: string): Promise<void> {
  check(await supabase().rpc('rename_category', { p_project: projectId, p_scope: scope, p_old: oldName, p_new: newName }));
}

/* ----------------------------- Egendefinerte egenskaper ----------------------------- */

export async function createProperty(projectId: string, input: Pick<TaskProperty, 'name' | 'type' | 'position'>): Promise<TaskProperty> {
  return check(
    await supabase()
      .from('task_properties')
      .insert({ project_id: projectId, options: [], ...input })
      .select()
      .single(),
  ) as TaskProperty;
}

export async function updateProperty(id: string, patch: Partial<Pick<TaskProperty, 'name' | 'options' | 'position'>>): Promise<void> {
  check(await supabase().from('task_properties').update(patch).eq('id', id));
}

export async function deleteProperty(id: string): Promise<void> {
  check(await supabase().rpc('delete_task_property', { p_property: id }));
}

export async function setTaskProperty(taskId: string, propertyId: string, value: PropValue): Promise<void> {
  check(await supabase().rpc('set_task_property', { p_task: taskId, p_property: propertyId, p_value: value }));
}
