import JSZip from "jszip";
import { getDocumentProxy, extractText } from "unpdf";
import { MAX_UPLOAD_FILES } from "./constants";

/* Static map rather than a Set: the list is three literal string keys, and a
   lookup table is what tells a reader the membership is fixed. */
const TEXT_TYPES: Record<string, true> = {
  "text/plain": true,
  "text/markdown": true,
  "text/csv": true,
};

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

/* ------------------------------------------------------------------ */
/* One file, one format.                                               */
/*                                                                     */
/* A unit's notes are rarely one file, so this is called once per       */
/* upload and the results are concatenated in the order the learner     */
/* picked them. Every failure names the file it came from: with five    */
/* uploads, "Upload a PDF, PPTX, or text file" says nothing about which */
/* one to fix.                                                         */
/* ------------------------------------------------------------------ */

async function extractOne(file: File): Promise<string> {
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

  if (TEXT_TYPES[type] || name.endsWith(".txt") || name.endsWith(".md")) {
    return buffer.toString("utf8").trim();
  }

  throw new Error(`"${file.name}" is not a PDF, PPTX, or text file.`);
}

/* Reads every upload and joins the results. A file that yields no text at all
   is reported rather than skipped: silently generating a pathway from four of
   five files would look like the notes were ignored. */
export async function extractNotesFromUploads(files: File[]): Promise<string> {
  if (files.length > MAX_UPLOAD_FILES) {
    throw new Error(`Pick up to ${MAX_UPLOAD_FILES} files at a time.`);
  }

  const parts: string[] = [];
  for (const file of files) {
    const text = await extractOne(file);
    if (!text) {
      throw new Error(`"${file.name}" had no readable text in it.`);
    }
    parts.push(text);
  }
  return parts.join("\n\n").trim();
}
