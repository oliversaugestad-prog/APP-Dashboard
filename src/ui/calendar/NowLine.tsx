/**
 * Den røde streken.
 *
 * Den er den billigste detaljen i hele kalenderen og den som gjør mest: uten
 * den må du lese klokkeslettene i margen for å vite hvor i dagen du er.
 */
import { useEffect, useState } from 'react';
import { dateKeyOf } from '../../lib/calendar/model';
import { formatHHMM, minutesToPx } from '../../lib/calendar/geometry';

/**
 * Minutter fra midnatt akkurat nå, oppdatert ved hvert minuttskifte.
 *
 * Tikker på neste hele minutt i stedet for hvert 60. sekund fra montering, så
 * streken flytter seg i takt med klokka og ikke et halvt minutt etter.
 */
export function useNowMinutes(): { dayKey: string; minutes: number } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      const msToNextMinute = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
      timer = setTimeout(tick, msToNextMinute + 20);
    };
    const first = new Date();
    timer = setTimeout(tick, 60_000 - (first.getSeconds() * 1000 + first.getMilliseconds()) + 20);
    return () => clearTimeout(timer);
  }, []);
  return { dayKey: dateKeyOf(now), minutes: now.getHours() * 60 + now.getMinutes() };
}

export function NowLine({
  minutes,
  gutterPx,
  dotLeftPx,
}: {
  minutes: number;
  gutterPx: number;
  /** Hvor prikken skal sitte, i piksler fra dagsfeltets venstre kant. */
  dotLeftPx?: number;
}) {
  const top = minutesToPx(minutes);
  return (
    <>
      <div
        className="pointer-events-none absolute z-30 -translate-y-1/2 rounded bg-card px-1 text-[9.5px] font-medium tabular-nums text-[var(--now-ink)]"
        style={{ top, left: 2, ['--now-ink' as string]: 'var(--destructive)' }}
      >
        {formatHHMM(minutes)}
      </div>
      <div
        className="pointer-events-none absolute z-20 border-t"
        style={{
          top,
          left: gutterPx,
          right: 0,
          borderColor: 'var(--destructive)',
          borderTopWidth: 1.5,
        }}
      >
        {dotLeftPx !== undefined && (
          <span
            className="absolute h-[7px] w-[7px] rounded-full"
            style={{
              left: dotLeftPx - 3.5,
              top: -4.25,
              background: 'var(--destructive)',
            }}
          />
        )}
      </div>
    </>
  );
}
