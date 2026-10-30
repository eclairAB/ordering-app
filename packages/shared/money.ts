/**
 * Money is always an integer number of centavos. Never use floats for money.
 * Division by 100 happens only when formatting for display.
 */
export type Centavos = number;

export class MoneyError extends Error {
  override name = 'MoneyError';
}

export function isCentavos(value: unknown): value is Centavos {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertCentavos(value: unknown): Centavos {
  if (!isCentavos(value)) {
    throw new MoneyError(`Not an integer centavo amount: ${String(value)}`);
  }
  return value;
}

export function addCentavos(...amounts: Centavos[]): Centavos {
  let total = 0;
  for (const amount of amounts) {
    // Check every step: an intermediate overflow can silently lose precision.
    total = assertCentavos(total + assertCentavos(amount));
  }
  return total;
}

export function multiplyCentavos(unit: Centavos, qty: number): Centavos {
  if (!Number.isSafeInteger(qty)) {
    throw new MoneyError(`Quantity must be an integer: ${String(qty)}`);
  }
  return assertCentavos(assertCentavos(unit) * qty);
}

export interface PricedLine {
  unitPriceCentavos: Centavos;
  modifierDeltasCentavos: Centavos[];
  qty: number;
}

/** Line total = (unit price + sum of modifier deltas) * qty. */
export function lineTotalCentavos(line: PricedLine): Centavos {
  const unit = addCentavos(line.unitPriceCentavos, ...line.modifierDeltasCentavos);
  return multiplyCentavos(unit, line.qty);
}

export function orderTotalCentavos(lines: PricedLine[]): Centavos {
  return addCentavos(...lines.map(lineTotalCentavos));
}

const DECIMAL_AMOUNT = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Parse a decimal string like "120", "120.5" or "120.50" into centavos without float math. */
export function parseToCentavos(input: string): Centavos {
  const match = DECIMAL_AMOUNT.exec(input.trim());
  if (!match) {
    throw new MoneyError(`Invalid amount: "${input}"`);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return assertCentavos(sign && centavos !== 0 ? -centavos : centavos);
}

export interface FormatOptions {
  currency?: string;
  locale?: string;
}

export function formatCentavos(amount: Centavos, options: FormatOptions = {}): string {
  const { currency = 'PHP', locale = 'en-PH' } = options;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    assertCentavos(amount) / 100,
  );
}
