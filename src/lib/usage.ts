import { prisma } from "@/lib/prisma";
import { BILLING_PERIOD_DAYS, isSubscriptionCurrent } from "@/lib/subscription";

export { BILLING_PERIOD_DAYS, getSubscriptionExpiry, isSubscriptionCurrent } from "@/lib/subscription";

export const FREE_TRIAL_SECONDS = 1000;

export type ComputeSource = "subscription" | "trial";

export type SpaceComputeContext = {
  source: ComputeSource;
  ownerId: string;
  visitorsPerDay: number;
  schedule: string;
  secondsIncl: number;
  secondsUsed: number;
  remainingSecs: number;
};

/** Remaining one-time free trial seconds for a user account. */
export async function getOwnerTrialRemaining(ownerId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { trialSecondsUsed: true },
  });
  if (!user) return 0;
  return Math.max(0, FREE_TRIAL_SECONDS - user.trialSecondsUsed);
}

/** Resolve whether a space draws from a paid plan or the owner's free trial. */
export async function getSpaceComputeContext(
  spaceId: string
): Promise<SpaceComputeContext | null> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      ownerId: true,
      visitorsPerDay: true,
      subscription: true,
    },
  });
  if (!space) return null;

  if (space.subscription && isSubscriptionCurrent(space.subscription)) {
    const remainingSecs = space.subscription.secondsIncl - space.subscription.secondsUsed;
    return {
      source: "subscription",
      ownerId: space.ownerId,
      visitorsPerDay: space.visitorsPerDay,
      schedule: space.subscription.schedule,
      secondsIncl: space.subscription.secondsIncl,
      secondsUsed: space.subscription.secondsUsed,
      remainingSecs,
    };
  }

  const trialRemaining = await getOwnerTrialRemaining(space.ownerId);
  return {
    source: "trial",
    ownerId: space.ownerId,
    visitorsPerDay: space.visitorsPerDay,
    schedule: "every day",
    secondsIncl: FREE_TRIAL_SECONDS,
    secondsUsed: FREE_TRIAL_SECONDS - trialRemaining,
    remainingSecs: trialRemaining,
  };
}

/** Whether a space can use compute (paid plan in period or free trial remaining). */
export async function hasActivePlan(spaceId: string): Promise<boolean> {
  const ctx = await getSpaceComputeContext(spaceId);
  return ctx !== null && ctx.remainingSecs > 0;
}

export type QuotaCheck =
  | { ok: true; remainingSecs: number; source: ComputeSource }
  | {
      ok: false;
      reason:
        | "no_subscription"
        | "quota_exceeded"
        | "trial_exhausted"
        | "subscription_expired";
      remainingSecs: number;
    };

/**
 * Check whether a space still has compute-seconds quota left.
 * Uses the paid plan pool when subscribed, otherwise the owner's one-time trial.
 */
export async function checkSpaceQuota(spaceId: string): Promise<QuotaCheck> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { ownerId: true, subscription: true },
  });

  if (space?.subscription && !isSubscriptionCurrent(space.subscription)) {
    const trialRemaining = await getOwnerTrialRemaining(space.ownerId);
    if (trialRemaining <= 0) {
      return { ok: false, reason: "subscription_expired", remainingSecs: 0 };
    }
  }

  const ctx = await getSpaceComputeContext(spaceId);
  if (!ctx) {
    return { ok: false, reason: "no_subscription", remainingSecs: 0 };
  }

  if (ctx.remainingSecs <= 0) {
    return {
      ok: false,
      reason: ctx.source === "trial" ? "trial_exhausted" : "quota_exceeded",
      remainingSecs: 0,
    };
  }

  return { ok: true, remainingSecs: ctx.remainingSecs, source: ctx.source };
}

/**
 * Record consumed compute seconds against a space's plan or owner trial pool.
 * Rounds up so even sub-second requests are accounted for.
 */
export async function recordSpaceUsage(spaceId: string, elapsedMs: number): Promise<void> {
  const seconds = Math.max(1, Math.ceil(elapsedMs / 1000));
  const ctx = await getSpaceComputeContext(spaceId);
  if (!ctx) return;

  if (ctx.source === "subscription") {
    await prisma.spaceSubscription
      .update({
        where: { spaceId },
        data: { secondsUsed: { increment: seconds } },
      })
      .catch(() => {
        // Subscription may have been removed mid-request; ignore.
      });
    return;
  }

  await prisma.user
    .update({
      where: { id: ctx.ownerId },
      data: { trialSecondsUsed: { increment: seconds } },
    })
    .catch(() => {});
}
