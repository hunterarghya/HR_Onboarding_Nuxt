export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]!
}

/** 1500000 → "15,00,000" (grouping only: amounts are in the company's own currency) */
export function formatAmount(value: number | null | undefined): string {
  return value == null ? '' : value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/** A job's salary range for display: "12,00,000 – 15,00,000", "from 12,00,000", "up to …", or '' */
export function formatSalaryRange(min: number | null | undefined, max: number | null | undefined): string {
  if (min != null && max != null) return min === max ? formatAmount(min) : `${formatAmount(min)} – ${formatAmount(max)}`
  if (min != null) return `from ${formatAmount(min)}`
  if (max != null) return `up to ${formatAmount(max)}`
  return ''
}

/** 3 → "3+ years", null → '' */
export function formatExperience(years: number | null | undefined): string {
  return years == null ? '' : `${years}+ years`
}
