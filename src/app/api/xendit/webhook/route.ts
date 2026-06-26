import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  // Verify Xendit webhook token
  const token = req.headers.get("x-callback-token");
  if (!token || token !== process.env.XENDIT_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Xendit invoice callback payload
  const { external_id, status, paid_at } = body as {
    external_id: string;
    status: string;
    paid_at?: string;
  };

  if (!external_id) return NextResponse.json({ ok: true });

  const txn = await prisma.topupTransaction.findUnique({
    where: { id: external_id },
  });

  if (!txn || txn.status !== "PENDING") {
    return NextResponse.json({ ok: true });
  }

  if (status === "PAID" || status === "SETTLED") {
    await prisma.$transaction([
      prisma.topupTransaction.update({
        where: { id: txn.id },
        data: {
          status: "PAID",
          paidAt: paid_at ? new Date(paid_at) : new Date(),
        },
      }),
      prisma.wallet.upsert({
        where: { userId: txn.userId },
        create: { userId: txn.userId, balanceIdr: txn.amountIdr },
        update: { balanceIdr: { increment: txn.amountIdr } },
      }),
    ]);
  } else if (status === "EXPIRED") {
    await prisma.topupTransaction.update({
      where: { id: txn.id },
      data: { status: "EXPIRED" },
    });
  }

  return NextResponse.json({ ok: true });
}
