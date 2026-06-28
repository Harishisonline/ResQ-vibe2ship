import { NextRequest } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB cap for uploads
const MAX_CHARS = 24_000; // limit text sent onward to the agent

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
]);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: "File too large (max 4 MB)" },
        { status: 413 }
      );
    }

    const name = file.name.toLowerCase();
    const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
    let text: string;

    if (isPdf) {
      // pdf-parse v2: instantiate a parser with the raw bytes and call getText.
      const { PDFParse } = await import("pdf-parse");
      const buf = new Uint8Array(await file.arrayBuffer());
      const parser = new PDFParse({ data: buf });
      try {
        const data = await parser.getText();
        text = data.text ?? "";
      } finally {
        await parser.destroy();
      }
    } else if (TEXT_TYPES.has(file.type) || name.match(/\.(txt|md|markdown|csv|json|html)$/)) {
      text = await file.text();
    } else {
      return Response.json(
        { error: "Unsupported file type. Use .txt, .md, .csv, .json, .html, or .pdf." },
        { status: 415 }
      );
    }

    text = text.replace(/\u0000/g, "").trim();
    if (!text) {
      return Response.json(
        { error: "Couldn't read any text from that file." },
        { status: 422 }
      );
    }

    const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n…[truncated]" : text;
    return Response.json({
      success: true,
      filename: file.name,
      text: truncated,
      chars: text.length,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
