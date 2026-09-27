import { CheckCircle2, CircleAlert } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { errorText } from '../lib/supabase';

interface ToastMsg {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface ToastApi {
  ok: (text: string) => void;
  error: (err: unknown) => void;
}

const Ctx = createContext<ToastApi>({ ok: () => {}, error: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const seq = useRef(0);
  const ok = useCallback((text: string) => setMsg({ id: ++seq.current, text, tone: 'ok' }), []);
  const error = useCallback((err: unknown) => setMsg({ id: ++seq.current, text: errorText(err), tone: 'error' }), []);
  const [api] = useState<ToastApi>(() => ({ ok, error }));

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.tone === 'error' ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [msg]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {msg && (
        <div key={msg.id} className={`toast ${msg.tone === 'error' ? 'error' : ''}`} role={msg.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
          {msg.tone === 'ok' ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
          <span>{msg.text}</span>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(Ctx);
}
