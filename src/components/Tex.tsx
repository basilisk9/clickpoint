"use client";

import katex from "katex";
import { useMemo } from "react";

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

  if (block) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
