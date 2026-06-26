import { z } from "zod";
import { protectedProcedure } from "../context";
import { t } from "../trpc";
import { TRPCError } from "@trpc/server";

export const whitelistRouter = t.router({
  list: protectedProcedure
    .input(z.object({ spaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertOwner(ctx, input.spaceId);
      return ctx.prisma.iPWhitelist.findMany({
        where: { spaceId: input.spaceId },
        orderBy: { createdAt: "asc" },
      });
    }),

  add: protectedProcedure
    .input(
      z.object({
        spaceId: z.string(),
        ipRange: z
          .string()
          .min(7)
          .max(50)
          .regex(
            /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/,
            "Invalid IP or CIDR range"
          ),
        label: z.string().max(60).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx, input.spaceId);
      return ctx.prisma.iPWhitelist.create({ data: input });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.prisma.iPWhitelist.findUnique({
        where: { id: input.id },
        include: { space: true },
      });
      if (!entry || entry.space.ownerId !== ctx.user.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.iPWhitelist.delete({ where: { id: input.id } });
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
