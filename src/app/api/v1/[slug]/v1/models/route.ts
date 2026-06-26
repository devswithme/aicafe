import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractApiKeyFromRequest,
  unauthorizedKeyResponse,
  validateApiKeyRaw,
} from "@/lib/inference-middleware";

/**
 * GET /api/v1/[slug]/v1/models
 *
 * Anthropic-compatible model list for Claude Code gateway discovery.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const rawKey = extractApiKeyFromRequest(req);
  if (!rawKey) return unauthorizedKeyResponse("missing");

  const space = await prisma.space.findUnique({
    where: { slug },
    include: { model: { include: { model: true } } },
  });

  if (!space || space.status !== "APPROVED") {
    return NextResponse.json(
      { error: { message: "Space not found", type: "not_found" } },
      { status: 404 }
    );
  }

  const userKey = await validateApiKeyRaw(space.id, rawKey);
  if (!userKey) return unauthorizedKeyResponse("invalid");

  const models = space.model
    ? [
        {
          id: "qwen3-1.7b",
          object: "model",
          created: Math.floor(new Date(space.model.addedAt).getTime() / 1000),
          owned_by: "aicafe",
        },
        {
          id: "claude-sonnet-4-20250514",
          object: "model",
          created: Math.floor(new Date(space.model.addedAt).getTime() / 1000),
          owned_by: "aicafe",
        },
      ]
    : [];

  return NextResponse.json(
    { object: "list", data: models },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, x-api-key, anthropic-version, anthropic-beta",
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-api-key, anthropic-version, anthropic-beta",
    },
  });
}
