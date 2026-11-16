import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  feedbackId,
  isFeedbackThrottled,
  parseClientStamp,
  validateFeedback,
} from "@/lib/feedback";
import { getOrCreateGuest } from "@/lib/guest";
import { feedbackExists, lastFeedbackAt, saveFeedback } from "@/lib/store";

export const runtime = "nodejs";

/* POST /api/feedback
   { kind, body, pathwayId?, nodeId?, at } → one row.

   Two separate guards, for two different mistakes:

     1. The `at` stamp the client mints is the row's identity, so a send that
        succeeded but whose response was lost can be retried without leaving a
        duplicate behind.
     2. The throttle reads the last row's *server* timestamp, so a held-down
        button cannot fill the table. It does not trust the client clock.

   The guest is resolved with getOrCreateGuest so a report made before any
   pathway exists still carries an identity, and an account's report carries
   its user id too. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const check = validateFeedback(body);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const guest = await getOrCreateGuest().catch(() => null);
    const account = await getSessionUser().catch(() => null);

    /* A missing stamp still sends; it just cannot be deduplicated, which is
       better than rejecting a report that took someone effort to write. */
    const stamp = parseClientStamp(body.at);
    const id = feedbackId(guest?.id ?? "anon", Number.isFinite(stamp) ? stamp : Date.now());

    /* Duplicate check comes BEFORE the throttle, and that order matters: a send
       whose response was lost is retried immediately, i.e. inside the throttle
       window, and rejecting it would show an error for a report that was in
       fact stored. Asking "have I already got this one?" is exactly the
       question a retry needs answered. */
    if (await feedbackExists(id)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (guest) {
      const previous = await lastFeedbackAt(guest.id).catch(() => null);
      if (isFeedbackThrottled(previous ?? NaN, Date.now())) {
        return NextResponse.json(
          { error: "Got your last one — give it a few seconds before sending another." },
          { status: 429 },
        );
      }
    }

    const created = await saveFeedback(
      id,
      guest?.id ?? null,
      account?.id ?? null,
      check.value,
    );

    return NextResponse.json({ ok: true, duplicate: !created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save that.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
