import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { GuestRecord, PathwayRecord, PathwaySummary } from "./types";

/* Where guest + pathway JSON lives. Defaults to ./data for local dev; set
   DATA_DIR to a mounted volume path in production so records survive
   restarts and redeploys. Without it, a container's ephemeral disk silently
   discards every user's progress on the next deploy. */
const dataRoot = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const guestsDir = path.join(dataRoot, "guests");
const pathwaysDir = path.join(dataRoot, "pathways");

async function ensureDirs() {
  await mkdir(guestsDir, { recursive: true });
  await mkdir(pathwaysDir, { recursive: true });
}

function guestPath(id: string) {
  return path.join(guestsDir, `${id}.json`);
}

function pathwayPath(id: string) {
  return path.join(pathwaysDir, `${id}.json`);
}

export async function getGuest(id: string): Promise<GuestRecord | null> {
  await ensureDirs();
  try {
    const raw = await readFile(guestPath(id), "utf8");
    return JSON.parse(raw) as GuestRecord;
  } catch {
    return null;
  }
}

export async function saveGuest(guest: GuestRecord): Promise<void> {
  await ensureDirs();
  await writeFile(guestPath(guest.id), JSON.stringify(guest, null, 2), "utf8");
}

export async function getPathway(id: string): Promise<PathwayRecord | null> {
  await ensureDirs();
  try {
    const raw = await readFile(pathwayPath(id), "utf8");
    return JSON.parse(raw) as PathwayRecord;
  } catch {
    return null;
  }
}

export async function savePathway(pathway: PathwayRecord): Promise<void> {
  await ensureDirs();
  pathway.updatedAt = new Date().toISOString();
  await writeFile(pathwayPath(pathway.id), JSON.stringify(pathway, null, 2), "utf8");
}

export async function listPathwaysForGuest(guestId: string): Promise<PathwaySummary[]> {
  const guest = await getGuest(guestId);
  if (!guest) return [];

  const rows: PathwaySummary[] = [];
  for (const id of guest.pathwayIds) {
    const pathway = await getPathway(id);
    if (!pathway) continue;
    rows.push({
      id: pathway.id,
      title: pathway.banner.title,
      blurb: pathway.banner.blurb,
      createdAt: pathway.createdAt,
      status: pathway.status,
      completedNodes: pathway.completedNodeIds.length,
      totalNodes: pathway.nodes.length,
      xp: pathway.xp,
    });
  }

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publicPathway(pathway: PathwayRecord): PathwayRecord {
  return {
    ...pathway,
    rawNotes: "",
  };
}
