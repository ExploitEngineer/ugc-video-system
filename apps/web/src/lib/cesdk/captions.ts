// "Generate with AI" captions for the video editor.
//
// Despite the name, this does NOT call any AI — it reuses the spoken-line
// `transcript` that the pipeline already wrote for every storyboard scene and
// lays them out as ONE caption per scene, each synced to that scene's speech
// window (a single block can only show static text for its whole range, so
// speech-synced text needs one cue per scene — not one block for the clip). The
// user can then split/add more frames with CE.SDK's own "Add new line" +
// timeline editing. The button lives in the img.ly "Add Captions" panel beside
// "Create Manually" / "Import File".
//
// We generate a WebVTT string and feed it to `engine.block.createCaptionsFromURI`
// — the exact mechanism behind the panel's "Import File" — so caption-track
// creation, styling, and fonts all come from img.ly's own import path rather
// than hand-built blocks. Browser-only (CE.SDK is WASM); imported only by the
// dynamically-loaded editor.

import type CreativeEditorSDK from "@cesdk/cesdk-js";
import { toast } from "sonner";

/** A single timed caption: `text` shown from `startSec` to `endSec`. */
export type CaptionCue = { text: string; startSec: number; endSec: number };

// Registered component id for the custom panel button (also referenced in the
// caption panel's component order).
const GENERATE_BUTTON_ID = "ly.img.caption.panel.generateAI";

// `id` of the <style> we inject into CE.SDK's shadow root (idempotency guard).
const CAPTION_STYLE_ID = "ugc-caption-panel-styles";

// CE.SDK ships every Captions-panel cue as a fixed-height <textarea>
// (`height: 8 * scale-base`, `max-height: unset`) that never grows to its
// content — so any line that wraps gets clipped and the browser paints a
// scrollbar with up/down chevrons on each row. That's the "broken" look.
//
// CE.SDK has no public CSS hook, but it mounts its UI in an OPEN shadow root,
// so we inject this override into that root. Targeting by the stable CSS-module
// name substring (the `---hash` suffix changes per SDK build) keeps it from
// breaking on patch bumps. `field-sizing: content` auto-grows the box to its
// text (Chromium), `min-height` is the floor, and `overflow: hidden` kills the
// scrollbar chevrons. Scoped to the caption panel only.
const CAPTION_PANEL_CSS = `
[class*="CaptionInput-module__captionInputWrapper"] textarea {
  field-sizing: content;
  height: auto !important;
  min-height: calc(7 * var(--ubq-scale-base)) !important;
  max-height: none !important;
  overflow: hidden !important;
  resize: none !important;
  line-height: 1.4 !important;
}`;

/** Depth-first search for the first open shadow root under `container`. */
function findShadowRoot(container: HTMLElement): ShadowRoot | null {
  const stack: Element[] = [container];
  while (stack.length > 0) {
    const el = stack.pop();
    if (el == null) continue;
    if (el.shadowRoot != null) return el.shadowRoot;
    stack.push(...Array.from(el.children));
  }
  return null;
}

/**
 * Inject the caption-panel style override into CE.SDK's shadow root. Call once
 * after `CreativeEditorSDK.create` resolves (the host element + its shadow root
 * exist by then); the rule applies to caption rows whenever the panel renders.
 * Best-effort: a missing root or DOM error must never break the editor.
 */
export function injectCaptionPanelStyles(container: HTMLElement): void {
  try {
    const root = findShadowRoot(container);
    if (root == null || root.getElementById(CAPTION_STYLE_ID) != null) return;
    const style = document.createElement("style");
    style.id = CAPTION_STYLE_ID;
    style.textContent = CAPTION_PANEL_CSS;
    root.appendChild(style);
  } catch (err) {
    console.warn("Could not inject caption panel styles:", err);
  }
}

/**
 * Map scene texts onto a timeline as ONE cue per scene, each synced to that
 * scene's speech window. `segments` is grouped per equal-length video window
 * (one group for the 15s single clip; one per 15s segment for merged 30/45/60s
 * runs). Each group's window is split evenly across its scenes; the last
 * sub-slot absorbs rounding. A scene with empty text yields no cue (its slot
 * stays blank) — transcript only, never a substitute. The user can split/add
 * more frames from the editor afterwards.
 */
export function buildSceneCaptionCues(
  segments: string[][],
  totalDurationSec: number,
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  const segCount = segments.length;
  if (segCount === 0 || totalDurationSec <= 0) return cues;

  const segWindow = totalDurationSec / segCount;
  for (let s = 0; s < segCount; s++) {
    const texts = segments[s];
    const n = texts.length;
    if (n === 0) continue;

    const segStart = s * segWindow;
    const segEnd = s === segCount - 1 ? totalDurationSec : (s + 1) * segWindow;
    const step = (segEnd - segStart) / n;

    for (let i = 0; i < n; i++) {
      const text = texts[i].trim();
      if (!text) continue; // empty transcript → no cue
      const sceneStart = segStart + i * step;
      const sceneEnd = i === n - 1 ? segEnd : segStart + (i + 1) * step;
      cues.push({ text, startSec: sceneStart, endSec: sceneEnd });
    }
  }
  return cues;
}

/** `HH:MM:SS.mmm` — the WebVTT timestamp format. */
function fmtTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const ms = Math.round(clamped * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (v: number, len = 2) => String(v).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(millis, 3)}`;
}

/** Serialize cues to a WebVTT document. */
export function cuesToVtt(cues: CaptionCue[]): string {
  const blocks = cues.map(
    (c) =>
      `${fmtTimestamp(c.startSec)} --> ${fmtTimestamp(c.endSec)}\n${c.text}`,
  );
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

// Longhand block types — `createCaptionsFromURI` and the track use these.
const CAPTION_TRACK_TYPE = "//ly.img.ubq/captionTrack";
const CAPTION_PRESET_SOURCE = "ly.img.caption.presets";
// img.ly's default caption look (white text + outline). Applying a preset is
// what gives the caption blocks their typeface/styling — without it they exist
// but render nothing.
const CAPTION_PRESET_ID = "ly.img.caption.presets.outline";

/**
 * Build the per-scene cues from the current clip length, create the caption
 * blocks, then attach + style them exactly the way CE.SDK's own "Import File"
 * handler does: `createCaptionsFromURI` returns DETACHED blocks, so we must
 * parent them to a fresh `captionTrack` on the page and apply the outline
 * preset, or nothing renders. Returns how many caption blocks were created.
 */
export async function generateCaptionsFromCues(
  cesdk: CreativeEditorSDK,
  segments: string[][],
): Promise<number> {
  const { block, scene, asset, editor } = cesdk.engine;
  const page = scene.getCurrentPage();
  if (page == null) return 0;

  const total = block.getDuration(page);
  const cues = buildSceneCaptionCues(segments, total);
  if (cues.length === 0) return 0;

  // Parse the VTT into caption blocks (their timing comes from the cue
  // timestamps). The blocks come back detached from any track/page.
  const url = URL.createObjectURL(
    new Blob([cuesToVtt(cues)], { type: "text/vtt" }),
  );
  let ids: number[];
  try {
    ids = await block.createCaptionsFromURI(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  if (ids.length === 0) return 0;

  // Attach: build a new caption track, parent every caption to it, drop any
  // pre-existing track (destroying it removes its caption children — clean
  // regenerate), then parent the new track to the page so it joins the timeline.
  const existingTrack = block
    .getChildren(page)
    .find((child) => block.getType(child) === CAPTION_TRACK_TYPE);
  const track = block.create(CAPTION_TRACK_TYPE);
  for (const id of ids) block.appendChild(track, id);
  if (existingTrack != null) block.destroy(existingTrack);
  block.appendChild(page, track);

  // Frame + style (CapCut-style resize, finished in the loop below). First lay
  // each caption out at 80% width with auto-hugging height so the engine computes
  // a snug fitted frame, then apply the outline preset to the first caption (it
  // cascades to the track). Mirrors the SDK's handler, including the temporary
  // 300 DPI bump used while the preset is applied.
  const sceneBlock = scene.get();
  const prevDpi =
    sceneBlock != null ? block.getFloat(sceneBlock, "scene/dpi") : null;
  if (sceneBlock != null) block.setFloat(sceneBlock, "scene/dpi", 300);
  for (const id of ids) {
    block.setWidthMode(id, "Percent");
    block.setWidth(id, 0.8);
    block.setHeightMode(id, "Auto");
  }
  try {
    const preset = await asset.fetchAsset(
      CAPTION_PRESET_SOURCE,
      CAPTION_PRESET_ID,
      {
        locale: cesdk.i18n.getLocale(),
      },
    );
    if (preset != null) {
      await asset.applyToBlock(CAPTION_PRESET_SOURCE, preset, ids[0]);
    }
  } catch (err) {
    // Preset failed to load (offline CDN, etc.) — captions still render with
    // engine defaults; don't fail the whole operation.
    console.warn("Caption preset could not be applied:", err);
  }
  if (sceneBlock != null && prevDpi != null) {
    block.setFloat(sceneBlock, "scene/dpi", prevDpi);
  }

  // Lock in CapCut-style resize. Auto-fit font (engine default, set explicitly)
  // keeps the text filling its frame, so both corner-scale and edge-resize
  // rescale it smoothly and it never overflows. `clipLinesOutsideOfFrame` guards
  // against any spill outside the box; `minAutomaticFontSize` keeps the text
  // readable when shrunk (a soft minimum). Then MATERIALIZE the auto-computed
  // frame to Absolute pixels: the corner handles call `scale()`, which needs a
  // concrete width/height reference — while the height is "Auto" a cold-start
  // corner drag collapses the text, so pinning the fitted size fixes that.
  for (const id of ids) {
    block.setBool(id, "caption/automaticFontSizeEnabled", true);
    block.setBool(id, "caption/clipLinesOutsideOfFrame", true);
    block.setFloat(id, "caption/minAutomaticFontSize", 8);
    const fw = block.getFrameWidth(id);
    const fh = block.getFrameHeight(id);
    if (fw > 0 && fh > 0) {
      block.setWidthMode(id, "Absolute");
      block.setWidth(id, fw);
      block.setHeightMode(id, "Absolute");
      block.setHeight(id, fh);
    }
  }

  // Center the captions and record a single undo step for the whole operation.
  block.alignHorizontally([ids[0]], "Center");
  block.alignVertically([ids[0]], "Center");
  editor.addUndoStep();

  // Flip the panel to its edit view (the create-only button hides; the editable
  // caption list shows) — matches the native import flow.
  cesdk.ui.setOrderContext({ in: "ly.img.caption.panel" }, { view: "edit" });

  return ids.length;
}

/**
 * Register the "Generate with AI" button and place it in the Add Captions panel
 * (create view) beside "Import File". No-op visual when there are no transcripts
 * (button disabled).
 */
export function setupCaptionGenerator(
  cesdk: CreativeEditorSDK,
  segments: string[][],
): void {
  const hasText = segments.some((group) =>
    group.some((t) => t.trim().length > 0),
  );

  cesdk.ui.registerComponent(GENERATE_BUTTON_ID, ({ builder }) => {
    builder.Button("ai-captions.generate", {
      label: "Generate with AI",
      icon: "@imgly/Effects",
      isDisabled: !hasText,
      onClick: async () => {
        try {
          const created = await generateCaptionsFromCues(cesdk, segments);
          if (created === 0) {
            toast.error("No scene dialogue available to caption.");
          } else {
            toast.success("Generated captions from the script.");
          }
        } catch (err) {
          console.error("Failed to generate captions:", err);
          toast.error("Couldn’t generate captions.");
        }
      },
    });
  });

  // Show it only in the panel's "create" view (the Add Captions screen),
  // right after the built-in "Import File" button.
  cesdk.ui.insertOrderComponent(
    {
      in: "ly.img.caption.panel",
      after: "ly.img.caption.panel.import",
      when: { view: "create" },
    },
    GENERATE_BUTTON_ID,
  );
}
