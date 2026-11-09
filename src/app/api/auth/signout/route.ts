import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  destroySession,
  getSessionToken,
} from "@/lib/auth";
import { clearGuestCookie } from "@/lib/guest";

export const runtime = "nodejs";

/* POST /api/auth/signout
   Deletes the session row (so the token is dead server-side, not merely
   forgotten by the browser) and clears both cookies. The guest cookie has to
   go too — leaving it would let the next person on a shared machine browse the
   previous account's library as an anonymous guest. */
export async function POST() {
  try {
    const token = await getSessionToken();
    if (token) await destroySession(token);
  } catch {
    /* A database hiccup must not trap someone in a session they want out of:
       the cookies below are cleared either way. */
  }

  await clearSessionCookie();
  await clearGuestCookie();
  return NextResponse.json({ ok: true });
}
