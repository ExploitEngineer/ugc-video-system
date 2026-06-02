"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RunDetail } from "@ugc/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  MenuIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteRunAction } from "@/app/studio/actions";
import { BrandGlyph, BrandMark } from "@/components/brand-mark";
import { isTerminal, STATUS_DOT } from "@/components/studio/run/run-meta";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Stable module-level poller — slow cadence, stops at terminal states and on
// error (e.g. a deleted run that now 404s — otherwise it would poll forever).
// Hoisted out of the component so its identity never changes between renders
// (React Compiler does not memoize query-option closures).
function runItemPollInterval(query: {
  state: { data?: RunDetail; status?: string };
}): number | false {
  if (query.state.status === "error") return false;
  const status = query.state.data?.status;
  if (!status) return 6000;
  return isTerminal(status) ? false : 5000;
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
      <div className="glass-panel sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border px-3 md:hidden">
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
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 38 }}
              className="bg-card absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-border"
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
        animate={{ width: collapsed ? 64 : 280 }}
        transition={{ type: "spring", stiffness: 340, damping: 38 }}
        className="bg-card/30 hidden shrink-0 flex-col overflow-hidden border-r border-border md:flex"
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
          "flex h-14 items-center border-b border-border/70 px-3",
          collapsed ? "justify-center px-0" : "gap-2",
        )}
      >
        {collapsed ? (
          <BrandGlyph />
        ) : (
          <>
            <BrandMark />
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
                  aria-label="Collapse sidebar"
                  onClick={onToggleCollapse}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <PanelLeftCloseIcon className="size-4" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Expand affordance when collapsed — sits just under the glyph. */}
      {collapsed && onToggleCollapse && (
        <div className="flex justify-center pt-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Expand sidebar"
            onClick={onToggleCollapse}
            className="text-muted-foreground hover:text-foreground size-9"
          >
            <PanelLeftOpenIcon className="size-4" />
          </Button>
        </div>
      )}

      {/* New chat */}
      <div
        className={cn(
          "px-3 pt-3 pb-2",
          collapsed && "flex justify-center px-0 pt-2",
        )}
      >
        <Button
          asChild
          variant="brand"
          className={cn("group w-full", collapsed && "size-10 w-10 p-0")}
        >
          <Link href="/studio" aria-label="New chat" title="New chat">
            <PlusIcon className="size-4" />
            {!collapsed && "New chat"}
          </Link>
        </Button>
      </div>

      {/* Chat list */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto py-2",
          collapsed ? "px-0" : "px-2",
        )}
      >
        {!collapsed && (
          <p className="text-muted-foreground px-2 pb-1.5 font-mono text-[10px] font-medium tracking-[0.14em] uppercase">
            Recent chats
          </p>
        )}
        {runs.length === 0 ? (
          !collapsed && (
            <p className="text-muted-foreground px-2 py-6 text-center text-xs text-pretty">
              No chats yet. Describe an ad to start your first one.
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
          "flex items-center gap-1 border-t border-border/70 p-2",
          collapsed && "flex-col",
        )}
      >
        <Button
          asChild
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            !collapsed && "flex-1 justify-start",
          )}
        >
          <Link href="/" aria-label="Back to site" title="Back to site">
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  // Lightweight live status — polls slowly, stops at terminal states.
  const { data, isError } = useQuery({
    queryKey: ["run", entry.id],
    queryFn: () => fetchRun(entry.id),
    refetchInterval: runItemPollInterval,
    retry: (count, err) => (err as Error).message !== "not-found" && count < 1,
  });

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    const ok = await deleteRunAction(entry.id);
    if (!ok) {
      setDeleting(false);
      toast.error("Couldn't delete chat — try again.");
      return;
    }
    // Drop it from local history and the query cache so it can't reappear
    // from either source, then leave its page if we're on it.
    removeRun(entry.id);
    queryClient.removeQueries({ queryKey: ["run", entry.id] });
    queryClient.invalidateQueries({ queryKey: ["runs"] });
    toast.success("Chat deleted");
    if (active) router.push("/studio");
  }

  const status = data?.status;
  const dot = isError
    ? "bg-muted-foreground/40"
    : status
      ? STATUS_DOT[status]
      : "bg-muted-foreground/40 animate-pulse";

  const title = entry.prompt.trim() || "Untitled chat";

  return (
    <li className="group/item relative">
      <Link
        href={`/studio/${entry.id}`}
        title={title}
        className={cn(
          "flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors duration-200",
          collapsed ? "justify-center px-0" : "pr-9 pl-2.5",
          active
            ? "bg-accent text-accent-foreground font-medium ring-1 ring-brand/20"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
        {!collapsed && <span className="truncate">{title}</span>}
      </Link>
      {!collapsed && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Chat options"
              className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity duration-200 group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-muted data-[state=open]:opacity-100"
            >
              <MoreHorizontalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-40">
            <DropdownMenuItem
              variant="destructive"
              disabled={deleting}
              onSelect={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              <Trash2Icon className="size-4" />
              {deleting ? "Deleting…" : "Delete chat"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
