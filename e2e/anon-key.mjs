// Lager en anon-JWT for den lokale teststakken (samme hemmelighet som i stack.sh).
import { createHmac } from 'node:crypto';

export const JWT_SECRET = 'lokal-hemmelighet-som-er-minst-32-tegn-lang';

export function sign(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${createHmac('sha256', JWT_SECRET).update(body).digest('base64url')}`;
}

export const ANON_KEY = sign({ role: 'anon', iss: 'supabase', iat: 1700000000, exp: 2100000000 });

if (import.meta.url === `file://${process.argv[1]}`) console.log(ANON_KEY);
