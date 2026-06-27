import { z } from "zod";
import { publicProcedure, protectedProcedure } from "../context";
import { t } from "../trpc";
import { TRPCError } from "@trpc/server";
import { hasActivePlan } from "@/lib/usage";

async function requireActivePlan(spaceId: string) {
  if (!(await hasActivePlan(spaceId))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No active plan for this space. Choose a package to enable chat history.",
    });
  }
}

export const chatRouter = t.router({
  getSessions: publicProcedure
    .input(z.object({ spaceId: z.string(), userId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.chatSession.findMany({
        where: {
          spaceId: input.spaceId,
          userId: input.userId ?? null,
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
    }),

  createSession: publicProcedure
    .input(
      z.object({
        spaceId: z.string(),
        userId: z.string().optional(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireActivePlan(input.spaceId);
      return ctx.prisma.chatSession.create({
        data: {
          spaceId: input.spaceId,
          userId: input.userId,
          title: input.title ?? "New Chat",
        },
      });
    }),

  getMessages: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.chatMessage.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { createdAt: "asc" },
      });
    }),

  saveMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
        content: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.chatSession.findUnique({
        where: { id: input.sessionId },
        select: { spaceId: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await requireActivePlan(session.spaceId);

      const msg = await ctx.prisma.chatMessage.create({ data: input });
      await ctx.prisma.chatSession.update({
        where: { id: input.sessionId },
        data: { updatedAt: new Date() },
      });
      return msg;
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.chatSession.findUnique({
        where: { id: input.sessionId },
        include: { space: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        session.userId !== ctx.user.id &&
        session.space.ownerId !== ctx.user.id
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.chatSession.delete({ where: { id: input.sessionId } });
    }),

  updateSessionTitle: publicProcedure
    .input(z.object({ sessionId: z.string(), title: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.chatSession.findUnique({
        where: { id: input.sessionId },
        select: { spaceId: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await requireActivePlan(session.spaceId);

      return ctx.prisma.chatSession.update({
        where: { id: input.sessionId },
        data: { title: input.title },
      });
    }),
});
