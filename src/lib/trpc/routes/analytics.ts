import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../context";
import { t } from "../trpc";
import { TRPCError } from "@trpc/server";

export const analyticsRouter = t.router({
  spaceStats: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const space = await ctx.prisma.space.findUnique({
        where: { id: input.spaceId },
      });
      if (!space || space.ownerId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const [totalSessions, activeSessions, avgDuration, peakHours, recentDays] =
        await Promise.all([
          ctx.prisma.visitorAnalytics.count({ where: { spaceId: input.spaceId } }),

          ctx.prisma.visitorAnalytics.count({
            where: {
              spaceId: input.spaceId,
              sessionStart: { gte: todayStart },
              sessionEnd: null,
            },
          }),

          ctx.prisma.visitorAnalytics.aggregate({
            where: { spaceId: input.spaceId, durationSecs: { not: null } },
            _avg: { durationSecs: true },
          }),

          ctx.prisma.visitorAnalytics.groupBy({
            by: ["hourOfDay"],
            where: { spaceId: input.spaceId },
            _count: { id: true },
            orderBy: { hourOfDay: "asc" },
          }),

          ctx.prisma.visitorAnalytics.groupBy({
            by: ["dayOfWeek"],
            where: { spaceId: input.spaceId },
            _count: { id: true },
            orderBy: { dayOfWeek: "asc" },
          }),
        ]);

      return {
        totalSessions,
        activeSessions,
        avgDurationSecs: Math.round(avgDuration._avg.durationSecs ?? 0),
        peakHours: peakHours.map((h) => ({
          hour: h.hourOfDay,
          count: h._count.id,
        })),
        recentDays: recentDays.map((d) => ({
          dayOfWeek: d.dayOfWeek,
          count: d._count.id,
        })),
      };
    }),

  recordVisit: publicProcedure
    .input(
      z.object({
        spaceId: z.string(),
        visitorIp: z.string(),
        hourOfDay: z.number().int().min(0).max(23),
        dayOfWeek: z.number().int().min(0).max(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.visitorAnalytics.create({ data: input });
    }),

  endVisit: publicProcedure
    .input(z.object({ id: z.string(), durationSecs: z.number().int(), messageCount: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.visitorAnalytics.update({
        where: { id: input.id },
        data: {
          sessionEnd: new Date(),
          durationSecs: input.durationSecs,
          messageCount: input.messageCount,
        },
      });
    }),

  dashboardOverview: protectedProcedure.query(async ({ ctx }) => {
    const spaces = await ctx.prisma.space.findMany({
      where: { ownerId: ctx.user.id },
      select: { id: true },
    });
    const spaceIds = spaces.map((s) => s.id);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [totalSpaces, approvedSpaces, totalVisitors, activeToday, avgDuration] =
      await Promise.all([
        ctx.prisma.space.count({ where: { ownerId: ctx.user.id } }),
        ctx.prisma.space.count({
          where: { ownerId: ctx.user.id, status: "APPROVED" },
        }),
        ctx.prisma.visitorAnalytics.count({
          where: { spaceId: { in: spaceIds } },
        }),
        ctx.prisma.visitorAnalytics.count({
          where: {
            spaceId: { in: spaceIds },
            sessionStart: { gte: todayStart },
          },
        }),
        ctx.prisma.visitorAnalytics.aggregate({
          where: {
            spaceId: { in: spaceIds },
            durationSecs: { not: null },
          },
          _avg: { durationSecs: true },
        }),
      ]);

    return {
      totalSpaces,
      approvedSpaces,
      totalVisitors,
      activeToday,
      avgDurationSecs: Math.round(avgDuration._avg.durationSecs ?? 0),
    };
  }),
});
