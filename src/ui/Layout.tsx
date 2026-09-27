import { CalendarRange, ChevronLeft, FolderKanban, ListTodo, Mail, Moon, Receipt, Settings, Sun, UserRoundCheck, Users, Wallet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { listProjects, myInvitations } from '../lib/api';
import { effectiveTheme, setTheme } from '../lib/theme';
import type { Project } from '../lib/types';
import { useAuth } from '../state/auth';
import { useProject } from '../state/project';
import { Avatar } from './components/common';

export function AppShell({ children }: { children: ReactNode }) {
  const { project } = useProject();
  const { profile, email } = useAuth();
  const base = `/p/${project.id}`;
  const [projects, setProjects] = useState<Project[]>([]);
  const [invites, setInvites] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => {});
    myInvitations()
      .then((i) => setInvites(i.length))
      .catch(() => {});
  }, [project.id]);

  return (
    <div className="app">
      <a className="skip-link" href="#innhold">
        Hopp til innhold
      </a>
      <aside className="sidebar" aria-label="Hovedmeny">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          Prosjektpanel
        </div>
        <label className="project-switch field">
          <span className="sr-only">Velg prosjekt</span>
          <select
            className="select"
            value={project.id}
            onChange={(e) => (e.target.value === '__all' ? navigate('/prosjekter') : navigate(`/p/${e.target.value}/oppgaver`))}
          >
            {(projects.length ? projects : [project]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__all">Alle prosjekter / nytt prosjekt …</option>
          </select>
        </label>
        <nav className="side-nav" aria-label="Hovedmeny">
          <div className="nav-group-label">Oppgaver</div>
          <NavLink to={`${base}/oppgaver`} end>
            <ListTodo size={19} aria-hidden="true" /> Oppgaveliste
          </NavLink>
          <NavLink to={`${base}/oppgaver/ansvar`}>
            <UserRoundCheck size={19} aria-hidden="true" /> Ansvar per person
          </NavLink>
          <div className="nav-group-label">Økonomi</div>
          <NavLink to={`${base}/okonomi`} end>
            <Receipt size={19} aria-hidden="true" /> Poster
          </NavLink>
          <NavLink to={`${base}/okonomi/maneder`}>
            <CalendarRange size={19} aria-hidden="true" /> Månedsoversikt
          </NavLink>
          <NavLink to={`${base}/okonomi/personer`}>
            <Users size={19} aria-hidden="true" /> Betalinger per person
          </NavLink>
          <div className="nav-group-label">Prosjekt</div>
          <NavLink to={`${base}/innstillinger`}>
            <Settings size={19} aria-hidden="true" /> Innstillinger og medlemmer
          </NavLink>
          <NavLink to="/prosjekter" end>
            <FolderKanban size={19} aria-hidden="true" /> Alle prosjekter
            {invites > 0 && (
              <span className="badge accent pill" style={{ marginLeft: 'auto' }}>
                {invites}
              </span>
            )}
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="me">
            <Avatar id={profile?.id ?? email} name={profile?.display_name || email} />
            <div className="grow">
              <div className="small" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.display_name || email}
              </div>
              <div className="xsmall subtle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="main" id="innhold" tabIndex={-1}>
        {invites > 0 && (
          <Link to="/prosjekter" className="notice mobile-only" style={{ marginTop: 12, textDecoration: 'none', color: 'inherit' }}>
            <Mail size={18} aria-hidden="true" />
            <span className="grow">
              Du har {invites} {invites === 1 ? 'invitasjon' : 'invitasjoner'} til prosjekter.
            </span>
          </Link>
        )}
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Hovedmeny">
        <NavLink to={`${base}/oppgaver`}>
          <ListTodo size={22} aria-hidden="true" />
          <span>Oppgaver</span>
        </NavLink>
        <NavLink to={`${base}/okonomi`}>
          <Wallet size={22} aria-hidden="true" />
          <span>Økonomi</span>
        </NavLink>
        <NavLink to={`${base}/innstillinger`}>
          <Settings size={22} aria-hidden="true" />
          <span>Prosjekt</span>
        </NavLink>
      </nav>
    </div>
  );
}

export function ThemeToggle() {
  const [theme, setThemeState] = useState(() => effectiveTheme());
  useEffect(() => {
    const onStorage = () => setThemeState(effectiveTheme());
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', onStorage);
    window.addEventListener('prosjektpanel:theme', onStorage);
    return () => {
      mq?.removeEventListener?.('change', onStorage);
      window.removeEventListener('prosjektpanel:theme', onStorage);
    };
  }, []);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={next === 'dark' ? 'Bytt til mørk modus' : 'Bytt til lys modus'}
      title={next === 'dark' ? 'Mørk modus' : 'Lys modus'}
      onClick={() => {
        // Samsvarer valget med systemet, følger vi systemet videre.
        const sys = effectiveTheme('system');
        setTheme(next === sys ? 'system' : next);
        setThemeState(next);
        window.dispatchEvent(new Event('prosjektpanel:theme'));
      }}
    >
      {theme === 'dark' ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
    </button>
  );
}

interface PageProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  subnav?: ReactNode;
}

export function Page({ title, children, actions, back, subnav }: PageProps) {
  const { project } = useProject();
  useEffect(() => {
    document.title = `${title} · ${project.name}`;
  }, [title, project.name]);
  return (
    <>
      <header className="topbar">
        {back ? (
          <Link to={back.to} className="icon-btn" aria-label={back.label}>
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        ) : (
          <span className="brand-mobile">
            <Link to="/prosjekter" className="brand-mark" style={{ width: 30, height: 30, textDecoration: 'none' }} aria-label="Alle prosjekter">
              P
            </Link>
          </span>
        )}
        <div className="grow">
          <div className="xsmall subtle mobile-only" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.name}
          </div>
          <h1>{title}</h1>
        </div>
        {actions}
        <span className="mobile-only">
          <ThemeToggle />
        </span>
      </header>
      <div className="stack fade-in">
        {subnav}
        {children}
      </div>
    </>
  );
}

export function TaskSubnav() {
  const { project } = useProject();
  const base = `/p/${project.id}/oppgaver`;
  return (
    <nav className="subnav" aria-label="Oppgaver">
      <NavLink to={base} end>
        Oppgaveliste
      </NavLink>
      <NavLink to={`${base}/ansvar`}>Ansvar per person</NavLink>
    </nav>
  );
}

export function FinanceSubnav() {
  const { project } = useProject();
  const base = `/p/${project.id}/okonomi`;
  return (
    <nav className="subnav" aria-label="Økonomi">
      <NavLink to={base} end>
        Poster
      </NavLink>
      <NavLink to={`${base}/maneder`}>Måneder</NavLink>
      <NavLink to={`${base}/personer`}>Per person</NavLink>
    </nav>
  );
}
