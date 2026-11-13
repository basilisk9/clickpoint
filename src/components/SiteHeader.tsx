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

/* ------------------------------------------------------------------ */
/* The header.                                                         */
/*                                                                     */
/* It is chrome, not a nav bar: the product has ONE destination, and   */
/* the way to it is the page's own primary button. So a phone shows    */
/* the wordmark and a single secondary item.                           */
/*                                                                     */
/* The previous version kept library + sign in + sign up visible at    */
/* every width. At 390px that overflowed onto two rows — a 134px       */
/* header, 16% of an 844px viewport, before the headline began. The    */
/* full set returns at sm, where there is room for it.                 */
/* ------------------------------------------------------------------ */
export function SiteHeader({
  completed = 0,
  total = 0,
  xp = 0,
  account = null,
}: SiteHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline sm:gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#10231f] text-lg font-black text-[#7dcea0] sm:h-11 sm:w-11 sm:rounded-2xl sm:text-xl">
          V
        </span>
        <span className="text-[21px] font-semibold tracking-tight sm:text-[28px]">
          clickpoint.
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Only a pathway page has anything to count, and only once there is
            something to count — 0/0 and 0 XP are noise. */}
        {total > 0 ? (
          <>
            <span className="chip hidden sm:inline-flex">
              {completed}/{total} nodes
            </span>
            <span className="chip hidden sm:inline-flex">
              <span className="text-amber-500">★</span> {xp} XP
            </span>
          </>
        ) : null}

        {/* Always visible: on a phone this is the only way back to the
            library from a card or a pathway page, and the landing page's
            library link is the only other route. */}
        <Link href="/library" className="chip no-underline">
          library
        </Link>

        {account ? (
          <>
            <span className="chip hidden sm:inline-flex" title="Signed in">
              @{account.username}
            </span>
            <SignOutButton />
          </>
        ) : (
          <>
            {/* The other item a phone keeps, trimmed to the word: "sign up"
                pushes the wordmark off a 360px screen, and the landing page
                CTA is the real signup path anyway. */}
            <Link
              href="/signin"
              className="text-sm font-semibold text-[#5d726c] no-underline"
            >
              sign in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm hidden sm:inline-flex">
              sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
