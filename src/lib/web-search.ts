export type SearchResult = {
  title: string;
  snippet: string;
  url: string;
};

/** DuckDuckGo Instant Answer search (no API key). */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(trimmed)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!ddgRes.ok) throw new Error("DuckDuckGo API error");

    const data = await ddgRes.json();
    const results: SearchResult[] = [];

    if (data.AbstractText) {
      results.push({
        title: data.Heading ?? trimmed,
        snippet: data.AbstractText,
        url: data.AbstractURL ?? "",
      });
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 6)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(" - ")[0] ?? topic.Text.slice(0, 60),
            snippet: topic.Text,
            url: topic.FirstURL,
          });
        }
      }
    }

    if (data.Answer) {
      results.unshift({
        title: "Direct Answer",
        snippet: data.Answer,
        url: "",
      });
    }

    if (results.length === 0) {
      results.push({
        title: `Search: ${trimmed}`,
        snippet: "No instant results found. Answer from general knowledge if possible.",
        url: `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`,
      });
    }

    return results;
  } catch {
    return [
      {
        title: `Search: ${trimmed}`,
        snippet: "Web search failed. Answer from general knowledge if possible.",
        url: `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`,
      },
    ];
  }
}

export function formatSearchResultsForModel(query: string, results: SearchResult[]): string {
  const lines = results.slice(0, 6).map((r, i) => {
    const urlPart = r.url ? `\nURL: ${r.url}` : "";
    return `${i + 1}. ${r.title}\n${r.snippet}${urlPart}`;
  });
  return `Web search results for "${query}":\n\n${lines.join("\n\n")}`;
}
