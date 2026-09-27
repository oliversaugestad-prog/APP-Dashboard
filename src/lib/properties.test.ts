import { compareValues, formatNumber, isEmpty, nextColor, normalizeUrl, parseNumber, readValue } from './properties';

describe('egenskaper', () => {
  it('tolker tall', () => {
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1234.5')).toBe(1234.5);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(formatNumber(1234.5)).toBe('1 234,5');
  });
  it('leser verdier med riktig type', () => {
    expect(readValue('multi_select', undefined)).toEqual([]);
    expect(readValue('multi_select', 'A')).toEqual(['A']);
    expect(readValue('checkbox', null)).toBe(false);
    expect(readValue('number', '4,5')).toBe(4.5);
    expect(readValue('select', ['A'])).toBe('A');
  });
  it('sorterer og finner tomme verdier', () => {
    expect(compareValues('number', 2, 10, String)).toBeLessThan(0);
    expect(compareValues('text', 'b', 'Å', String)).toBeLessThan(0);
    expect(compareValues('checkbox', true, false, String)).toBeLessThan(0);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty(0)).toBe(false);
  });
  it('velger farge og lager lenker', () => {
    expect(nextColor([{ name: 'a', color: 0 }])).toBe(1);
    expect(normalizeUrl('vg.no')).toBe('https://vg.no');
    expect(normalizeUrl('http://x.no')).toBe('http://x.no');
  });
});
