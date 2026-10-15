import Link from "next/link";

type SiteHeaderProps = {
  completed?: number;
  total?: number;
  xp?: number;
};

export function SiteHeader({ completed = 0, total = 0, xp = 0 }: SiteHeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-5">
      <Link href="/" className="flex items-center gap-3 no-underline">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#10231f] text-[#7dcea0] text-xl font-black">
          V
        </span>
        <span className="text-[28px] font-semibold tracking-tight">clickpoint.</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link href="/library" className="chip no-underline">
          library
        </Link>
        <span className="chip">
          {completed}/{total} nodes
        </span>
        <span className="chip">
          <span className="text-amber-500">★</span> {xp} XP
        </span>
      </div>
    </header>
  );
}
