// Whether a scored resume becomes a candidate, and with which status.

export interface ShortlistTarget {
  role: string
  shortlist_mode: string | null
  min_score: number | null
}

/** Resumes that match no job land in "Open", reviewed manually. */
export const OPEN_TARGET: ShortlistTarget = { role: 'Open', shortlist_mode: 'manual', min_score: 0 }

/**
 * manual jobs: every resume is kept as "applied".
 * auto jobs: kept as "shortlisted" only at or above min_score (a min_score of 0 falls back to 60: BUG-03).
 */
export const decide = (target: ShortlistTarget, score: number) => {
  const minScoreRequired = target.min_score || 60
  const isAuto = target.shortlist_mode === 'auto'
  const accept = target.shortlist_mode === 'manual' || (isAuto && score >= minScoreRequired)
  const status = target.shortlist_mode === 'manual' ? 'applied' : 'shortlisted'
  return { accept, status, minScoreRequired }
}
