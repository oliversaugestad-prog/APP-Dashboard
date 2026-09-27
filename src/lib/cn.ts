/** Slår sammen klassenavn og hopper over tomme verdier. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
