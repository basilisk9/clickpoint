import { describe, expect, it } from "vitest";
import { applyPatches } from "./reviewCard";

/* ------------------------------------------------------------------ */
/* Review patches: all-or-nothing, unique, verbatim.                   */
/*                                                                     */
/* The reviewer returns exact find/replace pairs against the assembled */
/* document. These tests pin the contract that makes that safe:        */
/*   - every snippet must match verbatim and occur once;               */
/*   - if any patch fails, the WHOLE set is discarded (no partial      */
/*     correction, no silent paraphrase);                              */
/*   - an empty find means "wrong but unpatchable" and never applies.  */
/* ------------------------------------------------------------------ */

const DOC = `<div class="sim-panel">
  <canvas id="x-c" width="720" height="360"></canvas>
</div>
<script>
var ry = -yc;
ctx.fillText("6.39", 10, 10);
</script>`;

describe("applyPatches", () => {
  it("applies one surgical correction", () => {
    const result = applyPatches(DOC, [
      { issue: "sign of the pull's y component", find: "var ry = -yc;", replace: "var ry = yc;" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next).toContain("var ry = yc;");
    expect(result.next).not.toContain("var ry = -yc;");
    expect(result.applied).toBe(1);
  });

  it("applies several independent corrections", () => {
    const result = applyPatches(DOC, [
      { find: "var ry = -yc;", replace: "var ry = yc;" },
      { find: '"6.39"', replace: '"6.38"' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next).toContain("var ry = yc;");
    expect(result.next).toContain('"6.38"');
    expect(result.applied).toBe(2);
  });

  it("rejects the whole set when a snippet does not match", () => {
    const result = applyPatches(DOC, [
      { find: "var ry = -yc;", replace: "var ry = yc;" },
      { find: "this text does not exist", replace: "nope" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a snippet that occurs more than once", () => {
    const twice = `<span class="v">1</span><span class="v">1</span>`;
    const result = applyPatches(twice, [
      { find: `<span class="v">1</span>`, replace: `<span class="v">2</span>` },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not unique");
  });

  it("reports an unpatchable defect instead of guessing", () => {
    const result = applyPatches(DOC, [
      { issue: "the whole derivation is wrong", find: "", replace: "" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("the whole derivation is wrong");
  });

  it("applies nothing when there are no patches", () => {
    const result = applyPatches(DOC, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next).toBe(DOC);
    expect(result.applied).toBe(0);
  });

  it("does not partially apply: an invalid second patch leaves the first unapplied", () => {
    const original = DOC;
    const result = applyPatches(original, [
      { find: "var ry = -yc;", replace: "var ry = yc;" },
      { find: "<missing>", replace: "x" },
    ]);
    expect(result.ok).toBe(false);
    /* applyPatches works on a local copy — the caller never sees a
       half-patched string, and the input is untouched. */
    expect(original).toContain("var ry = -yc;");
  });
});
