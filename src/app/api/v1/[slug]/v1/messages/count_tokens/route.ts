/**
 * POST /api/v1/[slug]/v1/messages/count_tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  extractApiKeyFromRequest,
  unauthorizedKeyResponse,
  validateApiKeyRaw,
} from "@/lib/inference-middleware";

type AnthropicContentBlock = { type: string; text?: string };
type AnthropicContent = string | AnthropicContentBlock[];
type AnthropicMessage = { role: string; content: AnthropicContent };

function flattenContent(content: AnthropicContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

function estimateTokens(body: Record<string, unknown>): number {
  let chars = 0;

  if (body.system) {
    if (typeof body.system === "string") chars += body.system.length;
    else if (Array.isArray(body.system)) {
      for (const block of body.system as AnthropicContentBlock[]) {
        chars += (block.text ?? "").length;
      }
    }
  }

  for (const msg of (body.messages ?? []) as AnthropicMessage[]) {
    chars += flattenContent(msg.content).length;
  }

  return Math.max(1, Math.ceil(chars / 4));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const rawKey = extractApiKeyFromRequest(req);
  if (!rawKey) return unauthorizedKeyResponse("missing");

  const space = await prisma.space.findUnique({ where: { slug } });
  if (!space) {
    return NextResponse.json(
      { error: { message: "Space not found", type: "not_found" } },
      { status: 404 }
    );
  }

  const userKey = await validateApiKeyRaw(space.id, rawKey);
  if (!userKey) return unauthorizedKeyResponse("invalid");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { input_tokens: estimateTokens(body) },
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-api-key, anthropic-version, anthropic-beta",
    },
  });
}
