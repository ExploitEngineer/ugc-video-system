"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { isTerminal, STATUS_DOT } from "@/components/studio/run/run-meta";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { fetchRun, fetchRuns } from "@/lib/api";
import {
  type RunHistoryEntry,
  removeRun,
  useRunHistory,
} from "@/lib/run-history";
import { cn } from "@/lib/utils";

/** Merge DB runs with locally recorded ones, dedupe by id, newest first. */
function mergeRuns(
  local: RunHistoryEntry[],
  remote: RunHistoryEntry[],
): RunHistoryEntry[] {
  const byId = new Map<string, RunHistoryEntry>();
  // Remote (DB) first as the base, then local overrides (it may hold a
  // freshly created run the list query hasn't picked up yet).
  for (const r of remote) byId.set(r.id, r);
  for (const r of local) byId.set(r.id, { ...byId.get(r.id), ...r });
  return [...byId.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function StudioSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the change trigger, not read in the body
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="glass-panel sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 px-3 md:hidden">
        <BrandMark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open runs"
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon className="size-5" />
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close runs"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 38 }}
              className="bg-card absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-border/60"
            >
              <SidebarInner
                pathname={pathname}
                collapsed={false}
                onClose={() => setMobileOpen(false)}
              />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 68 : 280 }}
        transition={{ type: "spring", stiffness: 320, damping: 36 }}
        className="bg-card/40 hidden shrink-0 flex-col border-r border-border/60 md:flex"
      >
        <SidebarInner
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </motion.aside>
    </>
  );
}

function SidebarInner({
  pathname,
  collapsed,
  onToggleCollapse,
  onClose,
}: {
  pathname: string;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  const localRuns = useRunHistory();
  const { data: dbRuns } = useQuery({
    queryKey: ["runs"],
    queryFn: fetchRuns,
    refetchInterval: 10000,
    staleTime: 5000,
  });
  const runs = useMemo(
    () =>
      mergeRuns(
        localRuns,
        (dbRuns ?? []).map((r) => ({
          id: r.id,
          prompt: r.prompt,
          createdAt: r.createdAt,
        })),
      ),
    [localRuns, dbRuns],
  );

  return (
    <div className="flex h-dvh flex-col md:h-full">
      {/* Header */}
      <div
        className={cn(
          "flex h-14 items-center gap-2 px-3",
          collapsed && "justify-center px-0",
        )}
      >
        {!collapsed && <BrandMark />}
        <div className="ml-auto flex items-center">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={onClose}
              className="md:hidden"
            >
              <XIcon className="size-5" />
            </Button>
          )}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggleCollapse}
            >
              {collapsed ? (
                <PanelLeftOpenIcon className="size-4" />
              ) : (
                <PanelLeftCloseIcon className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* New run */}
      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        <Button
          asChild
          variant="brand"
          className={cn("group w-full", collapsed && "size-10 p-0")}
        >
          <Link href="/studio" aria-label="New run">
            <PlusIcon className="size-4" />
            {!collapsed && "New run"}
          </Link>
        </Button>
      </div>

      {/* Run list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!collapsed && (
          <p className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            Recent runs
          </p>
        )}
        {runs.length === 0 ? (
          !collapsed && (
            <p className="text-muted-foreground px-2 py-6 text-center text-xs text-pretty">
              No runs yet. Describe an ad to start your first one.
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-0.5">
            {runs.map((entry) => (
              <RunListItem
                key={entry.id}
                entry={entry}
                active={pathname === `/studio/${entry.id}`}
                collapsed={collapsed}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div
        className={cn(
          "flex items-center gap-1 border-t border-border/60 p-2",
          collapsed && "flex-col",
        )}
      >
        <Button
          asChild
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn(!collapsed && "flex-1 justify-start")}
        >
          <Link href="/" aria-label="Back to site">
            <ArrowLeftIcon className="size-4" />
            {!collapsed && "Back to site"}
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}

function RunListItem({
  entry,
  active,
  collapsed,
}: {
  entry: RunHistoryEntry;
  active: boolean;
  collapsed: boolean;
}) {
  // Lightweight live status — polls slowly, stops at terminal states.
  const { data, isError } = useQuery({
    queryKey: ["run", entry.id],
    queryFn: () => fetchRun(entry.id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 6000;
      return isTerminal(status) ? false : 5000;
    },
    retry: (count, err) => (err as Error).message !== "not-found" && count < 1,
  });

  const status = data?.status;
  const dot = isError
    ? "bg-muted-foreground/40"
    : status
      ? STATUS_DOT[status]
      : "bg-muted-foreground/40 animate-pulse";

  const title = entry.prompt.trim() || "Untitled run";

  return (
    <li className="group/item relative">
      <Link
        href={`/studio/${entry.id}`}
        title={title}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
          collapsed && "justify-center px-0",
          active
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
        {!collapsed && <span className="truncate">{title}</span>}
      </Link>
      {!collapsed && (
        <button
          type="button"
          aria-label="Remove from history"
          onClick={(e) => {
            e.preventDefault();
            removeRun(entry.id);
          }}
          className="text-muted-foreground hover:bg-muted hover:text-destructive absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity group-hover/item:opacity-100"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
    </li>
  );
}
