import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  addCentavos,
  assertCentavos,
  formatCentavos,
  lineTotalCentavos,
  multiplyCentavos,
  orderTotalCentavos,
  parseToCentavos,
} from './money.ts';

describe('assertCentavos', () => {
  it('accepts integers', () => {
    expect(assertCentavos(0)).toBe(0);
    expect(assertCentavos(12_550)).toBe(12_550);
  });

  it.each([1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null])(
    'rejects %s',
    (value) => {
      expect(() => assertCentavos(value)).toThrow(MoneyError);
    },
  );
});

describe('arithmetic', () => {
  it('adds and multiplies integers', () => {
    expect(addCentavos(10, 20, 30)).toBe(60);
    expect(addCentavos()).toBe(0);
    expect(multiplyCentavos(12_500, 3)).toBe(37_500);
  });

  it('throws on intermediate overflow instead of losing precision', () => {
    expect(() => addCentavos(Number.MAX_SAFE_INTEGER, 10, -10)).toThrow(MoneyError);
  });

  it('rejects fractional quantities', () => {
    expect(() => multiplyCentavos(100, 1.5)).toThrow(MoneyError);
  });

  it('computes line and order totals including modifiers', () => {
    const latte = { unitPriceCentavos: 15_000, modifierDeltasCentavos: [2_000, 1_500], qty: 2 };
    const water = { unitPriceCentavos: 3_000, modifierDeltasCentavos: [], qty: 1 };
    expect(lineTotalCentavos(latte)).toBe(37_000);
    expect(orderTotalCentavos([latte, water])).toBe(40_000);
  });
});

describe('parseToCentavos', () => {
  it.each([
    ['120', 12_000],
    ['120.5', 12_050],
    ['120.50', 12_050],
    ['0.07', 7],
    [' 3.10 ', 310],
    ['-5.25', -525],
  ])('parses %j', (input, expected) => {
    expect(parseToCentavos(input)).toBe(expected);
  });

  it('never returns negative zero', () => {
    expect(Object.is(parseToCentavos('-0'), 0)).toBe(true);
  });

  it('avoids float rounding errors', () => {
    // 0.1 + 0.2 style traps: 1.15 * 100 === 114.99999999999999 in floats
    expect(parseToCentavos('1.15')).toBe(115);
  });

  it.each(['', 'abc', '1.234', '1,000', '.5', '1.'])('rejects %j', (input) => {
    expect(() => parseToCentavos(input)).toThrow(MoneyError);
  });
});

describe('formatCentavos', () => {
  it('formats as pesos by default', () => {
    expect(formatCentavos(12_050)).toBe('₱120.50');
  });
});
