/**
 * Per-key compute quota — the monthly allowance (in seconds) assigned to a
 * single user's API key for a space.
 *
 * Formula:
 *   perKeyLimit = ceil(secondsIncl / (visitorsPerDay × daysActivePerMonth))
 *
 * Where daysActivePerMonth depends on the plan schedule:
 *   weekends  →  8 days  (≈ 4 Saturdays + 4 Sundays)
 *   weekdays  → 22 days  (typical workday count)
 *   every day → 30 days
 *
 * A minimum floor of 120 s (2 min) ensures every key can make at least a
 * couple of requests even on very large expected-visitor counts.
 *
 * The limit is stored on SpaceUserKey.secondsLimit and is reset to 0 used
 * each time the space owner changes/renews their plan.
 *
 * Enforcement uses fair share + overflow:
 * - Under fair share: allow freely while the space pool has headroom.
 * - Over fair share: allow only while shared surplus exists, up to overflow cap.
 * - Over overflow cap: hard block even if the space pool still has seconds left.
 */

const MIN_SECONDS = 120;

/** Max personal usage as a multiple of fair share (e.g. 2× ≈ 910s when fair share is 455s). */
export const OVERFLOW_MULTIPLIER = 2;

export function isFairShareExceeded(secondsUsed: number, secondsLimit: number): boolean {
  return secondsLimit > 0 && secondsUsed >= secondsLimit;
}

export function computeOverflowLimit(secondsLimit: number): number {
  if (secondsLimit <= 0) return 0;
  return Math.ceil(secondsLimit * OVERFLOW_MULTIPLIER);
}

/**
 * Shared surplus seconds available for overflow borrowing — unused fair share
 * from no-shows plus any plan headroom not reserved by under-limit visitors.
 */
export function computeSurplusSeconds(
  secondsIncl: number,
  spaceSecondsUsed: number,
  keys: { secondsUsed: number; secondsLimit: number }[]
): number {
  const spaceRemaining = secondsIncl - spaceSecondsUsed;
  const unusedFairShare = keys.reduce(
    (sum, key) =>
      sum + Math.max(0, key.secondsLimit - Math.min(key.secondsUsed, key.secondsLimit)),
    0
  );
  return Math.max(0, spaceRemaining - unusedFairShare);
}

export type KeyQuotaDecision =
  | {
      allowed: true;
      fairShareExceeded: boolean;
      overflowLimit: number;
      overflowRemaining: number;
    }
  | {
      allowed: false;
      reason: "overflow_cap_exceeded" | "surplus_exhausted";
      overflowLimit: number;
    };

export function evaluateKeyQuotaAccess(
  userKey: { secondsUsed: number; secondsLimit: number },
  surplusSeconds: number
): KeyQuotaDecision {
  const overflowLimit = computeOverflowLimit(userKey.secondsLimit);
  const overflowRemaining = Math.max(0, overflowLimit - userKey.secondsUsed);

  if (userKey.secondsLimit > 0 && userKey.secondsUsed >= overflowLimit) {
    return { allowed: false, reason: "overflow_cap_exceeded", overflowLimit };
  }

  const fairShareExceeded = isFairShareExceeded(userKey.secondsUsed, userKey.secondsLimit);
  if (fairShareExceeded && surplusSeconds <= 0) {
    return { allowed: false, reason: "surplus_exhausted", overflowLimit };
  }

  return {
    allowed: true,
    fairShareExceeded,
    overflowLimit,
    overflowRemaining,
  };
}

export function daysActivePerMonth(schedule: string): number {
  if (schedule === "weekends") return 8;
  if (schedule === "weekdays") return 22;
  return 30; // "every day"
}

/**
 * Compute the per-key monthly compute limit in seconds.
 *
 * @param secondsIncl  Total compute seconds included in the plan
 * @param visitorsPerDay  Expected daily visitors (from space settings)
 * @param schedule  Plan schedule string ("weekends" | "weekdays" | "every day")
 */
export function computePerKeyLimit(
  secondsIncl: number,
  visitorsPerDay: number,
  schedule: string
): number {
  const days = daysActivePerMonth(schedule);
  const totalVisits = Math.max(1, visitorsPerDay) * days;
  const limit = Math.ceil(secondsIncl / totalVisits);
  return Math.max(MIN_SECONDS, limit);
}
