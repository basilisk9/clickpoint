import { cookies } from "next/headers";
import { COOKIE_MAX_AGE, GUEST_COOKIE } from "./constants";
import { createId } from "./ids";
import { getGuest, saveGuest } from "./store";
import type { GuestRecord } from "./types";

export async function getOrCreateGuest(): Promise<GuestRecord> {
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value;
  if (existing) {
    const guest = await getGuest(existing);
    if (guest) return guest;
  }

  const guest: GuestRecord = {
    id: createId("gst"),
    createdAt: new Date().toISOString(),
    pathwayIds: [],
  };
  await saveGuest(guest);
  try {
    jar.set(GUEST_COOKIE, guest.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  } catch {
    // Server components can read an existing guest; cookie writes happen on mutations.
  }
  return guest;
}

export async function requireGuest(): Promise<GuestRecord> {
  const jar = await cookies();
  const id = jar.get(GUEST_COOKIE)?.value;
  if (!id) {
    throw new Error("No guest session");
  }
  const guest = await getGuest(id);
  if (!guest) {
    throw new Error("Unknown guest");
  }
  return guest;
}
