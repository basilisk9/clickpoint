import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { buildCardDocument } from "./cardDocument";
import { BARE_LATEX, stripCodeBlocks } from "./verifyCard.testUtil";
import type { HtmlCard } from "./types";

/* ------------------------------------------------------------------ */
/* Card verification — errors only, never content.                     */
/*                                                                     */
/* The card is opaque HTML: the pipeline deliberately never judges      */
/* what a card says (that judgment was the old architecture's reviewer, */
/* and its pass-seams were the failure class this rebuild deletes).     */
/* What MUST be true, mechanically, is that the card RUNS: the page     */
/* executes, every control can be dragged without a throw, the canvas    */
/* paints, and the document wasn't cut off mid-write.                   */
/*                                                                     */
/* This runs the card in a real headless Chromium through the SAME      */
/* document assembly the learner's iframe gets (fonts → KaTeX →         */
/* unlayered macro CSS → @layer ai model CSS → fragment), so a pass     */
/* here is a pass in production. The DOM-implementation dance the old   */
/* simProbe shim did (fake elements, proxied contexts) is gone: real    */
/* browser, real failures.                                             */
/*                                                                     */
/* A truncated card throws the moment this loads — unclosed <script>,   */
/* unterminated function — which is why truncation needs no separate     */
/* detector in the new world: broken HTML is loud, and the retry ladder */
/* catches it with 100% mechanical reliability.                         */
/*                                                                     */
/* Server-side only: the pipeline is the sole caller; nothing in the    */
/* client module graph may reach puppeteer-core, and this file must      */
/* never be imported from a component.                                  */
/* ------------------------------------------------------------------ */

export type CardVerdict =
  | { ok: true }
  | { ok: false; reason: string };



/* Returns null when no browser exists. Vercel's runtime has no Chromium and
   cannot install one, so absence is a supported deployment state, not an
   error: the mechanical checks are skipped and the card ships as generated.
   It still guards every host that does have a binary (local dev, Docker,
   fly.io). */
async function findChromium(): Promise<string | null> {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    /* Windows box without Chrome: Edge is Chromium and drives fine. */
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

/* The page-side error collector. Declaration-merged onto Window from the
   page's own injected script, so the evaluate() read below is typed
   without inline-casting an unvalidated global. */
type ErrorWindow = typeof globalThis & {
  __cpErrors?: string[];
};

/* Browser noise that is not a card defect. The ResizeObserver message is a
   spec notice the browser emits when a resize loop settles; it says nothing
   about the card being wrong, and treating it as a failure re-rolls good
   cards for free. Same for the passive-listener notice. */
const BENIGN_ERROR = /ResizeObserver loop|non-passive event listener/i;

function realErrors(list: string[]) {
  return list.filter((line) => !BENIGN_ERROR.test(line));
}

export async function verifyCard(card: HtmlCard): Promise<CardVerdict> {
  /* Static checks first — they need no browser and catch the gross
     failures before a process is spawned. */
  if (BARE_LATEX.test(stripCodeBlocks(card.html))) {
    return { ok: false, reason: "bare LaTeX commands in prose outside math delimiters" };
  }

  /* The document the learner gets, minus host asset links: setContent()
     has no base URL, and the mechanical checks are behavioural (JS runs,
     controls drag, canvas paints) rather than typographic → so assets are
     off here. Ordering and layer law still come from the shared builder. */
  const doc = buildCardDocument(card.html, { assets: false, heightReporter: false });

  const executablePath = await findChromium();
  if (!executablePath) {
    /* No browser on this host (Vercel): behavioural checks are impossible.
       Static checks above still ran; report pass so the card is not
       re-rolled forever for a missing binary. */
    console.warn(
      "[clickpoint] verification skipped: no Chromium on this host (set CHROMIUM_PATH to enable).",
    );
    return { ok: true };
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    /* The card is untrusted content: it runs with no capabilities beyond
       rendering. */
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    /* The card is forbidden external resources; a request that fires is
       itself a verification failure. */
    const networkViolations: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http:") || url.startsWith("https:")) {
        if (!networkViolations.length) networkViolations.push(url);
        void request.abort();
      }
    });

    await page.setContent(doc, { waitUntil: "domcontentloaded" });
    /* Give synchronous effects (canvas paints, requestAnimationFrame
       draws) one moment to settle before judging. */
    const { promise: settleTick, resolve: settleDone } = Promise.withResolvers<void>();
    setTimeout(settleDone, 150);
    await settleTick;

    /* 1. Execution: any script error is disqualifying. evaluate() must
       return a serializable value — the window object itself cannot
       cross the puppeteer boundary, so read the array directly in-page. */
    const scriptErrors = (await page.evaluate(
      () => (window as ErrorWindow).__cpErrors ?? [],
    )) as string[];
    const fatal = realErrors(scriptErrors);
    if (fatal.length) {
      return { ok: false, reason: `script errors: ${fatal[0]}` };
    }

    /* 2. Controls: every range input gets dragged min→max→mid; every
       button clicked. A handler that throws lands in __cpErrors through
       window.onerror and fails check (1) on the next read. */
    const controlCount = await page.evaluate(() => {
      const sliders = Array.from(document.querySelectorAll('input[type="range"]'));
      for (const slider of sliders) {
        const el = slider as HTMLInputElement;
        const min = Number(el.min) || 0;
        const max = Number(el.max) || 100;
        for (const value of [min, max, (min + max) / 2]) {
          el.value = String(value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      document.querySelectorAll("button").forEach((button) => {
        try {
          button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        } catch {
          /* throws are captured by window.onerror */
        }
      });
      return sliders.length;
    });

    /* Re-read errors after exercising the controls — read in-page for the
       same serialization reason as above. */
    const postDragErrors = (await page.evaluate(
      () => (window as ErrorWindow).__cpErrors ?? [],
    )) as string[];
    const dragFatal = realErrors(postDragErrors);
    if (dragFatal.length) {
      return { ok: false, reason: `control interaction threw: ${dragFatal[0]}` };
    }

    /* 3. Canvas paint: pixel readback — an all-zero buffer means the sim
       never drew (a "complete runnable object" that paints nothing teaches
       nothing and usually means JS died silently). A card with no canvas
       but also no sliders failed to build any interactive at all. */
    const canvasResults = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll("canvas"));
      const results: Array<{ id: string; painted: boolean }> = [];
      const seen = new Set<string>();
      for (const canvas of canvases) {
        const el = canvas as HTMLCanvasElement;
        const key = el.id || el.className || `canvas-${seen.size}`;
        seen.add(key);
        let painted = false;
        try {
          const ctx = el.getContext("2d");
          if (ctx) {
            const data = ctx.getImageData(0, 0, el.width, el.height).data;
            for (let i = 0; i < data.length; i += 40) {
              if (data[i + 3] > 0 && (data[i] || data[i + 1] || data[i + 2])) {
                painted = true;
                break;
              }
            }
          }
        } catch {
          painted = false;
        }
        results.push({ id: key, painted });
      }
      return results;
    });

    const unpainted = canvasResults.filter((c) => !c.painted);
    if (unpainted.length === 0 && canvasResults.length === 0 && controlCount === 0) {
      return { ok: false, reason: "card has no interactive element (no canvas, no sliders)" };
    }
    if (unpainted.length) {
      return {
        ok: false,
        reason: `canvas did not paint: ${unpainted[0].id}`,
      };
    }

    /* 4. KaTeX parse discipline lives in the client host
       (renderMathInElement with throwOnError:false) — verification
       instead checks the pure static rule above (bare LaTeX in prose) plus
       1–3. A malformed $...$ string in the card renders red text but the
       card itself works; that is the documented trade the host makes, and
       it stays on the read path. */

    /* 5. External resources: any http(s) request the card fired. */
    if (networkViolations.length) {
      return { ok: false, reason: `external resource requested: ${networkViolations[0]}` };
    }

    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `verification could not run: ${reason}` };
  } finally {
    await browser.close();
  }
}
