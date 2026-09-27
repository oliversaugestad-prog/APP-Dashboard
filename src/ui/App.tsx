import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { listProjects } from '../lib/api';
import { getLastProject, setLastProject } from '../lib/lastProject';
import { ProjectProvider, useProjectLoader } from '../state/project';
import { useToast } from '../state/toast';
import { Notice } from './components/common';
import { AppShell } from './Layout';
import { CalendarPage } from './pages/Calendar';
import { FinancePage } from './pages/Finance';
import { FinancePeoplePage } from './pages/FinancePeople';
import { MonthDetailPage } from './pages/MonthDetail';
import { MonthsPage } from './pages/Months';
import { ProjectsPage } from './pages/Projects';
import { SettingsPage } from './pages/Settings';
import { TaskPeoplePage } from './pages/TaskPeople';
import { TasksPage } from './pages/Tasks';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/prosjekter" element={<ProjectsPage />} />
        <Route path="/invitasjoner" element={<Navigate to="/prosjekter" replace />} />
        <Route path="/p/:projectId/*" element={<ProjectRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

/** Åpner sist brukte prosjekt, ellers prosjektoversikten. */
function Home() {
  const [target, setTarget] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    listProjects()
      .then((ps) => {
        const last = getLastProject();
        const pick = ps.find((p) => p.id === last) ?? (ps.length === 1 ? ps[0] : null);
        setTarget(pick ? `/p/${pick.id}/oppgaver` : '/prosjekter');
      })
      .catch((e) => {
        toast.error(e);
        setTarget('/prosjekter');
      });
  }, [toast]);
  if (!target) {
    return (
      <div className="boot" role="status">
        Laster prosjekter …
      </div>
    );
  }
  return <Navigate to={target} replace />;
}

function ProjectRoute() {
  const { projectId = '' } = useParams();
  const { load, reload } = useProjectLoader(projectId);

  useEffect(() => {
    if (load.kind === 'ready') setLastProject(projectId);
    if (load.kind === 'missing' && getLastProject() === projectId) setLastProject(null);
  }, [load.kind, projectId]);

  if (load.kind === 'loading') {
    return (
      <div className="boot" role="status">
        Laster prosjekt …
      </div>
    );
  }
  if (load.kind !== 'ready') {
    return (
      <div className="center-page stack">
        <Notice tone={load.kind === 'missing' ? 'warn' : 'error'} title={load.kind === 'missing' ? 'Fant ikke prosjektet' : 'Kunne ikke laste prosjektet'}>
          {load.kind === 'missing' ? 'Prosjektet finnes ikke, eller du er ikke medlem av det.' : load.message}
        </Notice>
        <a className="btn" href="#/prosjekter">
          Til prosjektene mine
        </a>
      </div>
    );
  }
  return (
    <ProjectProvider data={load.data} reload={reload}>
      <AppShell>
        <Routes>
          <Route index element={<Navigate to="oppgaver" replace />} />
          <Route path="oppgaver" element={<TasksPage />} />
          <Route path="oppgaver/ansvar" element={<TaskPeoplePage />} />
          <Route path="kalender" element={<CalendarPage />} />
          <Route path="okonomi" element={<FinancePage />} />
          <Route path="okonomi/maneder" element={<MonthsPage />} />
          <Route path="okonomi/maneder/:month" element={<MonthDetailPage />} />
          <Route path="okonomi/personer" element={<FinancePeoplePage />} />
          <Route path="innstillinger" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="oppgaver" replace />} />
        </Routes>
      </AppShell>
    </ProjectProvider>
  );
}
