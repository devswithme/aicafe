import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const space = await prisma.space.findUnique({
    where: { slug },
    include: { model: { include: { model: true } } },
  });

  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const models = space.model
    ? [
        {
          id: "qwen",
          object: "model",
          created: Math.floor(new Date(space.model.addedAt).getTime() / 1000),
          owned_by: "aicafe",
        },
      ]
    : [];

  return NextResponse.json(
    { object: "list", data: models },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
