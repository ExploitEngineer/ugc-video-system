// Read-only inspection of a Nexrender Cloud template → a "what to fill in"
// checklist + a ready-to-paste render job.
//
//   pnpm --filter api nexrender:inspect <templateId>
//   (token read from apps/api/.env NEXRENDER_API_KEY; inline var overrides)
//
// Calls the v3 inspection endpoints (GET /api/v3/templates/{id}/compositions and
// /layers), discovers the REAL fields (prints a raw sample), then:
//  1. announces the MAIN composition to render (the top comp nothing nests),
//  2. treats placeholder precomps (PH_*/Media_*/Your Video/…) as MEDIA slots and
//     follows them one level in to the real footage layer,
//  3. prints ONE consolidated "WHAT TO FILL IN" table (text/video/image/audio),
//  4. explains HOW TO INJECT each (nested comps need nx:text-params-set) and
//     emits a ready-to-paste sample render job JSON with all slots stubbed.
//
// Real fields: `layer_type` (`text`/`av`/`shape`/`null`/`camera`) + `source_type`
// (`file`/`comp`/`solid`/null). No filename field — for `av/file` the layer NAME
// carries the extension, which is how we tell video/image/audio apart.

import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Load apps/api/.env (relative to this file) so NEXRENDER_API_KEY can live there
// instead of being passed inline. dotenv does NOT override an already-set var.
loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

interface Composition {
  aeid: string | number;
  name: string;
  width?: number;
  height?: number;
}

interface Layer {
  composition_id: number | string;
  aeid: number;
  name: string;
  layer_type: string | null;
  source_type: string | null;
  source_comp_id: number | null;
  parent_id: number | null;
  data?: unknown;
}

type Media = "VIDEO" | "IMAGE" | "AUDIO";
interface Slot {
  asset: Media | "TEXT";
  composition: string; // the comp the target layer lives in (asset `composition`)
  layerName: string; // display
  jobLayerName: string; // what to put in the render job's layerName
  put: string; // "what to fill in"
}

const templateId = process.argv[2];
const tokenArgIdx = process.argv.indexOf("--token");
const token =
  (tokenArgIdx > -1 ? process.argv[tokenArgIdx + 1] : undefined) ??
  process.env.NEXRENDER_API_KEY;
const base = process.env.NEXRENDER_BASE_URL ?? "https://api.nexrender.com";

if (!templateId || templateId.startsWith("[")) {
  console.error(
    "Usage: pnpm --filter api nexrender:inspect <templateId>  (token from .env)",
  );
  process.exit(1);
}
if (!token || token.startsWith("[")) {
  console.error("No API token. Set NEXRENDER_API_KEY (apps/api/.env) or --token.");
  process.exit(1);
}

async function getAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${base}/api/v3${path}?limit=1000&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GET ${path} → ${res.status} ${body.slice(0, 300)}`);
    }
    const page = (await res.json()) as T[] | { data?: T[]; items?: T[] };
    const rows = Array.isArray(page) ? page : (page.data ?? page.items ?? []);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const lower = (s: string | null) => (s ?? "").toLowerCase();

function extType(name: string): Media | null {
  if (/\.(mp4|mov|avi|webm|mkv|m4v|mxf|flv)$/i.test(name)) return "VIDEO";
  if (/\.(png|jpe?g|ai|tiff?|psd|exr|tga|bmp|gif|webp)$/i.test(name)) return "IMAGE";
  if (/\.(mp3|wav|aac|m4a|aiff?|ogg|flac)$/i.test(name)) return "AUDIO";
  return null;
}

const PLACEHOLDER = [
  /^ph[_\s-]?\d*/i,
  /placeholder/i,
  /media[_\s-]?\d*/i,
  /your\s*video/i,
  /video[_\s-]?\d*/i,
  /footage/i,
];
const isPlaceholder = (n: string) => PLACEHOLDER.some((re) => re.test(n));

// ── Generic box table ─────────────────────────────────────────────────
function boxTable(headers: string[], widths: number[], rows: string[][]): void {
  const cell = (s: string, w: number) =>
    (s.length > w ? `${s.slice(0, w - 1)}…` : s).padEnd(w);
  const border = (l: string, m: string, r: string) =>
    l + widths.map((w) => "─".repeat(w + 2)).join(m) + r;
  console.log(border("┌", "┬", "┐"));
  console.log(`│ ${headers.map((h, i) => cell(h, widths[i])).join(" │ ")} │`);
  console.log(border("├", "┼", "┤"));
  for (const r of rows) {
    console.log(`│ ${r.map((c, i) => cell(c, widths[i])).join(" │ ")} │`);
  }
  console.log(border("└", "┴", "┘"));
}

async function main(): Promise<void> {
  const [comps, layers] = await Promise.all([
    getAll<Composition>(`/templates/${templateId}/compositions`),
    getAll<Layer>(`/templates/${templateId}/layers`),
  ]);
  const compName = new Map(comps.map((c) => [String(c.aeid), c.name]));
  const nameOf = (id: number | string) => compName.get(String(id)) ?? `comp#${id}`;
  const layersByComp = new Map<string, Layer[]>();
  for (const l of layers) {
    const k = String(l.composition_id);
    (layersByComp.get(k) ?? layersByComp.set(k, []).get(k)!).push(l);
  }

  // ── Problem 2: MAIN composition, announced FIRST ──
  const nestedIds = new Set(
    layers.map((l) => l.source_comp_id).filter(Boolean).map(String),
  );
  const roots = comps.filter((c) => !nestedIds.has(String(c.aeid)));
  const mainComp =
    roots.find((c) => /final|main|master|1920|1080|render|comp/i.test(c.name)) ??
    roots
      .slice()
      .sort(
        (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
      )[0] ??
    comps[0];

  console.log(`\n★ MAIN COMPOSITION TO RENDER: ${mainComp?.name ?? "(?)"}`);
  console.log(`  (put this in the "composition" field of your render job)`);
  if (roots.length > 1) {
    console.log(
      `  other top-level candidates: ${roots
        .filter((c) => c !== mainComp)
        .map((c) => c.name)
        .slice(0, 8)
        .join(", ")}`,
    );
  }

  // ── Discovery (keep — the real fields) ──
  const combos: Record<string, number> = {};
  for (const l of layers) {
    const k = `${l.layer_type}/${l.source_type ?? "null"}`;
    combos[k] = (combos[k] ?? 0) + 1;
  }
  console.log(
    `\n── FIELD DISCOVERY (${comps.length} comps, ${layers.length} layers) ──\n  ` +
      Object.entries(combos)
        .map(([k, v]) => `${k}×${v}`)
        .join("   "),
  );
  console.log("  raw sample (first 2 layers):");
  console.log(
    JSON.stringify(layers.slice(0, 2), null, 2)
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n"),
  );

  // ── THE `data`-BAG PROBE ──
  // Nexrender's v3 layer schema declares `data` as an opaque bag
  // (`additionalProperties: true`) and documents NOTHING about its contents.
  //
  // It is EMPTY (`{}`) on every layer of every real project introspected so far:
  // no font, no size, no timing. Timing lives in the top-level `start_time` /
  // `in_point` / `out_point` fields instead (`agents/template/timeline.ts`), and
  // fonts are not exposed anywhere at all — which is fine, because we never send
  // one and Nexrender resolves the designer's typography itself.
  //
  // This dump exists to catch the day that changes.
  const keyPaths = (obj: unknown, prefix = ""): string[] => {
    if (typeof obj !== "object" || obj === null) return [];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      const kind = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
      const here = `${path} <${kind}>`;
      // One level deep is enough to spot `text.font` / `style.fontSize`.
      return kind === "object" && !prefix
        ? [here, ...keyPaths(v, path)]
        : [here];
    });
  };

  const dataKeys = new Map<string, number>();
  const sampleFor = new Map<string, unknown>();
  const bump = (path: string, value: unknown) => {
    dataKeys.set(path, (dataKeys.get(path) ?? 0) + 1);
    if (!sampleFor.has(path)) sampleFor.set(path, value);
  };
  for (const l of layers) {
    for (const p of keyPaths(l.data)) bump(`layer.data.${p}`, undefined);
  }
  for (const c of comps) {
    for (const p of keyPaths((c as { data?: unknown }).data)) {
      bump(`comp.data.${p}`, undefined);
    }
  }

  console.log("\n── `data` BAG PROBE (undocumented; this is why we look) ──");
  if (dataKeys.size === 0) {
    console.log("  (empty) — no `data` on any layer or composition.");
    console.log("  → fonts are NOT discoverable. Never send `font` in a render");
    console.log("    job; Nexrender's font bank auto-resolves by family name and");
    console.log("    the designer's typography is preserved. Nothing to change.");
  } else {
    for (const [path, n] of [...dataKeys].sort()) {
      console.log(`  ${path}  ×${n}`);
    }
    const fontish = [...dataKeys.keys()].filter((k) => /font|family|size|typeface/i.test(k));
    console.log(
      fontish.length
        ? `\n  ★ FONT-ISH KEYS: ${fontish.join(", ")}`
        : "\n  no font-ish keys — fonts are not exposed here.",
    );
  }

  // The text layers verbatim, so a font value is visible even if it hides under
  // a key name the filter above did not guess.
  const textLayers = layers.filter((l) => (l.layer_type ?? "").toLowerCase().startsWith("text"));
  if (textLayers.length) {
    console.log(`\n  raw TEXT layers (${textLayers.length}) — where a font would live:`);
    console.log(
      JSON.stringify(textLayers.slice(0, 3), null, 2)
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n"),
    );
  }

  // ── Problem 1 + 3: build the fill-in slots ──
  const slots: Slot[] = [];
  for (const l of layers) {
    const t = lower(l.layer_type);
    const s = lower(l.source_type);
    const comp = nameOf(l.composition_id);

    if (t === "text" || t === "textlayer") {
      slots.push({
        asset: "TEXT",
        composition: comp,
        layerName: l.name,
        jobLayerName: l.name,
        put: `your text (was "${l.name}")`,
      });
      continue;
    }
    // Direct file-backed media layer.
    if ((t === "av" || t === "avlayer") && s === "file") {
      const m = extType(l.name);
      if (m) {
        slots.push({
          asset: m,
          composition: comp,
          layerName: l.name,
          jobLayerName: l.name,
          put:
            m === "VIDEO" ? "your clip URL" : m === "IMAGE" ? "your image URL" : "your audio URL",
        });
      }
      continue;
    }
    // Placeholder PRECOMP → a media slot; follow one level in.
    if ((t === "av" || t === "avlayer") && s === "comp" && isPlaceholder(l.name)) {
      const childComp = nameOf(l.source_comp_id ?? "");
      const inner = layersByComp.get(String(l.source_comp_id)) ?? [];
      const target =
        inner.find(
          (x) =>
            lower(x.layer_type) === "av" &&
            (lower(x.source_type) === "file" || lower(x.source_type) === "solid"),
        ) ?? inner[0];
      slots.push({
        asset: "VIDEO",
        composition: childComp,
        layerName: target
          ? target.name
          : `(empty ${childComp} — add footage to this comp)`,
        jobLayerName: target ? target.name : childComp,
        put: target ? "your clip URL" : "your clip URL (empty placeholder comp)",
      });
    }
  }

  // ── Consolidated "WHAT TO FILL IN" ──
  const orderA: Slot["asset"][] = ["VIDEO", "IMAGE", "AUDIO", "TEXT"];
  slots.sort((a, b) => orderA.indexOf(a.asset) - orderA.indexOf(b.asset));
  console.log(`\n★ WHAT TO FILL IN`);
  if (!slots.length) console.log("  (no editable slots detected)");
  else {
    boxTable(
      ["ASSET", "composition", "layerName (exact)", "what to put"],
      [7, 20, 26, 26],
      slots.map((s) => [s.asset, s.composition, s.layerName, s.put]),
    );
  }

  // ── Ignored (short) ──
  const ignored: Record<string, number> = {};
  for (const l of layers) {
    const t = lower(l.layer_type);
    const s = lower(l.source_type);
    const isSlot =
      t === "text" ||
      (t === "av" && s === "file" && extType(l.name)) ||
      (t === "av" && s === "comp" && isPlaceholder(l.name));
    if (isSlot) continue;
    const k =
      t === "av" && s === "comp" ? "nested-comp" : t === "av" ? `av/${s}` : t || "?";
    ignored[k] = (ignored[k] ?? 0) + 1;
  }
  console.log(
    `\n(ignored — structure/control: ${Object.entries(ignored)
      .map(([k, v]) => `${k}×${v}`)
      .join("  ")})`,
  );

  // ── Problem 4: HOW TO INJECT + sample job ──
  const media = slots.filter((s) => s.asset !== "TEXT");
  const texts = slots.filter((s) => s.asset === "TEXT");
  console.log(`\n★ HOW TO INJECT`);
  console.log(
    "  • MEDIA (video/image/audio): a normal asset — Nexrender finds the layer by name\n" +
      "    across comps. For an EMPTY placeholder comp, target its composition and add\n" +
      "    the footage there (verify the inner layer in AE if the name is a guess).",
  );
  console.log(
    "  • TEXT lives in NESTED comps but you render the parent — use a function asset:\n" +
      '    { "type":"function", "name":"nx:text-params-set",\n' +
      '      "params":{ "composition":"<comp>", "layerName":"<layer>", "textValue":"…" } }',
  );

  const job = {
    template: { id: templateId, composition: mainComp?.name ?? "" },
    assets: [
      ...media.map((s, i) => ({
        type: s.asset.toLowerCase(),
        composition: s.composition,
        layerName: s.jobLayerName,
        src: `REPLACE_WITH_${s.asset}_URL_${i + 1}`,
      })),
      ...texts.map((s) => ({
        type: "function",
        name: "nx:text-params-set",
        params: {
          composition: s.composition,
          layerName: s.jobLayerName,
          textValue: `REPLACE_TEXT_${s.jobLayerName}`,
        },
      })),
    ],
  };
  console.log(`\n★ READY-TO-PASTE RENDER JOB (replace the REPLACE_* values):`);
  console.log(JSON.stringify(job, null, 2));
}

main().catch((err: unknown) => {
  const e = err as {
    message?: string;
    cause?: { code?: string; message?: string };
  };
  console.error(`ERROR: ${e.message ?? String(err)}`);
  if (e.cause) {
    console.error(
      `  cause: ${[e.cause.code, e.cause.message].filter(Boolean).join(" ")}`,
    );
  }
  if (e.message === "fetch failed") {
    console.error(
      "  'fetch failed' = network-level (not auth). api.nexrender.com is IPv6-only DNS —\n" +
        "  a broken IPv6 route / proxy / TLS interception is the usual cause.",
    );
  }
  process.exit(1);
});
