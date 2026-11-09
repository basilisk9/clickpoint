import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSession,
  findUserByUsername,
  mergeGuestIntoAccount,
  normalizeUsername,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { GUEST_COOKIE } from "@/lib/constants";
import { setGuestCookie } from "@/lib/guest";

export const runtime = "nodejs";

/* POST /api/auth/signin
   { username, password } → verifies the scrypt hash, absorbs any work this
   browser did anonymously, and points the guest cookie at the account's own
   guest row. That last step is what makes the library identical on every
   device the user signs in from. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      username?: unknown;
      password?: unknown;
    };
    const username = normalizeUsername(body.username);
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Enter your username and password." },
        { status: 400 },
      );
    }

    /* One generic message for both "no such user" and "wrong password": saying
       which one it was turns this endpoint into a username oracle. */
    const rejected = NextResponse.json(
      { error: "Incorrect username or password." },
      { status: 401 },
    );

    const user = await findUserByUsername(username);
    if (!user) return rejected;

    const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!ok) return rejected;

    /* Adopt anything this browser made before signing in. mergeGuestIntoAccount
       refuses to touch a guest another account owns. */
    const jar = await cookies();
    const anonymousGuestId = jar.get(GUEST_COOKIE)?.value;
    if (anonymousGuestId) {
      await mergeGuestIntoAccount(anonymousGuestId, user.guestId);
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);
    await setGuestCookie(user.guestId);

    return NextResponse.json({
      user: { id: user.id, username: user.username },
      guestId: user.guestId,
      redirectTo: "/library",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not sign you in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
