/**
 * POST /api/v1/[slug]/v1/messages
 *
 * Anthropic Messages API compatibility layer.
 * Used by Claude Code when ANTHROPIC_API_BASE_URL is set to /api/v1/{slug}.
 *
 * The Anthropic SDK appends "/v1/messages" to the base URL, so the full path
 * becomes /api/v1/{slug}/v1/messages — handled by this route.
 *
 * Auth: reads the key from the `x-api-key` header (Anthropic SDK default),
 *       falling back to `Authorization: Bearer` for compatibility.
 *
 * Format: translates Anthropic request → OpenAI, proxies to Modal, then
 *         translates the OpenAI response → Anthropic for both streaming and
 *         non-streaming modes.
 */

import { NextRequest, NextResponse } from "next/server";
import { releaseInferenceSlot } from "@/lib/concurrency";
import { injectSpaceInstructions } from "@/lib/space-instructions";
import { augmentMessagesWithWebSearch } from "@/lib/search-agent";
import {
  UPSTREAM_TIMEOUT_MS,
  getClientIP,
  extractApiKeyFromRequest,
  recordKeyUsage,
  recordSpaceUsage,
  buildModalHeaders,
  runPreflightChecks,
} from "@/lib/inference-middleware";

// ─── Anthropic ↔ OpenAI format translation ────────────────────────────────────

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

/** Translate an Anthropic request body into an OpenAI messages array. */
function anthropicToOpenAIMessages(body: Record<string, unknown>) {
  const messages: { role: string; content: string }[] = [];

  // Top-level `system` field → OpenAI system message
  if (body.system) {
    let systemText = "";
    if (typeof body.system === "string") {
      systemText = body.system;
    } else if (Array.isArray(body.system)) {
      systemText = (body.system as AnthropicContentBlock[])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n");
    }
    if (systemText) messages.push({ role: "system", content: systemText });
  }

  for (const msg of (body.messages ?? []) as AnthropicMessage[]) {
    messages.push({ role: msg.role, content: flattenContent(msg.content) });
  }
  return messages;
}

/** Translate an OpenAI non-streaming response into Anthropic response format. */
function openAIToAnthropicResponse(
  data: Record<string, unknown>,
  modelName: string
): Record<string, unknown> {
  const choices = data.choices as
    | Array<{ message: { content: string }; finish_reason: string }>
    | undefined;
  const usage = data.usage as
    | { prompt_tokens?: number; completion_tokens?: number }
    | undefined;

  const stopReason =
    choices?.[0]?.finish_reason === "stop" ? "end_turn" : (choices?.[0]?.finish_reason ?? "end_turn");

  return {
    id: `msg_${String(data.id ?? "").replace("chatcmpl-", "") || Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: choices?.[0]?.message?.content ?? "" }],
    model: modelName,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: usage?.prompt_tokens ?? 0,
      output_tokens: usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * Transform an OpenAI SSE stream into an Anthropic SSE stream in real-time.
 *
 * OpenAI chunks:
 *   data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}
 *   data: [DONE]
 *
 * Anthropic chunks:
 *   event: message_start\ndata: {...}\n\n
 *   event: content_block_start\ndata: {...}\n\n
 *   event: ping\ndata: {...}\n\n
 *   event: content_block_delta\ndata: {...}\n\n   (×N)
 *   event: content_block_stop\ndata: {...}\n\n
 *   event: message_delta\ndata: {...}\n\n
 *   event: message_stop\ndata: {...}\n\n
 */
function transformOpenAIToAnthropicStream(
  openAIStream: ReadableStream<Uint8Array>,
  modelName: string,
  slotId: string,
  onFinalize: () => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = openAIStream.getReader();

  let buffer = "";
  let headersSent = false;
  let msgId = `msg_${Date.now()}`;
  let outputTokens = 0;
  let finalized = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    void releaseInferenceSlot(slotId);
    onFinalize();
  };

  const sse = (event: string, data: object) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const sendHeaders = (controller: ReadableStreamDefaultController) => {
    controller.enqueue(
      sse("message_start", {
        type: "message_start",
        message: {
          id: msgId,
          type: "message",
          role: "assistant",
          content: [],
          model: modelName,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      })
    );
    controller.enqueue(
      sse("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      })
    );
    controller.enqueue(sse("ping", { type: "ping" }));
  };

  const sendFooter = (controller: ReadableStreamDefaultController) => {
    controller.enqueue(
      sse("content_block_stop", { type: "content_block_stop", index: 0 })
    );
    controller.enqueue(
      sse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: outputTokens },
      })
    );
    controller.enqueue(sse("message_stop", { type: "message_stop" }));
  };

  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            if (!headersSent) { sendHeaders(controller); headersSent = true; }
            sendFooter(controller);
            finalize();
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const raw = trimmed.slice(5).trim();

            if (raw === "[DONE]") {
              if (!headersSent) { sendHeaders(controller); headersSent = true; }
              sendFooter(controller);
              finalize();
              controller.close();
              return;
            }

            let chunk: Record<string, unknown>;
            try { chunk = JSON.parse(raw); } catch { continue; }

            if (!headersSent) {
              msgId = `msg_${String(chunk.id ?? "").replace("chatcmpl-", "") || Date.now()}`;
              sendHeaders(controller);
              headersSent = true;
            }

            const choices = chunk.choices as Array<{ delta?: { content?: string } }> | undefined;
            const content = choices?.[0]?.delta?.content;
            if (content) {
              outputTokens++;
              controller.enqueue(
                sse("content_block_delta", {
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text: content },
                })
              );
            }
          }
        }
      } catch (err) {
        finalize();
        controller.error(err);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
      finalize();
    },
  });
}

// ─── POST /api/v1/[slug]/v1/messages ─────────────────────────────────────────

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

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    // ── Translate Anthropic → OpenAI ──────────────────────────────────────────
    const openAIMessages = anthropicToOpenAIMessages(body);
    if (openAIMessages.filter((m) => m.role !== "system").length === 0) {
      return NextResponse.json(
        { error: { message: "messages array is required", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    // ── Proxy to Modal ────────────────────────────────────────────────────────
    const modalUrl = process.env.MODAL_API_URL;
    if (!modalUrl) {
      return NextResponse.json(
        { error: { message: "Inference backend not configured", type: "configuration_error" } },
        { status: 503 }
      );
    }

    const modalHeaders = buildModalHeaders();
    if (!modalHeaders) {
      return NextResponse.json(
        { error: { message: "Inference backend credentials not configured", type: "configuration_error" } },
        { status: 503 }
      );
    }

    const stream = body.stream === true;

    const injectedMessages = injectSpaceInstructions(
      openAIMessages,
      space.name,
      space.customInstructions
    );

    const { messages: messagesWithSearch } = await augmentMessagesWithWebSearch(
      modalUrl,
      modalHeaders,
      space.model!.model.modelId,
      injectedMessages
    );

    const forwardBody = {
      model: space.model!.model.modelId,
      messages: messagesWithSearch,
      stream,
      ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
      ...(body.temperature !== undefined && { temperature: body.temperature }),
      ...(body.top_p !== undefined && { top_p: body.top_p }),
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
          { error: { message: `Inference timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s.`, type: "timeout" } },
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

    // Model name shown in Anthropic responses (cosmetic; clients may display it)
    const modelDisplayName = "qwen3-1.7b";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-api-key, anthropic-version, anthropic-beta",
      "Access-Control-Expose-Headers":
        "X-Fair-Share-Exceeded, X-Fair-Share-Limit, X-Fair-Share-Used, X-Overflow-Limit, X-Overflow-Remaining",
      ...quotaHeaders,
    };

    // ── Streaming ─────────────────────────────────────────────────────────────
    if (stream && upstream.body) {
      const spaceId = space.id;
      const keyId = userKey.id;

      const anthropicStream = transformOpenAIToAnthropicStream(
        upstream.body,
        modelDisplayName,
        slotId,
        () => {
          const elapsed = Date.now() - startedAt;
          void recordSpaceUsage(spaceId, elapsed);
          void recordKeyUsage(keyId, elapsed);
        }
      );
      slotId = null;

      return new NextResponse(anthropicStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          ...corsHeaders,
        },
      });
    }

    // ── Non-streaming ─────────────────────────────────────────────────────────
    const elapsed = Date.now() - startedAt;
    const data = (await upstream.json()) as Record<string, unknown>;
    await Promise.all([
      recordSpaceUsage(space.id, elapsed),
      recordKeyUsage(userKey.id, elapsed),
    ]);

    return NextResponse.json(
      openAIToAnthropicResponse(data, modelDisplayName),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[Anthropic messages error]", err);
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
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-api-key, anthropic-version, anthropic-beta",
    },
  });
}
