import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        // PKCE: bekreftelseslenken kommer tilbake med ?code=, som ikke kolliderer med hash-rutingen.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Oversetter vanlige feilmeldinger fra Supabase til norsk. */
export function errorText(err: unknown): string {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  if (/invalid login credentials/i.test(msg)) return 'Feil e-post eller passord.';
  if (/email not confirmed/i.test(msg)) return 'E-postadressen er ikke bekreftet ennå. Trykk på lenken i e-posten vi sendte deg.';
  if (/user already registered/i.test(msg)) return 'Det finnes allerede en konto med denne e-postadressen. Logg inn i stedet.';
  if (/password should be at least/i.test(msg)) return 'Passordet må ha minst 8 tegn.';
  if (/rate limit|too many/i.test(msg)) return 'For mange forsøk. Vent litt og prøv igjen.';
  if (/unable to validate email|invalid.*email/i.test(msg)) return 'E-postadressen ser ikke gyldig ut.';
  if (/weak password|pwned/i.test(msg)) return 'Passordet er for svakt. Velg et lengre eller mindre vanlig passord.';
  if (/duplicate key.*project_invitations/i.test(msg)) return 'Denne personen er allerede invitert.';
  if (/row-level security|permission denied/i.test(msg)) return 'Du har ikke tilgang til å gjøre dette.';
  if (/failed to fetch|network/i.test(msg)) return 'Kunne ikke nå serveren. Sjekk nettforbindelsen.';
  return msg || 'Noe gikk galt.';
}
