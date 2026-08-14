export const MAX_MONEY = 1_000_000_000_000_000;
export const MIN_RETURN_RATE = -99;
export const MAX_RETURN_RATE = 100;
export const MAX_INFLATION_RATE = 100;
export const MAX_PERCENT_RATE = 100;

function numericValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number(value);
  return Number(value.trim().replace(",", ".").replace(/%/g, ""));
}

export function clampFiniteNumber(value: unknown, minimum: number, maximum: number, fallback = 0) {
  const numeric = numericValue(value);
  if (numeric === Number.POSITIVE_INFINITY) return maximum;
  if (numeric === Number.NEGATIVE_INFINITY) return minimum;
  if (!Number.isFinite(numeric)) return Math.min(maximum, Math.max(minimum, fallback));
  return Math.min(maximum, Math.max(minimum, numeric));
}

export function sanitizeMoney(value: unknown) {
  return clampFiniteNumber(value, 0, MAX_MONEY);
}

export function sanitizeSignedMoney(value: unknown) {
  return clampFiniteNumber(value, -MAX_MONEY, MAX_MONEY);
}

export function parseMoneyInput(value: string) {
  const cleaned = value.trim().replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;

  let normalized = cleaned;
  const commaCount = (cleaned.match(/,/g) ?? []).length;
  if (cleaned.includes(".")) {
    normalized = cleaned.replace(/,/g, "");
  } else if (commaCount === 1) {
    const [whole, decimal = ""] = cleaned.split(",");
    normalized = decimal.length > 0 && decimal.length <= 2 ? `${whole}.${decimal}` : `${whole}${decimal}`;
  } else if (commaCount > 1) {
    normalized = cleaned.replace(/,/g, "");
  }

  return sanitizeMoney(normalized);
}

export function sanitizeReturnRate(value: unknown) {
  return clampFiniteNumber(value, MIN_RETURN_RATE, MAX_RETURN_RATE);
}

export function sanitizeInflationRate(value: unknown) {
  return clampFiniteNumber(value, 0, MAX_INFLATION_RATE);
}

export function sanitizePercentRate(value: unknown) {
  return clampFiniteNumber(value, 0, MAX_PERCENT_RATE);
}
