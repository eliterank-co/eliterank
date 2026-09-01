export interface PromotionWindow {
  readonly id: string
  readonly competition_id: string
  readonly starts_at: string
  readonly ends_at: string
  readonly multiplier: number
  readonly cancelled_at: string | null
}

export function localOccurrenceDate(now: Date, timezone: string): {
  readonly date: string
  readonly weekday: string
  readonly hour: number
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: string) => parts.find(part => part.type === type)?.value || ''
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday'),
    hour: Number(value('hour')),
  }
}

export function isWeeklyDigestDue(now: Date, timezone: string): boolean {
  const local = localOccurrenceDate(now, timezone)
  return local.weekday === 'Thu' && local.hour === 10
}

export function effectivePromotionMultiplier(
  competitionId: string,
  at: Date,
  windows: readonly PromotionWindow[],
): number {
  let result = 1
  for (const window of windows) {
    if (
      window.competition_id === competitionId
      && window.cancelled_at === null
      && new Date(window.starts_at).getTime() <= at.getTime()
      && at.getTime() < new Date(window.ends_at).getTime()
    ) result = Math.max(result, window.multiplier)
  }
  return result
}

export function isEffectivePromotionStart(
  target: PromotionWindow,
  windows: readonly PromotionWindow[],
): boolean {
  if (target.cancelled_at !== null || ![2, 3].includes(target.multiplier)) return false
  const startsAt = new Date(target.starts_at)
  const before = new Date(startsAt.getTime() - 1)
  const beforeMultiplier = effectivePromotionMultiplier(target.competition_id, before, windows)
  const afterMultiplier = effectivePromotionMultiplier(target.competition_id, startsAt, windows)
  return afterMultiplier > beforeMultiplier && afterMultiplier === target.multiplier
}

export function retryAt(now: Date, attemptCount: number): string {
  const delayMinutes = Math.min(24 * 60, 5 * (2 ** Math.max(0, attemptCount - 1)))
  return new Date(now.getTime() + delayMinutes * 60 * 1000).toISOString()
}
