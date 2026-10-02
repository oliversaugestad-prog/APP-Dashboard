import { MailCheck, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { currentAppUrl } from '../../config';
import { errorText, supabase } from '../../lib/supabase';
import { Notice, Segmented } from '../components/common';

type Mode = 'login' | 'signup';

export function LoginPage({ notice }: { notice?: string | null }) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    document.title = mode === 'login' ? 'Logg inn · Prosjektpanel' : 'Opprett konto · Prosjektpanel';
  }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setError('Skriv inn en gyldig e-postadresse.');
    if (mode === 'signup') {
      if (!name.trim()) return setError('Skriv inn navnet ditt, slik at de andre i prosjektet ser hvem du er.');
      if (password.length < 8) return setError('Passordet må ha minst 8 tegn.');
    } else if (!password) return setError('Skriv inn passordet ditt.');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase().auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase().auth.signUp({
          email: mail,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: currentAppUrl() },
        });
        if (error) throw error;
        // Supabase gir ingen feil når adressen allerede finnes, men returnerer en bruker uten identiteter.
        if (data.user && data.user.identities?.length === 0) throw new Error('User already registered');
        if (!data.session) setSentTo(mail);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login" id="innhold">
      <div className="login-card stack">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          Prosjektpanel
        </div>
        <p className="muted small">Felles oversikt over oppgaver og økonomi i prosjekter og arrangementer.</p>

        {notice && <Notice tone="info">{notice}</Notice>}

        {sentTo ? (
          <div className="stack-sm">
            <Notice tone="ok" title="Sjekk e-posten din">
              Vi har sendt en bekreftelseslenke til <strong>{sentTo}</strong>. Trykk på lenken, og logg deretter inn her. Finner du den ikke, se i søppelpost.
            </Notice>
            <button
              type="button"
              className="btn btn-block"
              onClick={() => {
                setSentTo(null);
                setMode('login');
              }}
            >
              <MailCheck size={16} aria-hidden="true" /> Jeg har bekreftet – logg inn
            </button>
          </div>
        ) : (
          <>
            <Segmented<Mode>
              label="Velg innlogging eller ny konto"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              options={[
                { value: 'login', label: 'Logg inn' },
                { value: 'signup', label: 'Opprett konto' },
              ]}
            />
            <form className="stack-sm" onSubmit={submit} noValidate>
              {mode === 'signup' && (
                <label className="field">
                  <span>Navn</span>
                  <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fornavn Etternavn" />
                </label>
              )}
              <label className="field">
                <span>E-post</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="navn@eksempel.no"
                />
              </label>
              <label className="field">
                <span>Passord</span>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === 'signup' && <span className="hint">Minst 8 tegn.</span>}
              </label>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn primary btn-block" disabled={busy} style={{ marginTop: 4 }}>
                {busy ? 'Vent litt …' : mode === 'login' ? 'Logg inn' : 'Opprett konto'}
              </button>
            </form>
          </>
        )}
        <p className="xsmall subtle row" style={{ gap: 6, alignItems: 'flex-start' }}>
          <ShieldCheck size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
          <span>Prosjektdata er bare synlige for medlemmene av prosjektet. Har du fått en invitasjon, oppretter du konto med samme e-postadresse.</span>
        </p>
      </div>
    </main>
  );
}
