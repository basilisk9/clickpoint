/* ------------------------------------------------------------------ */
/* Banner SVG sanitizer.                                               */
/*                                                                     */
/* The card path no longer sanitizes HTML — cards are typed data now,  */
/* so there is nothing to sanitize. The pathway banner still carries a  */
/* small model-authored SVG, so it keeps its own narrow guard.          */
/* ------------------------------------------------------------------ */

export function sanitizeBannerSvg(svg: string) {
  const trimmed = svg.trim();
  if (!trimmed.toLowerCase().includes("<svg")) {
    return `<svg viewBox="0 0 420 180" xmlns="http://www.w3.org/2000/svg"></svg>`;
  }
  return trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
}
