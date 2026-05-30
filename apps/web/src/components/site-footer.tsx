import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <BrandMark />
          <p className="text-muted-foreground text-sm">
            AI product ad videos — images → storyboard → video.
          </p>
        </div>
        <nav className="text-muted-foreground flex items-center gap-5 text-sm">
          <Link
            href="/#features"
            className="hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="/#how-it-works"
            className="hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/studio"
            className="hover:text-foreground transition-colors"
          >
            Studio
          </Link>
        </nav>
      </div>
      <div className="text-muted-foreground border-t py-4 text-center text-xs">
        © 2026 Adverra. A demo build of the F2 frontend shell.
      </div>
    </footer>
  );
}
