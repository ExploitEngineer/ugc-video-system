import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Adverra logo — pure typographic wordmark in the grotesk display face.
 * Distinctive detail: a tight-tracked lockup whose trailing "a" carries the
 * indigo → fuchsia brand gradient, plus an accented terminal dot. No icon box.
 */
export function BrandMark({
  className,
  href = "/",
}: {
  className?: string;
  href?: string | null;
}) {
  const mark = (
    <span
      className={cn(
        "text-display inline-flex items-baseline text-lg leading-none font-bold tracking-tight select-none",
        className,
      )}
    >
      <span className="text-foreground">Adverr</span>
      <span className="text-brand-gradient">a</span>
      <span className="bg-brand-gradient ml-0.5 size-1.5 self-end rounded-full" />
    </span>
  );

  if (href === null) return mark;
  return (
    <Link href={href} aria-label="Adverra home" className="shrink-0">
      {mark}
    </Link>
  );
}
