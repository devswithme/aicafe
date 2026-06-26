import { createHash, randomBytes } from "crypto";

const KEY_PREFIX = "aicafe_";

/** Prefix Claude Code accepts for `ANTHROPIC_API_KEY` (x-api-key header). */
export const CLAUDE_CODE_KEY_PREFIX = "sk-ant-api03-";

/** Generate a new raw API key like `aicafe_<32 random hex chars>`. */
export function generateRawKey(): string {
  return KEY_PREFIX + randomBytes(16).toString("hex");
}

/** SHA-256 hash of the raw key to store in the DB. */
export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * The displayable prefix shown to the user after the key is generated —
 * first 14 chars of the raw key (e.g. `aicafe_a1b2c3…`).
 */
export function keyPrefix(raw: string): string {
  return raw.slice(0, 14);
}

/**
 * Normalize credentials from various client formats to the raw `aicafe_…` key.
 *
 * Accepts:
 * - `aicafe_…` (direct)
 * - `sk-ant-api03-aicafe_…` (Claude Code ANTHROPIC_API_KEY wrapper)
 * - `sk-ant-aicafe_…` (legacy wrapper)
 */
export function normalizeApiKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(KEY_PREFIX)) return trimmed;

  const embedded = trimmed.match(/aicafe_[a-f0-9]+/i);
  if (embedded) return embedded[0];

  return null;
}

/** Format a raw `aicafe_…` key for Claude Code's `ANTHROPIC_API_KEY` env var. */
export function toClaudeCodeApiKey(rawKey: string): string {
  if (rawKey.startsWith(CLAUDE_CODE_KEY_PREFIX)) return rawKey;
  return `${CLAUDE_CODE_KEY_PREFIX}${rawKey}`;
}
