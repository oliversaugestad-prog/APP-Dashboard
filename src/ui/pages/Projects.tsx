import { Check, FolderKanban, LogOut, Mail, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { acceptInvitation, cancelInvitation, createProject, listProjects, myInvitations, type MyInvitation } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { parseNok } from '../../lib/money';
import type { Project } from '../../lib/types';
import { useAuth } from '../../state/auth';
import { useToast } from '../../state/toast';
import { Empty, Notice } from '../components/common';
import { ThemeToggle } from '../Layout';

export function ProjectsPage() {
  const { email, profile, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [invites, setInvites] = useState<MyInvitation[]>([]);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([listProjects(), myInvitations()]);
      setProjects(p);
      setInvites(i);
    } catch (e) {
      toast.error(e);
      setProjects([]);
    }
  }, [toast]);

  useEffect(() => {
    document.title = 'Prosjekter · Prosjektpanel';
    void refresh();
  }, [refresh]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Gi prosjektet et navn.');
    const ore = opening.trim() ? parseNok(opening) : 0;
    if (ore === null) return setError('Startsaldoen ser ikke ut som et beløp.');
    setBusy(true);
    setError(null);
    try {
      const id = await createProject(name.trim(), ore);
      toast.ok('Prosjektet er opprettet.');
      navigate(`/p/${id}/oppgaver`);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  };

  const accept = async (inv: MyInvitation) => {
    try {
      const id = await acceptInvitation(inv.id);
      toast.ok(`Du er nå med i ${inv.project_name}.`);
      navigate(`/p/${id}/oppgaver`);
    } catch (e) {
      toast.error(e);
    }
  };

  const decline = async (inv: MyInvitation) => {
    try {
      await cancelInvitation(inv.id);
      toast.ok('Invitasjonen er avslått.');
      void refresh();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <main className="center-page stack" id="innhold">
      <header className="spread">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          Prosjektpanel
        </div>
        <div className="row tight">
          <ThemeToggle />
          <button type="button" className="btn ghost small" onClick={() => void signOut()}>
            <LogOut size={16} aria-hidden="true" /> Logg ut
          </button>
        </div>
      </header>
      <div>
        <h1>Hei{profile?.display_name ? `, ${profile.display_name}` : ''}!</h1>
        <p className="muted small">Logget inn som {email}</p>
      </div>

      {invites.length > 0 && (
        <section className="card stack-sm" aria-labelledby="inv-h">
          <h2 id="inv-h" className="row tight">
            <Mail size={18} aria-hidden="true" style={{ color: 'var(--accent)' }} /> Invitasjoner
          </h2>
          <ul className="list">
            {invites.map((inv) => (
              <li key={inv.id} className="list-item">
                <div className="li-main">
                  <div className="li-title">{inv.project_name}</div>
                  <div className="li-sub">
                    Invitert {inv.invited_by_name ? `av ${inv.invited_by_name} ` : ''}
                    {formatDate(inv.created_at)}
                  </div>
                </div>
                <button type="button" className="btn ghost small" onClick={() => decline(inv)} aria-label={`Avslå invitasjon til ${inv.project_name}`}>
                  <X size={16} aria-hidden="true" />
                  <span className="desktop-only">Avslå</span>
                </button>
                <button type="button" className="btn primary small" onClick={() => accept(inv)}>
                  <Check size={16} aria-hidden="true" /> Bli med
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack-sm" aria-labelledby="proj-h">
        <h2 id="proj-h">Mine prosjekter</h2>
        {projects === null ? (
          <p className="muted small" role="status">
            Laster …
          </p>
        ) : projects.length === 0 ? (
          <Empty icon={<FolderKanban size={24} />} title="Du er ikke med i noen prosjekter ennå">
            Opprett et prosjekt under, eller be noen invitere deg med e-postadressen {email}.
          </Empty>
        ) : (
          <ul className="list">
            {projects.map((p) => (
              <li key={p.id}>
                <Link to={`/p/${p.id}/oppgaver`} className="list-item" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <span className="brand-mark" aria-hidden="true" style={{ width: 36, height: 36 }}>
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="li-main">
                    <div className="li-title">{p.name}</div>
                    <div className="li-sub">Opprettet {formatDate(p.created_at)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="new-h">
        <h2 id="new-h" style={{ marginBottom: 12 }}>
          Nytt prosjekt
        </h2>
        <form className="stack-sm" onSubmit={create} noValidate>
          <div className="form-grid two">
            <label className="field">
              <span>Navn</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="F.eks. Sommerfest 2027" />
            </label>
            <label className="field">
              <span>Startsaldo (valgfritt)</span>
              <input className="input amount" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0,00" />
            </label>
          </div>
          <p className="hint">Startsaldo er pengene prosjektet har før dere registrerer poster. Den kan endres senere.</p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              <Plus size={16} aria-hidden="true" /> {busy ? 'Oppretter …' : 'Opprett prosjekt'}
            </button>
          </div>
        </form>
      </section>
      <Notice>Du blir eier av prosjekter du oppretter, og kan invitere andre fra prosjektets innstillinger.</Notice>
    </main>
  );
}
