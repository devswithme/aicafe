import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, durationSecs, messageCount } = body as {
      id: string;
      durationSecs: number;
      messageCount: number;
    };

    if (!id) return NextResponse.json({ ok: false }, { status: 400 });

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
