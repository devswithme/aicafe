import { NextRequest, NextResponse } from "next/server";
// pdf-parse@1.x runs a self-test on require("pdf-parse") that fails at runtime.
// Importing the internal lib directly skips that test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);

    return NextResponse.json({ text: data.text.slice(0, 12000), pages: data.numpages });
  } catch (err) {
    console.error("[parse-pdf error]", err);
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
  }
}
