import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

/* Plain data, not a session lookup: this component also renders inside the
   client tree (PathwayView), where it cannot read cookies. Server pages pass
   the resolved account down. */
export type HeaderAccount = { username: string } | null;

type SiteHeaderProps = {
  completed?: number;
  total?: number;
  xp?: number;
  account?: HeaderAccount;
};

export function SiteHeader({
  completed = 0,
  total = 0,
  xp = 0,
  account = null,
}: SiteHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
      <Link href="/" className="flex items-center gap-3 no-underline">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#10231f] text-[#7dcea0] text-xl font-black">
          V
        </span>
        <span className="text-[28px] font-semibold tracking-tight">clickpoint.</span>
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/library" className="chip no-underline">
          library
        </Link>
        {/* A fresh visitor has nothing to count yet, so 0/0 and 0 XP are just
            noise in the header. */}
        {total > 0 ? (
          <>
            <span className="chip">
              {completed}/{total} nodes
            </span>
            <span className="chip">
              <span className="text-amber-500">★</span> {xp} XP
            </span>
          </>
        ) : null}
        {account ? (
          <>
            <span className="chip" title="Signed in">
              @{account.username}
            </span>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/signin" className="chip no-underline">
              sign in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

