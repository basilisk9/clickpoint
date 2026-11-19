/* Test seams for verifyCard — the checks are imported by the test suite,
   while verifyCard itself stays a server-only serverless entry point
   (it launches Chromium; importing it anywhere in a test would try to
   spawn a browser). extractCardParts and the bare-LaTeX detector are
   pure, so they live here and verifyCard imports them from here too —
   one implementation, two consumers. */

/* Same fragment surgery the client host does: styles and scripts come
   out of body flow so injection order is guaranteed. */
export function extractCardParts(html: string) {
  const styles: string[] = [];
  const scripts: string[] = [];
  const body = html
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => {
      styles.push(css);
      return "";
    })
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_m, js: string) => {
      scripts.push(js);
      return "";
    });
  return { body: body.trim(), styles, scripts };
}

/* Bare LaTeX pasted into prose outside math delimiters — the model habit
   the old normalizer had to repair (asRich wrapped it in $$ when text had
   backslash commands and no dollars at all). Detected as an error so the
   retry regenerates instead of the host shipping raw "\frac{}" to the
   learner. Code blocks are exempt: <code>/<pre> legitimately hold LaTeX. */
export const BARE_LATEX =
  /\\(?:frac|sqrt|int|sum|vec|Delta|alpha|beta|omega|lambda|rho|nu|pi|theta|phi|mu|tau|gamma|partial|cdot|times|approx|propto|le|ge|ne|infty|hat|bar|dot|ddot|prime)\b/;

export function stripCodeBlocks(html: string) {
  return html
    .replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]*\$/g, "");
}
