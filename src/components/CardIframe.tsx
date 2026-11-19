"use client";

import { useEffect, useRef, useState } from "react";
import { buildCardDocument } from "@/lib/cardDocument";

/* ------------------------------------------------------------------ */
/* CardIframe — the whole renderer for the one-shot card era.          */
/*                                                                     */
/* The card IS the HTML the model wrote. This component's only jobs:   */
/*                                                                     */
/*   1. Build the document the model was promised, in the exact order  */
/*      the prompt specifies: self-hosted fonts, KaTeX, the unlayered  */
/*      MACRO stylesheet (cardCss.ts), then the model's fragment with  */
/*      its <style> wrapped in `@layer ai { ... }`.                     */
/*                                                                     */
/*   2. Render it inside a sandboxed iframe with no same-origin rights, */
/*      so the card's CSS and JS literally cannot reach the app. The   */
/*      iframe wall replaces shadow-DOM + sanitizer + scoped-document  */
/*      shims — three security mechanisms the old architecture needed  */
/*      because the card lived in OUR document. It doesn't anymore.    */
/*                                                                     */
/*   3. Auto-size to content. The card is a full document with its own */
/*      header, bands and footer; giving it a fixed-height box would   */
/*      create a nested scrollbar and clip its header, which reads as  */
/*      a widget pasted into a page instead of a page. The iframe      */
/*      reports its scrollHeight and the host pins the element to it,  */
/*      so the card flows as one continuous document and the OUTER     */
/*      page owns the only scrollbar.                                  */
/* ------------------------------------------------------------------ */

export function CardIframe({
  html,
  title,
}: {
  html: string;
  title?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(0);

  const doc = buildCardDocument(html);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "cp-height"
      ) {
        const next = Number(event.data.height);
        if (Number.isFinite(next) && next > 0) {
          setHeight(Math.ceil(next));
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <iframe
      ref={frameRef}
      title={title ?? "Lesson card"}
      srcDoc={doc}
      sandbox="allow-scripts"
      /* No border, no rounding, no fixed height: the card is a document,
         and the page scrolls it as one. The height is measured inside
         and applied here, so there is never a nested scrollbar. */
      className="block w-full border-0 bg-transparent"
      style={{ height: height ? `${height}px` : "80vh" }}
    />
  );
}
