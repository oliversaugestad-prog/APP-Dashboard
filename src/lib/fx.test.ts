import { convertMinor, formatRate, parseRate, rateToBase } from './fx';
import { formatNok, setDisplayCurrency } from './money';

describe('valuta', () => {
  const series = {
    '2026-09-14': { EUR: 0.134, SEK: 1.47 },
    '2026-09-15': { EUR: 0.1341, SEK: 1.48 },
    '2026-09-18': { EUR: 0.135 },
  };
  it('finner kursen for siste bankdag på eller før datoen', () => {
    expect(rateToBase(series, 'EUR', 'DKK', '2026-09-15')?.date).toBe('2026-09-15');
    expect(rateToBase(series, 'EUR', 'DKK', '2026-09-17')?.date).toBe('2026-09-15');
    expect(rateToBase(series, 'EUR', 'DKK', '2026-09-20')?.date).toBe('2026-09-18');
    expect(rateToBase(series, 'SEK', 'DKK', '2026-09-20')?.date).toBe('2026-09-15');
    expect(rateToBase(series, 'EUR', 'DKK', '2026-09-01')?.date).toBe('2026-09-14');
    expect(rateToBase(series, 'DKK', 'DKK', '2026-09-01')).toEqual({ rate: 1, date: '2026-09-01' });
    expect(rateToBase(series, 'USD', 'DKK', '2026-09-15')).toBeNull();
  });
  it('regner om og runder til hundredeler', () => {
    const r = rateToBase(series, 'EUR', 'DKK', '2026-09-18')!.rate;
    expect(convertMinor(10000, r)).toBe(74074);
    expect(convertMinor(12345, 7.4612)).toBe(92109);
  });
  it('viser og tolker kurser', () => {
    expect(formatRate('EUR', 'DKK', 7.4612)).toBe('1 EUR = 7,4612 DKK');
    expect(formatRate('JPY', 'DKK', 0.0436)).toBe('1 JPY = 0,0436 DKK');
    expect(parseRate('7,4612')).toBe(7.4612);
    expect(parseRate('abc')).toBeNull();
    expect(parseRate('0')).toBeNull();
  });
  it('formaterer i regnskapsvalutaen', () => {
    setDisplayCurrency('DKK');
    expect(formatNok(123450)).toBe('1 234,50 DKK');
    expect(formatNok(500, { currency: 'EUR' })).toBe('5,00 €');
    setDisplayCurrency('NOK');
    expect(formatNok(123450)).toBe('1 234,50 kr');
  });
});
