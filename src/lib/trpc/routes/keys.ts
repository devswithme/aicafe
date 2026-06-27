import { z } from "zod";
import { protectedProcedure } from "../context";
import { t } from "../trpc";
import { TRPCError } from "@trpc/server";
import { generateRawKey, hashKey, keyPrefix } from "@/lib/api-keys";
import { computePerKeyLimit, computeOverflowLimit } from "@/lib/key-quota";
import { hasActivePlan } from "@/lib/usage";

async function requireActivePlan(spaceId: string) {
  if (!(await hasActivePlan(spaceId))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No active plan for this space. Choose a package to enable API keys.",
    });
  }
}

/** Look up the per-key compute limit for a space based on its current plan. */
async function resolveKeyLimit(
  prisma: typeof import("@/lib/prisma").prisma,
  spaceId: string
): Promise<number> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      visitorsPerDay: true,
      subscription: { select: { secondsIncl: true, schedule: true } },
    },
  });
  if (!space?.subscription) return 0; // no plan → unlimited (space quota blocks anyway)
  return computePerKeyLimit(
    space.subscription.secondsIncl,
    space.visitorsPerDay,
    space.subscription.schedule
  );
}

export const keysRouter = t.router({
  /**
   * Get the current user's key for a space, or create one if it doesn't exist.
   * Returns the raw key only on creation — never again after that.
   */
  getOrCreate: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.spaceUserKey.findUnique({
        where: {
          spaceId_userId: { spaceId: input.spaceId, userId: ctx.user.id },
        },
      });

      const secondsLimit = await resolveKeyLimit(ctx.prisma, input.spaceId);

      if (existing && !existing.revokedAt) {
        // Key exists and is active — refresh limit in case the plan changed,
        // but do NOT reset secondsUsed. Return prefix only (raw key is gone).
        if (existing.secondsLimit !== secondsLimit) {
          await ctx.prisma.spaceUserKey.update({
            where: { id: existing.id },
            data: { secondsLimit },
          });
        }
        return { created: false, keyPrefix: existing.keyPrefix, rawKey: null };
      }

      await requireActivePlan(input.spaceId);

      const raw = generateRawKey();
      const record = await ctx.prisma.spaceUserKey.upsert({
        where: {
          spaceId_userId: { spaceId: input.spaceId, userId: ctx.user.id },
        },
        create: {
          spaceId: input.spaceId,
          userId: ctx.user.id,
          keyHash: hashKey(raw),
          keyPrefix: keyPrefix(raw),
          secondsUsed: 0,
          secondsLimit,
        },
        update: {
          keyHash: hashKey(raw),
          keyPrefix: keyPrefix(raw),
          secondsUsed: 0,
          secondsLimit,
          revokedAt: null,
        },
      });

      return { created: true, keyPrefix: record.keyPrefix, rawKey: raw };
    }),

  /** Revoke the current user's key for a space. */
  revoke: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = await ctx.prisma.spaceUserKey.findUnique({
        where: {
          spaceId_userId: { spaceId: input.spaceId, userId: ctx.user.id },
        },
      });

      if (!key) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.spaceUserKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date() },
      });

      return { ok: true };
    }),

  /** Regenerate: revoke old and issue a new raw key immediately. */
  regenerate: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireActivePlan(input.spaceId);

      const [raw, secondsLimit] = await Promise.all([
        Promise.resolve(generateRawKey()),
        resolveKeyLimit(ctx.prisma, input.spaceId),
      ]);
      const record = await ctx.prisma.spaceUserKey.upsert({
        where: {
          spaceId_userId: { spaceId: input.spaceId, userId: ctx.user.id },
        },
        create: {
          spaceId: input.spaceId,
          userId: ctx.user.id,
          keyHash: hashKey(raw),
          keyPrefix: keyPrefix(raw),
          secondsUsed: 0,
          secondsLimit,
        },
        update: {
          keyHash: hashKey(raw),
          keyPrefix: keyPrefix(raw),
          secondsUsed: 0,
          secondsLimit,
          revokedAt: null,
        },
      });

      return { keyPrefix: record.keyPrefix, rawKey: raw };
    }),

  /** Get usage stats for the current user's key. */
  myUsage: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const key = await ctx.prisma.spaceUserKey.findUnique({
        where: {
          spaceId_userId: { spaceId: input.spaceId, userId: ctx.user.id },
        },
      });

      if (!key || key.revokedAt) return null;

      const overflowLimit = computeOverflowLimit(key.secondsLimit);

      return {
        keyPrefix: key.keyPrefix,
        secondsUsed: key.secondsUsed,
        secondsLimit: key.secondsLimit,
        overflowLimit,
        overflowRemaining: Math.max(0, overflowLimit - key.secondsUsed),
        active: true,
      };
    }),
});
