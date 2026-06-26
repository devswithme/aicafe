import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  try {
    // DuckDuckGo Instant Answer API (no API key required)
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;

    const ddgRes = await fetch(ddgUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 60 },
    });

    if (!ddgRes.ok) throw new Error("DuckDuckGo API error");

    const data = await ddgRes.json();

    const results: { title: string; snippet: string; url: string }[] = [];

    // AbstractText (main result)
    if (data.AbstractText) {
      results.push({
        title: data.Heading ?? query,
        snippet: data.AbstractText,
        url: data.AbstractURL ?? "",
      });
    }

    // Related topics
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

    // Answer
    if (data.Answer) {
      results.unshift({
        title: "Direct Answer",
        snippet: data.Answer,
        url: "",
      });
    }

    if (results.length === 0) {
      // Fallback: just return the search URL
      results.push({
        title: `Search: ${query}`,
        snippet: `No instant results found. Search DuckDuckGo for more information.`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      });
    }

    return NextResponse.json({ results, query });
  } catch (err) {
    return NextResponse.json(
      {
        results: [
          {
            title: `Search: ${query}`,
            snippet: "Unable to fetch search results. Please try again.",
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          },
        ],
        query,
      },
      { status: 200 }
    );
  }
}
