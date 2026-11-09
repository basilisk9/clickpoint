import { NextResponse } from "next/server";
import {
  createSession,
  createUser,
  getSessionUser,
  hashPassword,
  isUniqueViolation,
  normalizeUsername,
  setSessionCookie,
  validateCredentials,
} from "@/lib/auth";
import { getOrCreateGuest, setGuestCookie } from "@/lib/guest";

export const runtime = "nodejs";

/* POST /api/auth/signup
   { username, password } → creates the account, claims the current guest row
   (so anything built before signing up is kept), then starts a session.

   The password is only ever held long enough to derive an scrypt hash; it is
   never stored, logged, or put in the session. */
export async function POST(request: Request) {
  try {
    /* Already signed in: creating a second account on the same browser would
       leave the first account's guest row unreachable from this device. */
    const current = await getSessionUser().catch(() => null);
    if (current) {
      return NextResponse.json(
        { error: `You're already signed in as ${current.username}.` },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      username?: unknown;
      password?: unknown;
    };
    const username = normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";

    const problem = validateCredentials(username, password);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    /* The guest row this browser already owns. Signing up adopts it rather
       than starting fresh, so anonymous work is not thrown away. */
    const guest = await getOrCreateGuest();

    const { hash, salt } = await hashPassword(password);
    const user = await createUser({
      username,
      passwordHash: hash,
      passwordSalt: salt,
      guestId: guest.id,
    });

    const token = await createSession(user.id);
    await setSessionCookie(token);
    await setGuestCookie(guest.id);

    return NextResponse.json({
      user: { id: user.id, username: user.username },
      guestId: user.guestId,
      redirectTo: "/library",
    });
  } catch (error) {
    /* Unique index decides, not a prior SELECT, so two simultaneous signups
       with the same name cannot both succeed. */
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "That username is taken. Try another one." },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Could not create the account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
