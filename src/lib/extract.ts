import JSZip from "jszip";

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
]);

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function slideXmlToText(xml: string) {
  const bits = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) =>
    decodeXmlEntities(match[1]),
  );
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

async function extractPdf(buffer: Buffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

async function extractPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const pages: string[] = [];
  for (const name of slides) {
    const xml = await zip.files[name].async("string");
    const text = slideXmlToText(xml);
    if (text) pages.push(text);
  }
  return pages.join("\n\n");
}

export async function extractNotesFromUpload(file: File): Promise<string> {
  const type = file.type || "";
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    return (await extractPdf(buffer)).trim();
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  ) {
    return (await extractPptx(buffer)).trim();
  }

  if (TEXT_TYPES.has(type) || name.endsWith(".txt") || name.endsWith(".md")) {
    return buffer.toString("utf8").trim();
  }

  throw new Error("Upload a PDF, PPTX, or text file.");
}
