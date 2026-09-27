import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { backendConfigured } from './config';
import { getMyProfile } from './lib/api';
import { supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import { AuthProvider } from './state/auth';
import { ToastProvider } from './state/toast';
import { App } from './ui/App';
import { LoginPage } from './ui/pages/Login';
import './ui/styles.css';

type Boot = { kind: 'loading' } | { kind: 'login'; notice?: string | null } | { kind: 'app'; session: Session };

/** Leser og fjerner ?code=/?error= fra adressen etter at brukeren har trykket på en e-postlenke. */
function consumeUrlNotice(): string | null {
  const params = new URLSearchParams(location.search);
  let notice: string | null = null;
  if (params.get('error_description')) notice = `Lenken kunne ikke brukes: ${params.get('error_description')}. Prøv å logge inn.`;
  else if (params.has('code')) notice = 'E-postadressen er bekreftet. Logg inn for å fortsette.';
  if (params.has('code') || params.has('error') || params.has('error_description')) history.replaceState(null, '', location.pathname + location.hash);
  return notice;
}

function Root() {
  const [boot, setBoot] = useState<Boot>({ kind: 'loading' });
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!backendConfigured) {
      setBoot({ kind: 'login', notice: 'Appen mangler kobling til databasen (VITE_SUPABASE_URL og VITE_SUPABASE_PUBLISHABLE_KEY).' });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase().auth.getSession();
      const notice = consumeUrlNotice();
      if (cancelled) return;
      setBoot(data.session ? { kind: 'app', session: data.session } : { kind: 'login', notice: data.session ? null : notice });
    })();
    const { data: sub } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setBoot({ kind: 'login' });
      else if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        setBoot((prev) => (prev.kind === 'app' && prev.session.user.id === session.user.id ? prev : { kind: 'app', session }));
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = boot.kind === 'app' ? boot.session.user.id : null;
  const refreshProfile = useCallback(async () => {
    if (userId) setProfile(await getMyProfile(userId));
  }, [userId]);
  useEffect(() => {
    setProfile(null);
    void refreshProfile().catch(() => {});
  }, [refreshProfile]);

  if (boot.kind === 'loading') {
    return (
      <div className="boot" role="status">
        Laster …
      </div>
    );
  }
  if (boot.kind === 'login') return <LoginPage notice={boot.notice} />;
  const user = boot.session.user;
  return (
    <AuthProvider
      value={{
        userId: user.id,
        email: user.email ?? '',
        emailConfirmed: Boolean(user.email_confirmed_at),
        profile,
        refreshProfile,
        signOut: async () => {
          await supabase().auth.signOut();
        },
      }}
    >
      <App />
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>,
);
