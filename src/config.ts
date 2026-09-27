/**
 * Offentlig konfigurasjon for Supabase.
 *
 * Den publiserbare nøkkelen er laget for å ligge i nettleseren. Tilgangen til data styres
 * av innlogging og radnivåsikkerhet (RLS) i databasen, se supabase/migrations.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://ncpzicyhunztfbyognaq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_Toz7h4kZWERvInBm9KdfZA_IErWuJ1A';

/** Hovedadressen appen publiseres på. Brukes i bekreftelses-e-poster og invitasjonslenker. */
export const APP_URL: string = import.meta.env.VITE_APP_URL ?? 'https://oliversaugestad-prog.github.io/APP-Dashboard/';

/** Adressen brukeren faktisk har åpnet appen på (uten #-rute). */
export function currentAppUrl(): string {
  if (typeof window === 'undefined') return APP_URL;
  const { origin, pathname } = window.location;
  if (origin.startsWith('http://localhost') || origin === new URL(APP_URL).origin) return `${origin}${pathname}`;
  return APP_URL;
}

export const backendConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
