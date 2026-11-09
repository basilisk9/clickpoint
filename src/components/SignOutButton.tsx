"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/* Signs out, then sends the visitor home as a fresh anonymous guest.
   A plain <button> rather than a form action because the POST has to run
   inside the Route Handler that also clears the cookies. */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* Even if the request dies, the navigation below still happens; the
         session row is the only thing left behind and it expires on its own. */
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className={className ?? "chip cursor-pointer disabled:opacity-60"}
    >
      {busy ? "signing out…" : "sign out"}
    </button>
  );
}
