"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

/* Mirrors MIN_PASSWORD in lib/auth.ts. Duplicated rather than imported:
   that module pulls in next/headers and the pg driver, which cannot cross
   into a client bundle. The server re-validates everything regardless. */
const MIN_PASSWORD = 8;
const MIN_USERNAME = 3;

type Mode = "signin" | "signup";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isSignup = mode === "signup";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    /* Cheap local checks so an obvious typo does not cost a round trip. */
    if (username.trim().length < MIN_USERNAME) {
      setError(`Username needs at least ${MIN_USERNAME} characters.`);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setBusy(true);
    try {
      /* Where a gated page sent this visitor; read here rather than via
         useSearchParams so the page needs no Suspense boundary. */
      const next = new URLSearchParams(window.location.search).get("next");
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password, next }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Something went wrong. Try again.");
      }

      /* replace, not push: the auth screen should not sit in history behind
         the library where Back would return to a submitted form. */
      router.replace(data.redirectTo || "/library");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
    /* On success `busy` stays true so the button does not flicker back to
       its idle label while the navigation resolves. */
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[28px] border border-[#d5e0db] bg-white/90 p-8 shadow-[0_20px_60px_rgba(16,35,31,0.08)]"
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0f766e]">
        {isSignup ? "new account" : "welcome back"}
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        {isSignup ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-3 text-[#5d726c]">
        {isSignup
          ? "Keep every pathway you build."
          : "Pick up every pathway you have built."}
      </p>

      <label
        htmlFor="username"
        className="mt-7 block text-sm font-semibold uppercase tracking-wide text-[#5d726c]"
      >
        Username
      </label>
      <input
        id="username"
        name="username"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        disabled={busy}
        placeholder="yourname"
        className="mt-2 w-full rounded-2xl border border-[#d5e0db] bg-[#f7faf8] px-4 py-3 outline-none focus:border-[#0f766e] disabled:opacity-60"
      />

      <label
        htmlFor="password"
        className="mt-5 block text-sm font-semibold uppercase tracking-wide text-[#5d726c]"
      >
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete={isSignup ? "new-password" : "current-password"}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={busy}
        placeholder="••••••••"
        className="mt-2 w-full rounded-2xl border border-[#d5e0db] bg-[#f7faf8] px-4 py-3 outline-none focus:border-[#0f766e] disabled:opacity-60"
      />

      {isSignup ? (
        <p className="mt-3 text-sm leading-6 text-[#5d726c]">
          At least {MIN_PASSWORD} characters.
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary mt-6 w-full"
      >
        {busy
          ? isSignup
            ? "Creating your account…"
            : "Signing you in…"
          : isSignup
            ? "Create account"
            : "Sign in"}
      </button>

      <p className="mt-5 text-center text-sm text-[#5d726c]">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link
          href={isSignup ? "/signin" : "/signup"}
          className="font-bold text-[#0f766e] no-underline"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
