import { Copy, Crown, LogOut, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { currentAppUrl } from '../../config';
import { cancelInvitation, deleteProject, inviteMember, removeMember, setMemberRole, updateMember, updateMyName, updateProject } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { setLastProject } from '../../lib/lastProject';
import { formatNok, oreToInput, parseNok } from '../../lib/money';
import { getTheme, setTheme, type ThemeChoice } from '../../lib/theme';
import { ROLE_LABEL, type Person } from '../../lib/types';
import { useAuth } from '../../state/auth';
import { useProject } from '../../state/project';
import { useToast } from '../../state/toast';
import { Avatar, Notice, Segmented } from '../components/common';
import { Page } from '../Layout';

export function SettingsPage() {
  const { isOwner } = useProject();
  return (
    <Page title="Prosjekt og medlemmer">
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <ProjectSection />
          <MembersSection />
        </div>
        <div className="stack">
          <InviteSection />
          <ProfileSection />
          <DangerSection isOwner={isOwner} />
        </div>
      </div>
    </Page>
  );
}

function ProjectSection() {
  const { project, isOwner, reload } = useProject();
  const toast = useToast();
  const [name, setName] = useState(project.name);
  const [opening, setOpening] = useState(oreToInput(project.opening_balance_ore));
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ore = parseNok(opening);
    if (!name.trim()) return toast.error('Prosjektet må ha et navn.');
    if (ore === null) return toast.error('Startsaldoen ser ikke ut som et beløp.');
    setBusy(true);
    try {
      await updateProject(project.id, { name: name.trim(), opening_balance_ore: ore });
      await reload();
      toast.ok('Prosjektet er oppdatert.');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="proj-h">
      <div className="card-head">
        <h2 id="proj-h">Prosjekt</h2>
        {!isOwner && <span className="badge">Bare eiere kan endre</span>}
      </div>
      <form className="stack-sm" onSubmit={save}>
        <label className="field">
          <span>Navn</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} maxLength={120} />
        </label>
        <label className="field">
          <span>Startsaldo (NOK)</span>
          <input className="input amount" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} disabled={!isOwner} />
          <span className="hint">
            Pengene prosjektet hadde før første registrerte post. Brukes til å regne ut saldo per måned. Nå: {formatNok(project.opening_balance_ore)}.
          </span>
        </label>
        {isOwner && (
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Lagrer …' : 'Lagre'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

function MembersSection() {
  const { people, isOwner, project, reload } = useProject();
  const { userId } = useAuth();
  const toast = useToast();

  const run = async (fn: () => Promise<void>, message: string) => {
    try {
      await fn();
      await reload();
      toast.ok(message);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <section className="card" aria-labelledby="mem-h">
      <div className="card-head">
        <h2 id="mem-h">Medlemmer ({people.length})</h2>
      </div>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Ansvarsområder viser hvem som følger opp oppgaver og økonomi. Alle medlemmer kan registrere og endre oppgaver og poster.
      </p>
      <ul className="list">
        {people.map((p) => (
          <MemberRow
            key={p.user_id}
            person={p}
            isMe={p.user_id === userId}
            canEdit={isOwner || p.user_id === userId}
            isOwner={isOwner}
            onToggle={(patch) => run(() => updateMember(project.id, p.user_id, patch), 'Ansvar er oppdatert.')}
            onRole={(role) => run(() => setMemberRole(project.id, p.user_id, role), role === 'owner' ? `${p.name} er nå eier.` : `${p.name} er nå medlem.`)}
            onRemove={() => run(() => removeMember(project.id, p.user_id), `${p.name} er fjernet fra prosjektet.`)}
          />
        ))}
      </ul>
    </section>
  );
}

function MemberRow({
  person,
  isMe,
  canEdit,
  isOwner,
  onToggle,
  onRole,
  onRemove,
}: {
  person: Person;
  isMe: boolean;
  canEdit: boolean;
  isOwner: boolean;
  onToggle: (patch: { handles_tasks?: boolean; handles_finance?: boolean }) => void;
  onRole: (role: Person['role']) => void;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="list-item" style={{ flexWrap: 'wrap' }}>
      <Avatar id={person.user_id} name={person.name} large />
      <div className="li-main">
        <div className="li-title">
          {person.name} {isMe && <span className="subtle small">(deg)</span>}
        </div>
        <div className="li-sub">{person.email}</div>
      </div>
      <span className={`badge ${person.role === 'owner' ? 'accent' : ''}`}>{ROLE_LABEL[person.role]}</span>
      <div className="row wrap" style={{ width: '100%', paddingLeft: 52, gap: '4px 16px' }}>
        <label className="check small">
          <input type="checkbox" checked={person.handles_tasks} disabled={!canEdit} onChange={(e) => onToggle({ handles_tasks: e.target.checked })} />
          Ansvar for oppgaver
        </label>
        <label className="check small">
          <input type="checkbox" checked={person.handles_finance} disabled={!canEdit} onChange={(e) => onToggle({ handles_finance: e.target.checked })} />
          Ansvar for økonomi
        </label>
        {isOwner && !isMe && (
          <span className="row tight" style={{ marginLeft: 'auto' }}>
            <button type="button" className="btn ghost small" onClick={() => onRole(person.role === 'owner' ? 'member' : 'owner')}>
              <Crown size={15} aria-hidden="true" /> {person.role === 'owner' ? 'Gjør til medlem' : 'Gjør til eier'}
            </button>
            {confirm ? (
              <>
                <button type="button" className="btn danger small" onClick={onRemove}>
                  Fjern
                </button>
                <button type="button" className="btn ghost small" onClick={() => setConfirm(false)}>
                  Avbryt
                </button>
              </>
            ) : (
              <button type="button" className="btn ghost small" onClick={() => setConfirm(true)} aria-label={`Fjern ${person.name}`}>
                <UserMinus size={15} aria-hidden="true" /> Fjern
              </button>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

function InviteSection() {
  const { project, invitations, people, reload } = useProject();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [tasks, setTasks] = useState(true);
  const [finance, setFinance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appUrl = currentAppUrl();

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setError('Skriv inn en gyldig e-postadresse.');
    if (people.some((p) => p.email === mail)) return setError('Personen er allerede medlem.');
    setBusy(true);
    setError(null);
    try {
      await inviteMember(project.id, mail, { handles_tasks: tasks, handles_finance: finance });
      await reload();
      setEmail('');
      toast.ok(`${mail} er invitert.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (mail: string) => {
    const text = `Hei! Jeg har invitert deg til «${project.name}» i Prosjektpanel. Opprett konto eller logg inn med ${mail} her: ${appUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.ok('Invitasjonsteksten er kopiert.');
    } catch {
      window.prompt('Kopier teksten:', text);
    }
  };

  return (
    <section className="card" aria-labelledby="inv-h">
      <div className="card-head">
        <h2 id="inv-h">Inviter til prosjektet</h2>
      </div>
      <form className="stack-sm" onSubmit={invite} noValidate>
        <label className="field">
          <span>E-postadresse</span>
          <input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@eksempel.no" />
        </label>
        <div className="row wrap" style={{ gap: '0 16px' }}>
          <label className="check small">
            <input type="checkbox" checked={tasks} onChange={(e) => setTasks(e.target.checked)} /> Ansvar for oppgaver
          </label>
          <label className="check small">
            <input type="checkbox" checked={finance} onChange={(e) => setFinance(e.target.checked)} /> Ansvar for økonomi
          </label>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            <UserPlus size={16} aria-hidden="true" /> {busy ? 'Inviterer …' : 'Inviter'}
          </button>
        </div>
      </form>
      <p className="hint" style={{ marginTop: 8 }}>
        Den inviterte oppretter konto (eller logger inn) med samme e-postadresse, og ser invitasjonen under «Alle prosjekter». Del gjerne lenken:{' '}
        <a href={appUrl}>{appUrl}</a>
      </p>
      {invitations.length > 0 && (
        <>
          <h3 className="small" style={{ marginTop: 16 }}>
            Venter på svar
          </h3>
          <ul className="list">
            {invitations.map((i) => (
              <li key={i.id} className="list-item">
                <div className="li-main">
                  <div className="li-title">{i.email}</div>
                  <div className="li-sub">
                    Invitert {formatDate(i.created_at)} ·{' '}
                    {[i.handles_tasks && 'oppgaver', i.handles_finance && 'økonomi'].filter(Boolean).join(' og ') || 'uten ansvarsområde'}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn sm"
                  onClick={() => copy(i.email)}
                  aria-label={`Kopier invitasjonstekst til ${i.email}`}
                  title="Kopier invitasjonstekst"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={async () => {
                    try {
                      await cancelInvitation(i.id);
                      await reload();
                      toast.ok('Invitasjonen er trukket tilbake.');
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                >
                  Trekk tilbake
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ProfileSection() {
  const { profile, userId, email, refreshProfile, signOut } = useAuth();
  const { reload } = useProject();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme());

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Navnet kan ikke være tomt.');
    try {
      await updateMyName(userId, name.trim());
      await Promise.all([refreshProfile(), reload()]);
      toast.ok('Navnet er oppdatert.');
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <section className="card" aria-labelledby="me-h">
      <div className="card-head">
        <h2 id="me-h">Min profil</h2>
        <button type="button" className="btn ghost small" onClick={() => void signOut()}>
          <LogOut size={15} aria-hidden="true" /> Logg ut
        </button>
      </div>
      <form className="stack-sm" onSubmit={save}>
        <label className="field">
          <span>Navn som vises for andre</span>
          <div className="row tight">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <button type="submit" className="btn">
              Lagre
            </button>
          </div>
          <span className="hint">Logget inn som {email}</span>
        </label>
      </form>
      <div className="field" style={{ marginTop: 14 }}>
        <span>Utseende</span>
        <Segmented<ThemeChoice>
          label="Tema"
          value={theme}
          onChange={(v) => {
            setTheme(v);
            setThemeState(v);
            window.dispatchEvent(new Event('prosjektpanel:theme'));
          }}
          options={[
            { value: 'system', label: 'Følg systemet' },
            { value: 'light', label: 'Lys' },
            { value: 'dark', label: 'Mørk' },
          ]}
        />
      </div>
    </section>
  );
}

function DangerSection({ isOwner }: { isOwner: boolean }) {
  const { project } = useProject();
  const { userId } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const leave = async () => {
    try {
      await removeMember(project.id, userId);
      setLastProject(null);
      toast.ok('Du har forlatt prosjektet.');
      navigate('/prosjekter');
    } catch (e) {
      toast.error(e);
    }
  };

  const destroy = async () => {
    try {
      await deleteProject(project.id);
      setLastProject(null);
      toast.ok('Prosjektet er slettet.');
      navigate('/prosjekter');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <section className="card stack-sm" aria-labelledby="danger-h">
      <h2 id="danger-h">Forlat eller slett</h2>
      {confirmLeave ? (
        <div className="row tight wrap">
          <span className="small grow">Du mister tilgang til prosjektet. Oppgaver du har ansvar for blir stående uten ansvarlig.</span>
          <button type="button" className="btn danger small" onClick={leave}>
            Forlat
          </button>
          <button type="button" className="btn ghost small" onClick={() => setConfirmLeave(false)}>
            Avbryt
          </button>
        </div>
      ) : (
        <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmLeave(true)}>
          <LogOut size={15} aria-hidden="true" /> Forlat prosjektet
        </button>
      )}
      {isOwner && (
        <>
          <hr className="sep" />
          <Notice tone="warn">Sletting fjerner alle oppgaver, poster, budsjetter og medlemskap i prosjektet for alle. Det kan ikke angres.</Notice>
          <label className="field">
            <span>Skriv prosjektnavnet for å bekrefte</span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={project.name} />
          </label>
          <button type="button" className="btn danger" style={{ alignSelf: 'flex-start' }} disabled={confirmText !== project.name} onClick={destroy}>
            <Trash2 size={16} aria-hidden="true" /> Slett prosjektet
          </button>
        </>
      )}
    </section>
  );
}
