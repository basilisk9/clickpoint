/* ------------------------------------------------------------------ */
/* Registered interactive scenes.                                      */
/*                                                                     */
/* A card's figure is never generated code: the model names a scene id  */
/* and these components own the interaction and the math. Shared by the */
/* prompt (so the model is offered exactly what exists) and the         */
/* normalizer (so an unknown id degrades to its family instead of       */
/* rendering nothing).                                                 */
/* ------------------------------------------------------------------ */

import type { CardVisualKind } from "./types";

export type SceneId =
  | "energy-landscape"
  | "energy-bars"
  | "work-area"
  | "rotation-disk"
  | "vector-components"
  | "line-slope"
  | "oscillation";

export type SceneSpec = {
  id: SceneId;
  kind: CardVisualKind;
  /* What idea the figure teaches, in the prompt's own words. */
  teaches: string;
  /* Seed parameters the model may set, with the range a scene clamps to. */
  params?: Record<string, { min: number; max: number }>;
};

export const SCENES: SceneSpec[] = [
  {
    id: "energy-landscape",
    kind: "landscape",
    teaches:
      "a potential-energy curve U(x) with a draggable total-energy line: equilibrium, stability, turning points, force from slope, bound vs unbound",
    params: { energy: { min: 20, max: 240 } },
  },
  {
    id: "energy-bars",
    kind: "bars",
    teaches:
      "one conserved total, split between kinetic, potential and dissipated: conservation, transfer, friction losses, bookkeeping",
  },
  {
    id: "work-area",
    kind: "area",
    teaches:
      "accumulation as a shaded area under a curve with a draggable upper limit: work integrals, impulse, charge, any 'add it all up'",
    params: { limit: { min: 0.2, max: 4 } },
  },
  {
    id: "rotation-disk",
    kind: "disk",
    teaches:
      "a spinning disk with a draggable radius: angular vs linear speed, v = wr, a = alpha r, why the rim moves faster, same omega for the whole body",
    params: { radius: { min: 0.05, max: 1 }, omega: { min: 0.2, max: 4 } },
  },
  {
    id: "vector-components",
    kind: "vector",
    teaches:
      "one arrow you can drag, resolved live into components: resolving forces, projectiles, components along axes, sin/cos from geometry",
    params: { angle: { min: 0, max: 90 }, magnitude: { min: 1, max: 10 } },
  },
  {
    id: "line-slope",
    kind: "plot",
    teaches:
      "a line you can tilt, with slope and intercept read out live: rate of change, gradient, linear relations, graph-to-equation",
    params: { slope: { min: -3, max: 3 }, intercept: { min: -4, max: 4 } },
  },
  {
    id: "oscillation",
    kind: "oscillation",
    teaches:
      "a swinging trace with draggable amplitude and period: SHM, waves, phase, period vs frequency, why T does not depend on amplitude",
    params: { amplitude: { min: 0.2, max: 1 }, period: { min: 0.5, max: 4 } },
  },
];

export const SCENE_IDS = SCENES.map((scene) => scene.id);

const BY_ID = new Map<string, SceneSpec>(SCENES.map((scene) => [scene.id, scene]));

/* Falls back to the family default, so a model that names a scene we retired
   (or invents one) still gets a sensible figure rather than a blank space. */
export function resolveScene(
  sceneId: string | undefined,
  kind: CardVisualKind,
): SceneSpec | null {
  if (sceneId && BY_ID.has(sceneId)) return BY_ID.get(sceneId)!;
  if (kind === "none") return null;
  return SCENES.find((scene) => scene.kind === kind) ?? null;
}

/* One-line menu for the prompt: built from SCENES so the prompt can never
   advertise a scene that does not exist. */
export function sceneMenu(): string {
  return SCENES.map(
    (scene) => `- "${scene.id}": ${scene.teaches}.`,
  ).join("\n");
}

/* Params are advisory: clamp them to the declared range so a scene can trust
   whatever it receives. Unknown keys are dropped. */
export function sceneParams(
  scene: SceneSpec,
  params: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!params || !scene.params) return out;
  for (const [key, range] of Object.entries(scene.params)) {
    const value = params[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[key] = Math.min(range.max, Math.max(range.min, value));
  }
  return out;
}
