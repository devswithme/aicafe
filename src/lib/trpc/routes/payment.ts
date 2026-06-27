import { z } from "zod";
import { protectedProcedure } from "../context";
import { t } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Xendit } from "xendit-node";
import { prisma } from "@/lib/prisma";
import { FREE_TRIAL_SECONDS } from "@/lib/usage";

function xenditInvoice() {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "XENDIT_SECRET_KEY not configured" });
  const client = new Xendit({ secretKey: key });
  const { Invoice } = client;
  return Invoice;
}

// Ensure wallet exists, return it
async function getOrCreateWallet(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId, balanceIdr: 0 },
    update: {},
  });
}

export const paymentRouter = t.router({
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const [wallet, user] = await Promise.all([
      getOrCreateWallet(ctx.user.id),
      ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { trialSecondsUsed: true },
      }),
    ]);
    const trialSecondsUsed = user?.trialSecondsUsed ?? 0;
    const trialSecondsRemaining = Math.max(0, FREE_TRIAL_SECONDS - trialSecondsUsed);
    return {
      balanceIdr: wallet.balanceIdr,
      trialSecondsUsed,
      trialSecondsRemaining,
      trialSecondsLimit: FREE_TRIAL_SECONDS,
    };
  }),

  createTopup: protectedProcedure
    .input(z.object({ amountIdr: z.number().int().min(10000) }))
    .mutation(async ({ ctx, input }) => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      // Create pending transaction first to get its ID for the external ID
      const txn = await ctx.prisma.topupTransaction.create({
        data: {
          userId: ctx.user.id,
          amountIdr: input.amountIdr,
          status: "PENDING",
        },
      });

      try {
        const Invoice = xenditInvoice();
        const invoice = await Invoice.createInvoice({
          data: {
            externalId: txn.id,
            amount: input.amountIdr,
            payerEmail: ctx.user.email,
            description: `AI Cafe Wallet Topup — Rp${input.amountIdr.toLocaleString("id-ID")}`,
            currency: "IDR",
            successRedirectUrl: `${appUrl}/dashboard?topup=success`,
            failureRedirectUrl: `${appUrl}/dashboard?topup=failed`,
          },
        });

        await ctx.prisma.topupTransaction.update({
          where: { id: txn.id },
          data: {
            xenditInvoiceId: invoice.id,
            xenditPaymentUrl: invoice.invoiceUrl,
          },
        });

        return { paymentUrl: invoice.invoiceUrl, transactionId: txn.id };
      } catch (err) {
        await ctx.prisma.topupTransaction.update({
          where: { id: txn.id },
          data: { status: "FAILED" },
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create Xendit invoice" });
      }
    }),

  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.topupTransaction.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  deductBalance: protectedProcedure
    .input(z.object({ amountIdr: z.number().int().min(1), description: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const wallet = await getOrCreateWallet(ctx.user.id);
      if (wallet.balanceIdr < input.amountIdr) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient balance. You have Rp${wallet.balanceIdr.toLocaleString("id-ID")} but need Rp${input.amountIdr.toLocaleString("id-ID")}.`,
        });
      }
      const updated = await ctx.prisma.wallet.update({
        where: { userId: ctx.user.id },
        data: { balanceIdr: { decrement: input.amountIdr } },
      });
      return { balanceIdr: updated.balanceIdr };
    }),
});
