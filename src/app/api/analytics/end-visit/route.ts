import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasActivePlan } from "@/lib/usage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, durationSecs, messageCount } = body as {
      id: string;
      durationSecs: number;
      messageCount: number;
    };

    if (!id) return NextResponse.json({ ok: false }, { status: 400 });

    const visit = await prisma.visitorAnalytics.findUnique({
      where: { id },
      select: { spaceId: true },
    });
    if (!visit || !(await hasActivePlan(visit.spaceId))) {
      return NextResponse.json({ ok: true });
    }

    await prisma.visitorAnalytics.update({
      where: { id },
      data: {
        sessionEnd: new Date(),
        durationSecs: Math.max(0, durationSecs),
        messageCount: Math.max(0, messageCount),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
