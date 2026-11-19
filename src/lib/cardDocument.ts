import { CARD_CSS } from "./cardCss";

/* ------------------------------------------------------------------ */
/* The card document — assembled ONCE, for every consumer.             */
/*                                                                     */
/* Three things read a rendered card: the learner's iframe, the         */
/* mechanical verifier, and the semantic reviewer. If any of them sees */
/* a differently-assembled document, "the reviewer sees what the user  */
/* sees" is false. So assembly lives here and nowhere else.            */
/*                                                                     */
/* Injection order is the render contract:                              */
/*   1. self-hosted fonts + KaTeX                                           */
/*   2. unlayered base reset + MACRO css (wins every collision)        */
/*   3. the model's <style>, wrapped in `@layer ai`                    */
/*   4. body markup, then the model's <script>, then math rendering    */
/* ------------------------------------------------------------------ */

/* Pulls <style> and <script> tags out of the model's fragment so they
   can be placed precisely. A model that emitted them in body order still
   gets the guaranteed injection order. */
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

export type CardDocumentOptions = {
  /* Host asset links (fonts, KaTeX). Off for the mechanical verifier:
     it runs from setContent() where relative URLs have no base, and its
     checks are behavioural (JS, drags, canvas), not typographic. The
     reviewer and the learner both get them on. */
  assets?: boolean;
  /* The height reporter that sizes the iframe to its content. Pure host
     chrome; off for the verifier, on for the learner. */
  heightReporter?: boolean;
};

export function buildCardDocument(
  html: string,
  options: CardDocumentOptions = {},
): string {
  const assets = options.assets ?? true;
  const heightReporter = options.heightReporter ?? true;
  const { body, styles, scripts } = extractCardParts(html);

  const assetLinks = assets
    ? `<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/katex/katex.min.css">
`
    : "";
  const assetScripts = assets
    ? `<script src="/katex/katex.min.js"></script>
<script src="/katex/auto-render.min.js"></script>
`
    : "";

  const reporter = heightReporter
    ? `
    reportHeight();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(reportHeight).catch(function () {});
    }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { reportHeight(); });
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    }
    setTimeout(reportHeight, 250);
    setTimeout(reportHeight, 900);
    window.addEventListener("resize", reportHeight);`
    : "";

  const reporterFn = heightReporter
    ? `function reportHeight() {
    var d = document.documentElement;
    var b = document.body;
    var h = Math.max(
      d.scrollHeight, d.offsetHeight,
      b ? b.scrollHeight : 0, b ? b.offsetHeight : 0
    );
    parent.postMessage({ type: "cp-height", height: h }, "*");
  }`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${assetLinks}<style>
@layer ai;
${CARD_CSS}
html, body { margin: 0; background: transparent; }
</style>
<style class="ai-styles">
@layer ai {
${styles.join("\n")}
}
</style>
</head>
<body>
${body}
${assetScripts}<script>
(function () {
  ${reporterFn}
  function ready() {
    try {
      if (window.renderMathInElement) {
        window.renderMathInElement(document.body, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      }
    } catch (e) {
      console.error("KaTeX auto-render:", e);
    }

${scripts.join("\n;\n")}
${reporter}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
</script>
</body>
</html>`;
}
