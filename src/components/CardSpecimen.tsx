/* A real card, shown on the landing page.

   Every subject-matter string below — both pills, both heading lines, the lead,
   the invariant and the three moves — is copied verbatim from
   data/pathways/path_9e3494a17900af8d1b.json, card 01. Nothing here is written
   for the page, so any line can be checked against the app.

   Two deliberate exceptions: the section labels ("The invariant", "The moves")
   are the design system's, and the formula is the card's own LaTeX
   (F(x) = -\frac{dU}{dx}) typeset by hand. This is a server component with no
   JS, so it must not pull KaTeX into the landing bundle.

   The source card is longer than this: it also carries an interactive
   potential-energy landscape, a trick, quick checks and a scope block, all cut
   for width. The text is faithful; the card is not shown in full. */

const PILLS = ["MECHANICS · POTENTIAL ENERGY", "Force from slope"];

/* From formal.moves. Move 1's body is the only one that names the formula, so it
   is the one that carries the transposed LaTeX. */
const MOVES = [
  {
    name: "Turn slope into force",
    formula: "F(x) = \u2212dU/dx",
    body: "Differentiate with respect to position, then reverse the sign. A rising potential pushes toward smaller x; a falling potential pushes toward larger x.",
  },
  {
    name: "Classify a flat point",
    body: "Zero slope means zero force, so the point is an equilibrium. A minimum restores small displacements; a maximum drives them farther away.",
  },
  {
    name: "Read the small-oscillation rate",
    body: "Curvature acts like an effective stiffness: greater curvature means faster oscillations for the same mass. Use the curvature at the minimum, not the potential value there.",
  },
];

export function CardSpecimen() {
  return (
    <article className="overflow-hidden rounded-[24px] border border-[color:var(--card-line)] bg-[color:var(--card-surface)] shadow-[0_24px_70px_-40px_rgba(19,42,50,0.5)]">
      <div className="h-1.5" style={{ background: "var(--color-pine)" }} />

      <header className="px-6 pb-6 pt-7 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {PILLS.map((pill, index) => (
            <span
              key={pill}
              className={
                index === 0
                  ? "rounded-full px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider"
                  : "rounded-full border border-[color:var(--card-line)] bg-[color:var(--paper2)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[color:var(--ink-soft)]"
              }
              style={
                index === 0
                  ? { background: "var(--color-pine-soft)", color: "var(--color-pine-deep)" }
                  : undefined
              }
            >
              {pill}
            </span>
          ))}
        </div>

        <h2 className="mt-5 text-[1.7rem] font-semibold leading-[1.05] tracking-tight sm:text-[2rem]">
          Read the slope.
          <br />
          <span style={{ color: "var(--color-pine)" }}>That&rsquo;s the force.</span>
        </h2>

        <p className="mt-4 text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
          A potential-energy curve is a force map in disguise: its slope gives the force, with the
          sign reversed. Flat points are equilibrium candidates; the curve&rsquo;s shape there tells
          you whether a small displacement is corrected or amplified.
        </p>
      </header>

      <section className="border-t border-[color:var(--card-line)] bg-[color:var(--paper)] px-6 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "var(--color-pine)" }}
          >
            The invariant
          </span>
          <span className="h-px flex-1" style={{ background: "var(--card-line)" }} />
        </div>
        <p className="mt-3 text-[17px] font-semibold leading-snug text-[color:var(--ink)]">
          For a conservative force, the force is the negative slope of the potential.
        </p>
      </section>

      <section className="border-t border-[color:var(--card-line)] px-6 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]"
            style={{ color: "var(--color-pine)" }}
          >
            The moves
          </span>
          <span className="h-px flex-1" style={{ background: "var(--card-line)" }} />
        </div>
        <ol className="mt-4 space-y-4">
          {MOVES.map((move, index) => (
            <li key={move.name}>
              <p className="text-[15px] font-semibold text-[color:var(--ink)]">
                {index + 1}. {move.name}
              </p>
              {move.formula ? (
                <p className="mt-1 font-mono text-[14px] text-[color:var(--ink)]">{move.formula}</p>
              ) : null}
              <p className="mt-1 text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
                {move.body}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
