import { cookies } from "next/headers";
import { getSessionUser } from "./auth";
import { COOKIE_MAX_AGE, GUEST_COOKIE } from "./constants";
import { createId } from "./ids";
import { getGuest, saveGuest } from "./store";
import type { GuestRecord } from "./types";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    /* Only sent over HTTPS in production; omitted on http://localhost so
       local dev keeps working. */
    secure: process.env.NODE_ENV === "production",
  };
}

/* Point this browser at a given guest row. Called on sign in / sign up so the
   account's library is the one every existing page reads. */
export async function setGuestCookie(id: string): Promise<void> {
  try {
    (await cookies()).set(GUEST_COOKIE, id, cookieOptions());
  } catch {
    // Read-only cookie jar (Server Component render): the account path below
    // re-derives the guest from the session on every request anyway.
  }
}

/* Signing out must drop this too. Leaving it would let the next visitor on a
   shared browser browse the previous account's pathways anonymously. */
export async function clearGuestCookie(): Promise<void> {
  try {
    (await cookies()).delete(GUEST_COOKIE);
  } catch {
    // Nothing to clear in a read-only context.
  }
}

/* The single guest row an account owns.
   This is the whole sync mechanism: a signed-in visitor resolves to their
   account's guest id, so listPathwaysForGuest() returns everything they have
   ever built, on any device, with no copying involved. */
async function guestForAccount(): Promise<GuestRecord | null> {
  const user = await getSessionUser().catch(() => null);
  if (!user) return null;

  const owned = await getGuest(user.guestId).catch(() => null);
  if (!owned) return null;

  /* Keep the cookie in step so a later anonymous code path cannot drift back
     to a stale guest. Harmless when it already matches. */
  const jar = await cookies();
  if (jar.get(GUEST_COOKIE)?.value !== owned.id) {
    await setGuestCookie(owned.id);
  }
  return owned;
}


export async function getOrCreateGuest(): Promise<GuestRecord> {
  /* A signed-in visitor's library is the account's, full stop. Checked before
     the cookie so an anonymous guest left over from before sign-in can never
     shadow the account's data. */
  const account = await guestForAccount();
  if (account) return account;

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
    jar.set(GUEST_COOKIE, guest.id, cookieOptions());
  } catch {
    // Server components can read an existing guest; cookie writes happen on mutations.
  }
  return guest;
}

export async function requireGuest(): Promise<GuestRecord> {
  /* Same precedence as getOrCreateGuest: the session wins over the cookie. */
  const account = await guestForAccount();
  if (account) return account;

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
