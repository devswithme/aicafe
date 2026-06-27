import { UPSTREAM_TIMEOUT_MS } from "@/lib/inference-middleware";
import { formatSearchResultsForModel, searchWeb } from "@/lib/web-search";

export type AgentMessage = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

const WEB_SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "web_search",
    description:
      "Search the web for current or factual information: news, weather, prices, business hours, events, product details, or anything that may be outdated in training data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Concise search query",
        },
      },
      required: ["query"],
    },
  },
};

const SEARCH_SYSTEM_APPEND = [
  "You can search the web with the web_search tool when the user needs current or uncertain factual information.",
  "Use it for news, today's weather, live prices, hours, recent events, or specific facts you are not confident about.",
  "After receiving search results, answer using that information and mention sources when helpful.",
].join(" ");

async function callModal(
  modalUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${modalUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

function withSearchSystemPrompt(messages: AgentMessage[]): AgentMessage[] {
  const systemIdx = messages.findIndex((m) => m.role === "system");
  if (systemIdx === -1) {
    return [{ role: "system", content: SEARCH_SYSTEM_APPEND }, ...messages];
  }
  const updated = [...messages];
  updated[systemIdx] = {
    ...updated[systemIdx],
    content: `${updated[systemIdx].content}\n\n${SEARCH_SYSTEM_APPEND}`,
  };
  return updated;
}

function lastUserContent(messages: AgentMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.content?.trim()) return m.content.trim();
  }
  return null;
}

function parseRouterJson(text: string): string | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned) as { search?: string | null };
    if (typeof parsed.search === "string" && parsed.search.trim()) {
      return parsed.search.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/** Lightweight router when native tool calling is unavailable. */
async function inferSearchQuery(
  messages: AgentMessage[],
  modalUrl: string,
  headers: Record<string, string>,
  model: string
): Promise<string | null> {
  const userText = lastUserContent(messages);
  if (!userText) return null;

  const res = await callModal(modalUrl, headers, {
    model,
    messages: [
      {
        role: "system",
        content:
          'Decide if a web search is needed. Reply with JSON only: {"search": null} if general knowledge suffices, or {"search": "query"} if current/specific web info is needed (news, today\'s weather, prices, hours, recent events).',
      },
      { role: "user", content: userText },
    ],
    stream: false,
    max_tokens: 120,
    temperature: 0,
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseRouterJson(text);
}

async function executeToolCalls(
  toolCalls: NonNullable<AgentMessage["tool_calls"]>
): Promise<AgentMessage[]> {
  const toolMessages: AgentMessage[] = [];
  for (const tc of toolCalls) {
    if (tc.function.name !== "web_search") continue;
    let query = "";
    try {
      const args = JSON.parse(tc.function.arguments) as { query?: string };
      query = args.query?.trim() ?? "";
    } catch {
      query = "";
    }
    const results = query ? await searchWeb(query) : [];
    toolMessages.push({
      role: "tool",
      tool_call_id: tc.id,
      content: formatSearchResultsForModel(query || "unknown", results),
    });
  }
  return toolMessages;
}

/**
 * Run tool-calling rounds (non-streaming) and return messages ready for the final completion.
 */
export async function augmentMessagesWithWebSearch(
  modalUrl: string,
  modalHeaders: Record<string, string>,
  model: string,
  messages: AgentMessage[],
  maxRounds = 3
): Promise<{ messages: AgentMessage[]; searched: boolean }> {
  let working = withSearchSystemPrompt(messages);
  let searched = false;

  for (let round = 0; round < maxRounds; round++) {
    const res = await callModal(modalUrl, modalHeaders, {
      model,
      messages: working,
      tools: [WEB_SEARCH_TOOL],
      tool_choice: "auto",
      stream: false,
    });

    if (!res.ok) break;

    const data = (await res.json()) as {
      choices?: Array<{ message?: AgentMessage }>;
    };
    const msg = data.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls ?? [];

    if (!toolCalls.length) break;

    searched = true;
    working.push({ role: "assistant", content: msg?.content ?? null, tool_calls: toolCalls });
    working.push(...(await executeToolCalls(toolCalls)));
  }

  if (!searched) {
    const query = await inferSearchQuery(messages, modalUrl, modalHeaders, model);
    if (query) {
      const results = await searchWeb(query);
      working.push({
        role: "system",
        content: formatSearchResultsForModel(query, results),
      });
      searched = true;
    }
  }

  return { messages: working, searched };
}
