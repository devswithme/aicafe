/**
 * Shared auth / quota / streaming helpers used by all inference API routes:
 *   - /api/v1/[slug]/chat/completions  (OpenAI-compatible)
 *   - /api/v1/[slug]/v1/messages       (Anthropic-compatible, for Claude Code)
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  acquireInferenceSlot,
  releaseInferenceSlot,
  MAX_CONCURRENT_USERS_PER_SPACE,
} from "@/lib/concurrency";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkSpaceQuota, getSpaceComputeContext, recordSpaceUsage } from "@/lib/usage";
import { computeSurplusSeconds, evaluateKeyQuotaAccess } from "@/lib/key-quota";
import { hashKey, normalizeApiKey } from "@/lib/api-keys";

export { recordSpaceUsage };
export const UPSTREAM_TIMEOUT_MS = 45_000;

// ─── Prisma result type ────────────────────────────────────────────────────────

export type SpaceForInference = Prisma.SpaceGetPayload<{
  include: {
    model: { include: { model: true } };
    subscription: true;
  };
}>;

export type ValidatedKey = {
  id: string;
  secondsLimit: number;
  secondsUsed: number;
};

// ─── IP helpers ───────────────────────────────────────────────────────────────

export function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function ipInCIDR(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [network, bits] = cidr.split("/");
  const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(network) & mask);
}

export async function isIPAllowed(spaceId: string, clientIP: string): Promise<boolean> {
  const whitelist = await prisma.iPWhitelist.findMany({ where: { spaceId } });
  if (whitelist.length === 0) return true;
  return whitelist.some((e) => ipInCIDR(clientIP, e.ipRange));
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

/** Validate a raw `aicafe_...` key against the DB. */
export async function validateApiKeyRaw(spaceId: string, rawKey: string | null) {
  const normalized = normalizeApiKey(rawKey);
  if (!normalized) return null;
  const h = hashKey(normalized);
  const key = await prisma.spaceUserKey.findFirst({
    where: { spaceId, keyHash: h, revokedAt: null },
  });
  return key ?? null;
}

/** Extract a raw key from `Authorization: Bearer <key>`. */
export function extractBearerKey(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return normalizeApiKey(trimmed.slice(7).trim());
  }
  return normalizeApiKey(trimmed);
}

/**
 * Extract an `aicafe_…` key from any header Claude Code / gateways may send.
 * Checks x-api-key first, then Authorization (Bearer or raw).
 */
export function extractApiKeyFromRequest(req: NextRequest): string | null {
  const xApiKey = normalizeApiKey(req.headers.get("x-api-key"));
  if (xApiKey) return xApiKey;

  const auth = extractBearerKey(req.headers.get("authorization"));
  if (auth) return auth;

  // Some proxies forward under alternate names
  const apiKeyHeader = normalizeApiKey(req.headers.get("api-key"));
  if (apiKeyHeader) return apiKeyHeader;

  return null;
}

export function unauthorizedKeyResponse(reason: "missing" | "invalid") {
  const message =
    reason === "missing"
      ? "No API key provided. Use ANTHROPIC_BASE_URL with ANTHROPIC_API_KEY (sk-ant-api03-aicafe_…) or ANTHROPIC_AUTH_TOKEN (aicafe_…)."
      : "API key not valid for this space. Open this space's chat → API docs → Regenerate key and copy the new aicafe_… key.";
  return NextResponse.json(
    { error: { message, type: "authentication_error" } },
    { status: 401 }
  );
}

/** Increment per-user key usage in seconds (fire-and-forget). */
export async function recordKeyUsage(keyId: string, elapsedMs: number): Promise<void> {
  const seconds = Math.max(1, Math.ceil(elapsedMs / 1000));
  await prisma.spaceUserKey
    .update({ where: { id: keyId }, data: { secondsUsed: { increment: seconds } } })
    .catch(() => {});
}

// ─── Stream helpers ───────────────────────────────────────────────────────────

export function wrapStreamWithSlotRelease(
  body: ReadableStream<Uint8Array>,
  slotId: string,
  onFinalize: () => void
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let finalized = false;

  const finalize = () => {
    if (finalized) return;
    finalized = true;
    void releaseInferenceSlot(slotId);
    onFinalize();
  };

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finalize();
          controller.close();
          return;
        }
        controller.enqueue(value);
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

// ─── Modal helpers ────────────────────────────────────────────────────────────

export function buildModalHeaders(): Record<string, string> | null {
  const key = process.env.MODAL_KEY;
  const secret = process.env.MODAL_SECRET;
  if (!key || !secret) return null;
  return {
    "Content-Type": "application/json",
    "Modal-Key": key,
    "Modal-Secret": secret,
  };
}

// ─── Pre-flight validation ────────────────────────────────────────────────────

export type PreflightOk = {
  ok: true;
  space: SpaceForInference;
  userKey: ValidatedKey;
  slotId: string;
  quotaHeaders: Record<string, string>;
};

export type PreflightFail = { ok: false; response: NextResponse };
export type PreflightResult = PreflightOk | PreflightFail;

/**
 * Run all auth / quota / concurrency checks shared by every inference route.
 *
 * @param slug       Space slug from the URL
 * @param rawKey     The raw `aicafe_...` key (from either `x-api-key` or `Authorization: Bearer`)
 * @param clientIP   Caller's IP address
 */
export async function runPreflightChecks(
  slug: string,
  rawKey: string | null,
  clientIP: string
): Promise<PreflightResult> {
  // ── Space lookup ────────────────────────────────────────────────────────────
  const space = await prisma.space.findUnique({
    where: { slug },
    include: { model: { include: { model: true } }, subscription: true },
  });

  if (!space) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Space not found or not active", type: "not_found" } },
        { status: 404 }
      ),
    };
  }

  if (!space.model) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "No AI model configured for this space", type: "model_not_configured" } },
        { status: 503 }
      ),
    };
  }

  // ── API key ─────────────────────────────────────────────────────────────────
  const normalizedKey = normalizeApiKey(rawKey);
  if (!normalizedKey) {
    return { ok: false, response: unauthorizedKeyResponse("missing") };
  }

  const userKey = await validateApiKeyRaw(space.id, normalizedKey);
  if (!userKey) {
    return { ok: false, response: unauthorizedKeyResponse("invalid") };
  }

  // ── IP whitelist ────────────────────────────────────────────────────────────
  if (!(await isIPAllowed(space.id, clientIP))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Access denied: your IP is not in the whitelist", type: "ip_not_whitelisted" } },
        { status: 403 }
      ),
    };
  }

  // ── Operating hours ─────────────────────────────────────────────────────────
  const now = new Date();
  const hour = now.getHours();
  if (hour < space.openHour || hour >= space.closeHour) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `This space is closed. Operating hours: ${space.openHour}:00–${space.closeHour}:00`,
            type: "outside_operating_hours",
          },
        },
        { status: 503 }
      ),
    };
  }

  // ── Schedule restriction ────────────────────────────────────────────────────
  if (space.subscription) {
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const { schedule } = space.subscription;
    const blocked =
      (schedule === "weekends" && !isWeekend) ||
      (schedule === "weekdays" && isWeekend);

    if (blocked) {
      const allowedDays = schedule === "weekends" ? "Saturdays and Sundays" : "Monday through Friday";
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: `This space is only available on ${allowedDays}. Upgrade to the Pro plan for every-day access.`,
              type: "outside_schedule",
            },
          },
          { status: 503 }
        ),
      };
    }
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const rl = checkRateLimit(space.id, clientIP);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Rate limit exceeded (${rl.limit} requests/min). Try again in ${rl.retryAfterSecs}s.`,
            type: "rate_limit_exceeded",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSecs),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": String(rl.remaining),
          },
        }
      ),
    };
  }

  // ── Plan quota ──────────────────────────────────────────────────────────────
  const quota = await checkSpaceQuota(space.id);
  if (!quota.ok) {
    const message =
      quota.reason === "no_subscription"
        ? "No active plan for this space. Choose a package to enable the API."
        : quota.reason === "trial_exhausted"
          ? "Free trial compute exhausted. Choose a package to continue using the API."
          : "Monthly compute quota exhausted for this plan. Upgrade or wait for the next cycle.";
    return {
      ok: false,
      response: NextResponse.json({ error: { message, type: quota.reason } }, { status: 402 }),
    };
  }

  const computeCtx = await getSpaceComputeContext(space.id);
  if (!computeCtx) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: "No active plan for this space. Choose a package to enable the API.",
            type: "no_subscription",
          },
        },
        { status: 402 }
      ),
    };
  }

  const spaceKeys = await prisma.spaceUserKey.findMany({
    where: { spaceId: space.id, revokedAt: null },
    select: { secondsUsed: true, secondsLimit: true },
  });
  const surplusSeconds = computeSurplusSeconds(
    computeCtx.secondsIncl,
    computeCtx.secondsUsed,
    spaceKeys
  );
  const keyQuota = evaluateKeyQuotaAccess(userKey, surplusSeconds);

  if (!keyQuota.allowed) {
    const message =
      keyQuota.reason === "overflow_cap_exceeded"
        ? `Your personal compute limit of ${keyQuota.overflowLimit}s has been reached for this period. The quota resets when the space owner renews the plan.`
        : "Your fair share is used up and there is no surplus compute available right now. Try again later or wait for the next plan cycle.";
    return {
      ok: false,
      response: NextResponse.json({ error: { message, type: keyQuota.reason } }, { status: 402 }),
    };
  }

  const quotaHeaders: Record<string, string> = {
    "X-Fair-Share-Limit": String(userKey.secondsLimit),
    "X-Fair-Share-Used": String(userKey.secondsUsed),
    "X-Overflow-Limit": String(keyQuota.overflowLimit),
    "X-Overflow-Remaining": String(keyQuota.overflowRemaining),
  };
  if (keyQuota.fairShareExceeded) {
    quotaHeaders["X-Fair-Share-Exceeded"] = "true";
  }

  // ── Concurrency slot ────────────────────────────────────────────────────────
  const slot = await acquireInferenceSlot(space.id);
  if (!slot) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `This space is at capacity (${MAX_CONCURRENT_USERS_PER_SPACE} concurrent users). Please try again shortly.`,
            type: "concurrency_limit_exceeded",
            limit: MAX_CONCURRENT_USERS_PER_SPACE,
          },
        },
        { status: 429 }
      ),
    };
  }

  return {
    ok: true,
    space,
    userKey: { id: userKey.id, secondsLimit: userKey.secondsLimit, secondsUsed: userKey.secondsUsed },
    slotId: slot.id,
    quotaHeaders,
  };
}
