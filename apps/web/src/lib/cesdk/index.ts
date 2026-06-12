// img.ly CE.SDK Video Editor configuration.
//
// `initVideoEditor` takes a freshly-created CreativeEditorSDK instance and turns
// it into the full Video Editor — the dock (Templates / Elements / Uploads /
// Images / Videos / Audio / Text / Shapes / Stickers), the timeline, the
// inspector toolbar, and the video feature set. That UI all comes from the
// `VideoEditorConfig` plugin (ported from img.ly's Video Editor starter kit
// under ./video-editor); on top of it we register the asset libraries, set the
// dark theme, add the "Export Video" button, and override the export action to
// save the result back into the run. It deliberately does NOT load content —
// the wrapper component loads the source video (or a saved scene) afterwards.
// Browser-only (WASM): import only from a client component behind
// `next/dynamic({ ssr: false })`.

import type CreativeEditorSDK from "@cesdk/cesdk-js";
import {
  BlurAssetSource,
  CaptionPresetsAssetSource,
  ColorPaletteAssetSource,
  CropPresetsAssetSource,
  DemoAssetSources,
  EffectsAssetSource,
  FiltersAssetSource,
  ImageColorsAssetSource,
  PagePresetsAssetSource,
  PremiumTemplatesAssetSource,
  StickerAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  UploadAssetSources,
  VectorShapeAssetSource,
} from "@cesdk/cesdk-js/plugins";

import { type OnSaved, registerActions } from "./actions";
import { VideoEditorConfig } from "./video-editor/plugin";

export type { OnSaved } from "./actions";

export async function initVideoEditor(
  cesdk: CreativeEditorSDK,
  { onSaved }: { onSaved: OnSaved },
): Promise<void> {
  // 1. The full Video Editor UI: features, dock, timeline, inspector, canvas,
  //    panels, and engine settings. (Internally runs `resetEditor()`, so this
  //    must come before everything else below.)
  await cesdk.addPlugin(new VideoEditorConfig());

  cesdk.ui.setTheme("dark");

  // 2. Asset libraries that populate the dock panels (same curated set +
  //    include-filters as the starter kit). Engine + demo content resolve from
  //    the img.ly CDN (no `baseURL` set), which auto-matches the installed SDK
  //    version — fine for dev; production should self-host. Registered
  //    best-effort: a library that fails to fetch must never blank the editor.
  const sources = [
    new BlurAssetSource(),
    new CaptionPresetsAssetSource(),
    new ImageColorsAssetSource(),
    new ColorPaletteAssetSource(),
    new CropPresetsAssetSource(),
    new UploadAssetSources({
      include: [
        "ly.img.image.upload",
        "ly.img.video.upload",
        "ly.img.audio.upload",
      ],
    }),
    new DemoAssetSources({
      include: [
        "ly.img.templates.video.*",
        "ly.img.image.*",
        "ly.img.audio.*",
        "ly.img.video.*",
      ],
    }),
    new EffectsAssetSource(),
    new FiltersAssetSource(),
    new PagePresetsAssetSource({
      include: [
        "ly.img.page.presets.instagram.*",
        "ly.img.page.presets.facebook.*",
        "ly.img.page.presets.x.*",
        "ly.img.page.presets.linkedin.*",
        "ly.img.page.presets.pinterest.*",
        "ly.img.page.presets.tiktok.*",
        "ly.img.page.presets.youtube.*",
        "ly.img.page.presets.video.*",
      ],
    }),
    new StickerAssetSource(),
    new TextAssetSource(),
    new TextComponentAssetSource(),
    new TypefaceAssetSource(),
    new VectorShapeAssetSource(),
    new PremiumTemplatesAssetSource({
      include: ["ly.img.templates.premium.*"],
    }),
  ];
  const results = await Promise.allSettled(
    sources.map((source) => cesdk.addPlugin(source)),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`CE.SDK: ${failed} asset source(s) failed to load`);
  }

  // 3. "Export Video" button in the navigation bar → runs the `exportDesign`
  //    action (which we override in step 4 to upload instead of download).
  cesdk.i18n.setTranslations({
    en: { "actions.export.video": "Export Video" },
  });
  cesdk.ui.insertOrderComponent(
    { in: "ly.img.navigation.bar", position: "end" },
    {
      id: "ly.img.action.navigationBar",
      key: "actions.export.video",
      color: "accent",
      icon: "@imgly/Video",
      label: "actions.export.video",
      onClick: async () => {
        await cesdk.actions.run("exportDesign", { mimeType: "video/mp4" });
      },
    },
  );

  // 4. Our `exportDesign` override (registered LAST so it wins over the
  //    starter kit's download): export the MP4 + serialize the scene, then
  //    hand both to `onSaved` to upload them back to the run.
  registerActions(cesdk, { onSaved });
}
