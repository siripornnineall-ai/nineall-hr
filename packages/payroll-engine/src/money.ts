/**
 * Fixed-point money helpers. All monetary values are represented as integer
 * "satang" (1 THB = 100 satang) internally so arithmetic never accumulates
 * IEEE-754 floating point error. Convert to/from THB only at the I/O boundary.
 */
export type Satang = number;

export function bahtToSatang(baht: number): Satang {
  return Math.round(baht * 100);
}

export function satangToBaht(satang: Satang): number {
  return satang / 100;
}

export function addSatang(...values: Satang[]): Satang {
  return values.reduce((sum, v) => sum + v, 0);
}

export function subSatang(a: Satang, b: Satang): Satang {
  return a - b;
}

/** Multiply a satang amount by a rational factor, rounding half-up to the nearest satang. */
export function mulSatang(satang: Satang, factor: number): Satang {
  return Math.round(satang * factor);
}

/** Prorate a satang amount by `numerator / denominator` (e.g. worked days / total days). */
export function prorateSatang(satang: Satang, numerator: number, denominator: number): Satang {
  if (denominator === 0) return 0;
  return Math.round((satang * numerator) / denominator);
}

export function formatBaht(satang: Satang): string {
  return satangToBaht(satang).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
