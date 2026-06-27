import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../context";
import { t } from "../trpc";
import { TRPCError } from "@trpc/server";
import { computePerKeyLimit } from "@/lib/key-quota";

export const spacesRouter = t.router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.space.findMany({
      where: { ownerId: ctx.user.id },
      include: {
        model: { include: { model: true } },
        subscription: true,
        _count: { select: { ipWhitelist: true, chatSessions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const space = await ctx.prisma.space.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          customInstructions: true,
          model: { select: { modelId: true } },
          subscription: { select: { tier: true } },
        },
      });
      if (!space) throw new TRPCError({ code: "NOT_FOUND" });
      return space;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(80),
        slug: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9-]+$/),
        logo: z.string().optional(),
        location: z.string().min(2),
        visitorsPerDay: z.number().int().min(1).max(100000),
        openHour: z.number().int().min(0).max(23),
        closeHour: z.number().int().min(1).max(24),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.space.findUnique({
        where: { slug: input.slug },
      });
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Slug already taken",
        });

      return ctx.prisma.space.create({
        data: { ...input, ownerId: ctx.user.id },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).max(80).optional(),
        logo: z.string().optional(),
        location: z.string().min(2).optional(),
        visitorsPerDay: z.number().int().min(1).optional(),
        openHour: z.number().int().min(0).max(23).optional(),
        closeHour: z.number().int().min(1).max(24).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertOwner(ctx, id);
      return ctx.prisma.space.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.id);
      return ctx.prisma.space.delete({ where: { id: input.id } });
    }),

  setModel: protectedProcedure
    .input(z.object({ spaceId: z.string(), modelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.spaceId);
      return ctx.prisma.spaceModel.upsert({
        where: { spaceId: input.spaceId },
        create: { spaceId: input.spaceId, modelId: input.modelId },
        update: { modelId: input.modelId },
      });
    }),

  setPackage: protectedProcedure
    .input(
      z.object({
        spaceId: z.string(),
        tier: z.enum(["STARTER", "STANDARD", "PRO"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.spaceId);
      const packages = {
        STARTER: { priceIdr: 250000, secondsIncl: 34000, schedule: "weekends" },
        STANDARD: {
          priceIdr: 650000,
          secondsIncl: 150000,
          schedule: "weekdays",
        },
        PRO: { priceIdr: 950000, secondsIncl: 240000, schedule: "every day" },
      };
      const pkg = packages[input.tier];

      // Fetch visitorsPerDay so we can compute per-key limits
      const space = await ctx.prisma.space.findUnique({
        where: { id: input.spaceId },
        select: { visitorsPerDay: true },
      });
      const perKeyLimit = computePerKeyLimit(
        pkg.secondsIncl,
        space?.visitorsPerDay ?? 1,
        pkg.schedule
      );

      const [subscription] = await ctx.prisma.$transaction([
        ctx.prisma.spaceSubscription.upsert({
          where: { spaceId: input.spaceId },
          create: { spaceId: input.spaceId, tier: input.tier, ...pkg },
          update: { tier: input.tier, ...pkg, secondsUsed: 0, quotaResetAt: new Date() },
        }),
        // Reset all user keys for this space — new period, new limits
        ctx.prisma.spaceUserKey.updateMany({
          where: { spaceId: input.spaceId, revokedAt: null },
          data: { secondsUsed: 0, secondsLimit: perKeyLimit },
        }),
      ]);

      return subscription;
    }),

  setCustomInstructions: protectedProcedure
    .input(
      z.object({
        spaceId: z.string(),
        customInstructions: z.string().max(8000).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.spaceId);
      return ctx.prisma.space.update({
        where: { id: input.spaceId },
        data: { customInstructions: input.customInstructions },
      });
    }),
});

async function assertOwner(
  ctx: { user: { id: string }; prisma: typeof import("@/lib/prisma").prisma },
  spaceId: string
) {
  const space = await ctx.prisma.space.findUnique({ where: { id: spaceId } });
  if (!space || space.ownerId !== ctx.user.id)
    throw new TRPCError({ code: "FORBIDDEN" });
}
