import { headers } from "next/headers";
import { t } from "./trpc";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";

export const createTRPCContext = async (): Promise<TRPCContext> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return { user: session?.user || null, prisma };
};

export type TRPCContext = {
  user: typeof auth.$Infer.Session.user | null;
  prisma: typeof prisma;
};

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
