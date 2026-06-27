import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/web-search";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");

  if (!query) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  const results = await searchWeb(query);
  return NextResponse.json({ results, query });
}
