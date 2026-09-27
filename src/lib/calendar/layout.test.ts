import { describe, expect, it } from 'vitest';
import { layoutColumns, packLanes, type Placed } from './layout';

const ev = (key: string, startMin: number, endMin: number) => ({ key, startMin, endMin });

/** Oppslag på nøkkel — rekkefølgen ut er sorteringsrekkefølgen, ikke inn-rekkefølgen. */
const at = <T extends { key: string }>(placed: Placed<T>[], key: string) => {
  const found = placed.find((p) => p.item.key === key);
  if (!found) throw new Error(`Fant ikke «${key}» i resultatet`);
  return found;
};

describe('layoutColumns', () => {
  it('gir full bredde til begivenheter som ikke overlapper', () => {
    const placed = layoutColumns([ev('a', 480, 540), ev('b', 600, 660)]);
    expect(placed).toHaveLength(2);
    for (const p of placed) {
      expect(p.left).toBe(0);
      expect(p.width).toBe(1);
      expect(p.columns).toBe(1);
    }
  });

  it('deler bredden mellom to som overlapper', () => {
    const placed = layoutColumns([ev('a', 480, 600), ev('b', 540, 660)]);
    expect(at(placed, 'a')).toMatchObject({ left: 0, width: 0.5, column: 0, columns: 2 });
    expect(at(placed, 'b')).toMatchObject({ left: 0.5, width: 0.5, column: 1, columns: 2 });
  });

  it('lar en begivenhet som slutter tidlig frigi kolonnen sin', () => {
    // b slutter 10:00, så c kan overta kolonne 1 i stedet for å åpne en tredje.
    const placed = layoutColumns([ev('a', 480, 720), ev('b', 480, 600), ev('c', 630, 690)]);
    expect(at(placed, 'c').column).toBe(1);
    expect(at(placed, 'a').columns).toBe(2);
  });

  it('utvider mot høyre når nabokolonnen er tom hele spennet', () => {
    const placed = layoutColumns([
      ev('lang', 540, 720), // 09:00-12:00, kolonne 0
      ev('b', 540, 600), // 09:00-10:00, kolonne 1
      ev('c', 540, 600), // 09:00-10:00, kolonne 2
      ev('sen', 630, 660), // 10:30-11:00 — kolonne 1 og 2 er ledige nå
    ]);
    expect(at(placed, 'sen')).toMatchObject({ column: 1, columns: 3 });
    // To av tre kolonner, ikke én av tre.
    expect(at(placed, 'sen').width).toBeCloseTo(2 / 3);
    expect(at(placed, 'lang').width).toBeCloseTo(1 / 3);
  });

  it('holder klynger fra hverandre', () => {
    const placed = layoutColumns([
      ev('a', 480, 540),
      ev('b', 500, 560), // klynge 1
      ev('c', 600, 660), // klynge 2, uberørt
    ]);
    expect(at(placed, 'c')).toMatchObject({ width: 1, columns: 1 });
    expect(at(placed, 'a').columns).toBe(2);
  });

  it('stopper på kolonnetaket i stedet for å lage splinter', () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => ev(`e${n}`, 540, 660));
    const placed = layoutColumns(many, { maxColumns: 4 });
    expect(placed.every((p) => p.columns === 4)).toBe(true);
    expect(placed.filter((p) => p.stackIndex > 0)).toHaveLength(2);
    expect(placed.every((p) => p.width >= 0.25)).toBe(true);
  });

  it('lar et null-langt innslag ta plass i stedet for å legge seg oppå', () => {
    const placed = layoutColumns([ev('punkt', 600, 600), ev('kort', 605, 615)]);
    expect(at(placed, 'punkt').columns).toBe(2);
  });

  it('tåler en tom liste', () => {
    expect(layoutColumns([])).toEqual([]);
  });
});

const span = (key: string, startDate: string, endDate = startDate) => ({ key, startDate, endDate });

const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

describe('packLanes', () => {
  it('gir to bjelker på samme dag hver sin bane', () => {
    const { lanes, laneCount } = packLanes([span('a', '2026-09-08'), span('b', '2026-09-08')], week);
    expect(laneCount).toBe(2);
    expect(lanes.map((l) => l.lane).sort()).toEqual([0, 1]);
  });

  it('holder en bjelke i samme bane hele spennet', () => {
    const { lanes } = packLanes([span('lang', '2026-09-08', '2026-09-11'), span('kort', '2026-09-09')], week);
    const lang = lanes.find((l) => l.item.key === 'lang')!;
    const kort = lanes.find((l) => l.item.key === 'kort')!;
    expect(lang).toMatchObject({ lane: 0, startIndex: 1, endIndex: 4, span: 4 });
    expect(kort.lane).toBe(1);
  });

  it('gjenbruker banen når den er ledig igjen', () => {
    const { lanes, laneCount } = packLanes([span('a', '2026-09-07', '2026-09-08'), span('b', '2026-09-10', '2026-09-11')], week);
    expect(laneCount).toBe(1);
    expect(lanes.every((l) => l.lane === 0)).toBe(true);
  });

  it('klipper et spenn som begynner før vinduet', () => {
    const { lanes } = packLanes([span('ferie', '2026-09-01', '2026-09-09')], week);
    expect(lanes[0]).toMatchObject({
      startIndex: 0,
      endIndex: 2,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it('klipper et spenn som fortsetter etter vinduet', () => {
    const { lanes } = packLanes([span('ferie', '2026-09-11', '2026-09-20')], week);
    expect(lanes[0]).toMatchObject({
      startIndex: 4,
      endIndex: 6,
      continuesAfter: true,
      continuesBefore: false,
    });
  });

  it('dropper det som ligger helt utenfor vinduet', () => {
    const { lanes } = packLanes([span('neste', '2026-10-01')], week);
    expect(lanes).toEqual([]);
  });

  it('teller det som ikke fikk plass, per dag', () => {
    const items = [1, 2, 3, 4].map((n) => span(`e${n}`, '2026-09-08', '2026-09-09'));
    const { lanes, overflow } = packLanes(items, week, { maxLanes: 3 });
    expect(lanes).toHaveLength(3);
    expect(overflow).toEqual({ '2026-09-08': 1, '2026-09-09': 1 });
  });

  it('tåler et tomt vindu', () => {
    expect(packLanes([span('a', '2026-09-08')], [])).toEqual({
      lanes: [],
      laneCount: 0,
      overflow: {},
    });
  });
});
