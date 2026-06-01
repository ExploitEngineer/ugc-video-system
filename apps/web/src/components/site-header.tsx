"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "framer-motion";
import { ArrowRightIcon, MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works", section: "how-it-works" },
  { href: "/#features", label: "Features", section: "features" },
  { href: "/#pipeline", label: "Pipeline", section: "pipeline" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const pathname = usePathname();

  // Thin gradient progress bar pinned to the bar's bottom edge.
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 24,
    restDelta: 0.001,
  });

  // Past the fold the bar condenses into a floating capsule.
  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 12);
  });

  // Scroll-spy: light up the link whose section owns the viewport center.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname re-arms the observer on route change; not read in the body
  useEffect(() => {
    const sections = NAV_LINKS.map((l) =>
      document.getElementById(l.section),
    ).filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    for (const el of sections) observer.observe(el);
    return () => observer.disconnect();
  }, [pathname]);

  // The sliding pill follows the hover; falls back to the active section.
  const highlighted =
    hovered ?? NAV_LINKS.find((l) => l.section === active)?.href ?? null;

  return (
    <header className="sticky top-0 z-40 w-full">
      <div
        className={cn(
          "relative w-full transition-colors duration-300 ease-out",
          scrolled
            ? "border-b border-border/60 bg-background/70 backdrop-blur-xl backdrop-saturate-150"
            : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <BrandMark />
          </motion.div>

          <nav
            className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex"
            onMouseLeave={() => setHovered(null)}
          >
            {NAV_LINKS.map((link) => {
              const isHighlighted = highlighted === link.href;
              const isActive =
                NAV_LINKS.find((l) => l.section === active)?.href === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onMouseEnter={() => setHovered(link.href)}
                  className={cn(
                    "relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 ease-out",
                    isActive || isHighlighted
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isHighlighted && (
                    <motion.span
                      layoutId="nav-pill"
                      className="bg-accent/70 absolute inset-0 -z-10 rounded-full"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 34,
                        mass: 0.7,
                      }}
                    />
                  )}
                  {link.label}
                  <AnimatePresence>
                    {isActive && (
                      <motion.span
                        layoutId="nav-dot"
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.4 }}
                        className="bg-brand-gradient absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                      />
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button
              asChild
              variant="brand"
              size="sm"
              className="group relative hidden overflow-hidden sm:flex"
            >
              <Link href="/studio">
                {/* sheen sweep on hover */}
                <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-sheen blur-sm transition-transform duration-700 ease-out group-hover:translate-x-[420%]" />
                Open Studio
                <ArrowRightIcon className="size-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Toggle menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={open ? "close" : "open"}
                  initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                  transition={{ duration: 0.18 }}
                  className="flex"
                >
                  {open ? (
                    <XIcon className="size-5" />
                  ) : (
                    <MenuIcon className="size-5" />
                  )}
                </motion.span>
              </AnimatePresence>
            </Button>
          </div>
        </div>

        {/* Scroll-progress rail along the bar's bottom edge. */}
        <motion.div
          style={{ scaleX: progress }}
          className="bg-brand-gradient absolute bottom-0 left-0 h-px w-full origin-left"
        />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-b border-border/60 bg-background/80 backdrop-blur-xl md:hidden"
          >
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: {
                  transition: { staggerChildren: 0.06, delayChildren: 0.04 },
                },
              }}
              className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-6 py-3 lg:px-8"
            >
              {NAV_LINKS.map((link) => (
                <motion.div
                  key={link.href}
                  variants={{
                    hidden: { opacity: 0, x: -16 },
                    show: { opacity: 1, x: 0 },
                  }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="hover:bg-accent flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                  >
                    {link.label}
                    <ArrowRightIcon className="text-muted-foreground size-4" />
                  </Link>
                </motion.div>
              ))}
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <Button asChild variant="brand" className="mt-2 w-full">
                  <Link href="/studio" onClick={() => setOpen(false)}>
                    Open Studio
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
