import { createContext, useContext, type ReactNode } from 'react';
import type { Profile } from '../lib/types';

export interface AuthState {
  userId: string;
  email: string;
  emailConfirmed: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ value, children }: { value: AuthState; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth utenfor AuthProvider');
  return v;
}
