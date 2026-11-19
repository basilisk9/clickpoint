"use client";

import katex from "katex";
import { useMemo } from "react";
import { cn } from "@/lib/cn";

/* KaTeX rendered at the React layer, not by the model. A card supplies the
   LaTeX string; this component guarantees it renders correctly every time.
   That is the whole point of typed content: the model never touches the
   render path, so it cannot produce a half-rendered equation. */

/* Models occasionally wrap a bare-LaTeX field in its own delimiters even
   though the field is already display mode. KaTeX then sees a literal "$"
   and throws a parse error, so strip one layer of delimiters defensively. */
function stripDelimiters(src: string) {
  let out = src.trim();
  if (out.startsWith("$$") && out.endsWith("$$") && out.length > 4) {
    out = out.slice(2, -2).trim();
  } else if (out.startsWith("\\[") && out.endsWith("\\]")) {
    out = out.slice(2, -2).trim();
  } else if (out.startsWith("\\(") && out.endsWith("\\)")) {
    out = out.slice(2, -2).trim();
  } else if (out.startsWith("$") && out.endsWith("$") && out.length > 2) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

export function Tex({
  children,
  block = false,
  className = "",
}: {
  children: string;
  block?: boolean;
  className?: string;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(stripDelimiters(children), {
        displayMode: block,
        throwOnError: false,
        strict: false,
      }),
    [children, block],
  );

  /* One element for both modes. Rich() is called inside <p>, <td> and <span>
     — every prose field in the card — so a block-level <div> here is invalid
     HTML: the browser closes the paragraph before it, React hydrates a tree
     the browser never built, and the page throws a hydration error. KaTeX's
     own display wrapper is a block-level <span>, so display mode is expressed
     in CSS and the markup stays legal in every caller. */
  return (
    <span
      className={cn(block && "block overflow-x-auto", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
