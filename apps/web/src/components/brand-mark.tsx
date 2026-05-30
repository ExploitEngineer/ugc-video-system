import Link from "next/link";

import { cn } from "@/lib/utils";

/** Adverra logo: a play-triangle inside a rounded gradient aperture. */
export function BrandMark({
  className,
  withWordmark = true,
  href = "/",
}: {
  className?: string;
  withWordmark?: boolean;
  href?: string | null;
}) {
  const mark = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="bg-brand-gradient relative flex size-8 items-center justify-center rounded-[0.6rem] shadow-sm">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-4 text-white"
          fill="currentColor"
        >
          <path d="M9 7.5v9a1 1 0 0 0 1.52.86l7.2-4.5a1 1 0 0 0 0-1.72l-7.2-4.5A1 1 0 0 0 9 7.5Z" />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-display text-lg leading-none font-bold tracking-tight">
          Adverra
        </span>
      )}
    </span>
  );

  if (href === null) return mark;
  return (
    <Link href={href} aria-label="Adverra home" className="shrink-0">
      {mark}
    </Link>
  );
}
