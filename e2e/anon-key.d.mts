export const JWT_SECRET: string;
export const ANON_KEY: string;
export function sign(payload: Record<string, unknown>): string;
