import { NextRequest, NextResponse } from "next/server";
import { releaseInferenceSlot } from "@/lib/concurrency";
import { injectSpaceInstructions } from "@/lib/space-instructions";
import {
  UPSTREAM_TIMEOUT_MS,
  getClientIP,
  extractApiKeyFromRequest,
  recordKeyUsage,
  recordSpaceUsage,
  wrapStreamWithSlotRelease,
  buildModalHeaders,
  runPreflightChecks,
} from "@/lib/inference-middleware";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  let slotId: string | null = null;

  try {
    const rawKey = extractApiKeyFromRequest(req);
    const clientIP = getClientIP(req);

    const preflight = await runPreflightChecks(slug, rawKey, clientIP);
    if (!preflight.ok) return preflight.response;

    const { space, userKey, quotaHeaders } = preflight;
    slotId = preflight.slotId;

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: { message: "messages array is required", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    // ── Proxy to Modal ──────────────────────────────────────────────────────
    const modalUrl = process.env.MODAL_API_URL;
    if (!modalUrl) {
      return NextResponse.json(
        {
          error: {
            message: "Inference backend not configured (MODAL_API_URL missing)",
            type: "configuration_error",
          },
        },
        { status: 503 }
      );
    }

    const modalHeaders = buildModalHeaders();
    if (!modalHeaders) {
      return NextResponse.json(
        {
          error: {
            message: "Inference backend credentials not configured (MODAL_KEY / MODAL_SECRET missing)",
            type: "configuration_error",
          },
        },
        { status: 503 }
      );
    }

    const forwardBody = {
      ...body,
      model: space.model!.model.modelId,
      messages: injectSpaceInstructions(
        messages as { role: string; content: string }[],
        space.name,
        space.customInstructions
      ),
    };

    const startedAt = Date.now();
    let upstream: Response;
    try {
      upstream = await fetch(`${modalUrl}/v1/chat/completions`, {
        method: "POST",
        headers: modalHeaders,
        body: JSON.stringify(forwardBody),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        // @ts-expect-error Next.js fetch extension for streaming
        duplex: "half",
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        await recordSpaceUsage(space.id, Date.now() - startedAt);
        return NextResponse.json(
          {
            error: {
              message: `Inference timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s.`,
              type: "timeout",
            },
          },
          { status: 504 }
        );
      }
      throw err;
    }

    if (!upstream.ok) {
      const errText = await upstream.text();
      return NextResponse.json(
        { error: { message: "Inference error from backend", detail: errText } },
        { status: 502 }
      );
    }

    const isStream = body.stream === true;

    if (isStream && upstream.body) {
      const spaceId = space.id;
      const keyId = userKey.id;
      const wrapped = wrapStreamWithSlotRelease(upstream.body, slotId, () => {
        const elapsed = Date.now() - startedAt;
        void recordSpaceUsage(spaceId, elapsed);
        void recordKeyUsage(keyId, elapsed);
      });
      slotId = null;

      return new NextResponse(wrapped, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Expose-Headers":
            "X-Fair-Share-Exceeded, X-Fair-Share-Limit, X-Fair-Share-Used, X-Overflow-Limit, X-Overflow-Remaining",
          ...quotaHeaders,
        },
      });
    }

    const elapsed = Date.now() - startedAt;
    const data = await upstream.json();
    await Promise.all([
      recordSpaceUsage(space.id, elapsed),
      recordKeyUsage(userKey.id, elapsed),
    ]);
    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers":
          "X-Fair-Share-Exceeded, X-Fair-Share-Limit, X-Fair-Share-Used, X-Overflow-Limit, X-Overflow-Remaining",
        ...quotaHeaders,
      },
    });
  } catch (err) {
    console.error("[Modal inference error]", err);
    return NextResponse.json(
      { error: { message: "Failed to reach inference backend", type: "backend_error" } },
      { status: 502 }
    );
  } finally {
    if (slotId) {
      await releaseInferenceSlot(slotId);
    }
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
