import { prisma } from "@/lib/prisma";

export type QuotaCheck =
  | { ok: true; remainingSecs: number }
  | { ok: false; reason: "no_subscription" | "quota_exceeded"; remainingSecs: number };

/**
 * Check whether a space still has compute-seconds quota left on its active plan.
 * Quota is the plan's `secondsIncl` minus `secondsUsed` for the current period.
 */
export async function checkSpaceQuota(spaceId: string): Promise<QuotaCheck> {
  const sub = await prisma.spaceSubscription.findUnique({
    where: { spaceId },
  });

  if (!sub) {
    return { ok: false, reason: "no_subscription", remainingSecs: 0 };
  }

  const remainingSecs = sub.secondsIncl - sub.secondsUsed;
  if (remainingSecs <= 0) {
    return { ok: false, reason: "quota_exceeded", remainingSecs: 0 };
  }

  return { ok: true, remainingSecs };
}

/**
 * Record consumed compute seconds against a space's plan quota.
 * Rounds up so even sub-second requests are accounted for.
 */
export async function recordSpaceUsage(spaceId: string, elapsedMs: number): Promise<void> {
  const seconds = Math.max(1, Math.ceil(elapsedMs / 1000));
  await prisma.spaceSubscription
    .update({
      where: { spaceId },
      data: { secondsUsed: { increment: seconds } },
    })
    .catch(() => {
      // Subscription may have been removed mid-request; ignore.
    });
}
