import { describe, expect, it } from "vitest";
import { asAccent, asReveal } from "./pipeline";
import { BARE_LATEX, stripCodeBlocks } from "./verifyCard.testUtil";
import { extractCardParts } from "./verifyCard.testUtil";

/* ------------------------------------------------------------------ */
/* The envelope: the one structure the free-HTML card still has.        */
/*                                                                     */
/* The card itself is opaque — but the pipeline's thin JSON envelope    */
/* ({ reveal, accent, title, html }) is the boundary between "the model */
/* answered" and "a card exists", so its coercion rules get pinned      */
/* here: unknown accents degrade to pine, missing reveals stay honest   */
/* rather than fabricated, and the fragment contract (no <html>/<head>/ */
/* <body> shells) is enforced before storage.                           */
/* ------------------------------------------------------------------ */

describe("asAccent", () => {
  it("accepts the five legal accents", () => {
    expect(asAccent("pine")).toBe("pine");
    expect(asAccent("blood")).toBe("blood");
    expect(asAccent("cobalt")).toBe("cobalt");
    expect(asAccent("ember")).toBe("ember");
    expect(asAccent("gold")).toBe("gold");
  });

  it("degrades an unknown or missing accent to pine", () => {
    expect(asAccent("mauve")).toBe("pine");
    expect(asAccent(undefined)).toBe("pine");
    expect(asAccent(42)).toBe("pine");
  });
});

describe("asReveal", () => {
  it("carries a real declaration through", () => {
    const reveal = asReveal({
      misconception: "more slices means more pull",
      knob: "the N slider: the amber arrow never moves",
    });
    expect(reveal.misconception).toBe("more slices means more pull");
    expect(reveal.knob).toBe("the N slider: the amber arrow never moves");
  });

  it("marks a missing reveal honestly instead of inventing one", () => {
    const reveal = asReveal(undefined);
    expect(reveal.misconception).toBe("Not declared.");
    expect(reveal.knob).toBe("Not declared.");
  });

  it("survives non-object garbage", () => {
    const reveal = asReveal("nonsense");
    expect(reveal.misconception).toBe("Not declared.");
  });
});

describe("extractCardParts (the fragment contract)", () => {
  it("pulls styles and scripts out of body flow", () => {
    const { body, styles, scripts } = extractCardParts(
      `<style>.x { color: red }</style><p>hi</p><script>console.log(1)</script>`,
    );
    expect(body).toBe("<p>hi</p>");
    expect(styles).toEqual([".x { color: red }"]);
    expect(scripts).toEqual(["console.log(1)"]);
  });

  it("keeps multiple style and script blocks in order", () => {
    const { styles, scripts } = extractCardParts(
      `<style>a{}</style><style>b{}</style><script>1</script><script>2</script>`,
    );
    expect(styles).toEqual(["a{}", "b{}"]);
    expect(scripts).toEqual(["1", "2"]);
  });

  it("leaves markup with no style/script untouched", () => {
    const { body, styles, scripts } = extractCardParts("<div>x</div>");
    expect(body).toBe("<div>x</div>");
    expect(styles).toEqual([]);
    expect(scripts).toEqual([]);
  });
});

describe("bare-LaTeX detection (verifyCard static check)", () => {
  it("flags a LaTeX command in bare prose", () => {
    const prose = "the field is \\frac{Gm}{r^2} everywhere";
    expect(BARE_LATEX.test(prose)).toBe(true);
  });

  it("accepts the same command inside math delimiters", () => {
    const doc = "the field is $\\frac{Gm}{r^2}$ everywhere";
    expect(BARE_LATEX.test(stripCodeBlocks(doc))).toBe(false);
  });

  it("accepts LaTeX inside code and pre blocks", () => {
    const doc = "<code>\\frac{Gm}{r^2}</code><pre>\\sqrt{x}</pre>";
    expect(BARE_LATEX.test(stripCodeBlocks(doc))).toBe(false);
  });

  it("accepts prose with no LaTeX at all", () => {
    expect(BARE_LATEX.test(stripCodeBlocks("plain sentences here"))).toBe(false);
  });
});
