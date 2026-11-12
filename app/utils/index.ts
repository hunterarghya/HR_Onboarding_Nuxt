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

/** A datetime-local input value ("2030-05-01T17:30", local time) or an ISO instant → ISO instant in UTC; '' stays '' */
export function toIsoInstant(value: string | null | undefined): string {
  return value ? new Date(value).toISOString() : ''
}

/** An ISO instant → the value a datetime-local input shows, in the browser's own time zone; null → '' */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 3 → "3+ years", null → '' */
export function formatExperience(years: number | null | undefined): string {
  return years == null ? '' : `${years}+ years`
}
