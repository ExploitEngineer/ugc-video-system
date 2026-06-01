import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Adverra glyph — a compact cyan monogram tile. Used standalone in the
 * collapsed sidebar (so the logo never just vanishes) and as the lockup
 * mark inside <BrandMark />.
 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-brand-gradient text-brand-foreground text-display relative grid size-7 shrink-0 place-items-center rounded-[0.5rem] text-[15px] leading-none font-extrabold shadow-sm select-none",
        className,
      )}
    >
      A
      {/* notch accent — a thin dark slot, the studio "cut". */}
      <span className="bg-brand-foreground/70 absolute right-1 bottom-1 h-0.5 w-1.5 rounded-full" />
    </span>
  );
}

/**
 * Adverra logo — glyph tile + tight-tracked wordmark in the Cabinet Grotesk
 * display face. The trailing "a" carries the cyan accent. No floating dot
 * (the old baseline-misaligned accent is gone); the glyph is the mark.
 */
export function BrandMark({
  className,
  href = "/",
  showGlyph = true,
}: {
  className?: string;
  href?: string | null;
  showGlyph?: boolean;
}) {
  const mark = (
    <span
      className={cn(
        "inline-flex items-center gap-2 select-none",
        className,
      )}
    >
      {showGlyph && <BrandGlyph />}
      <span className="text-display text-[1.15rem] leading-none font-bold tracking-tight">
        <span className="text-foreground">Adverr</span>
        <span className="text-brand-gradient">a</span>
      </span>
    </span>
  );

  if (href === null) return mark;
  return (
    <Link href={href} aria-label="Adverra home" className="shrink-0">
      {mark}
    </Link>
  );
}
