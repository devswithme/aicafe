type ChatMessage = { role: string; content: string };

/**
 * Prepend venue-specific system instructions to a message list.
 * Used by the completions API so both the web chat and external API clients
 * automatically get the space owner's custom knowledge/context.
 */
export function injectSpaceInstructions(
  messages: ChatMessage[],
  spaceName: string,
  customInstructions: string | null | undefined
): ChatMessage[] {
  const instructions = customInstructions?.trim();
  if (!instructions) return messages;

  const spaceSystem = [
    `You are the AI assistant for "${spaceName}".`,
    "Use the following venue-specific knowledge when answering questions:",
    "",
    instructions,
  ].join("\n");

  const systemIdx = messages.findIndex((m) => m.role === "system");
  if (systemIdx === -1) {
    return [{ role: "system", content: spaceSystem }, ...messages];
  }

  const updated = [...messages];
  const existing = updated[systemIdx].content;
  updated[systemIdx] = {
    role: "system",
    content: `${spaceSystem}\n\n---\n\n${existing}`,
  };
  return updated;
}
