"use client";

// CE.SDK editor wrapper. The SDK is a heavy, browser-only WASM app, so this
// component is loaded ONLY via `next/dynamic({ ssr: false })` and imports the
// package dynamically inside the effect — keeping it out of SSR and off every
// other route's bundle. The engine owns its own DOM inside `containerRef`; we
// own its lifecycle (create on mount, dispose on unmount) with a guard for
// React StrictMode's dev mount→unmount→remount.

import type CreativeEditorSDK from "@cesdk/cesdk-js";
import { useEffect, useRef } from "react";

import { initVideoEditor, type OnSaved } from "@/lib/cesdk";

export default function CesdkEditor({
  sourceVideoUrl,
  sceneUrl,
  audioUrl,
  onSaved,
}: {
  sourceVideoUrl: string;
  sceneUrl: string | null;
  // Standalone audio extracted from the source video. When present (fresh edit),
  // we mute the video clip's baked-in audio and add this as its own timeline
  // lane so users can edit audio separately. Null on the resume path (a saved
  // scene already encodes the split) or when extraction failed (keep baked-in).
  audioUrl: string | null;
  onSaved: OnSaved;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<CreativeEditorSDK | null>(null);
  // Latest-callback ref: a new `onSaved` identity must never tear down and
  // re-create the engine, so the effect doesn't depend on it.
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    let disposed = false;
    let local: CreativeEditorSDK | null = null;

    (async () => {
      const { default: CreativeEditorSDK } = await import("@cesdk/cesdk-js");
      const container = containerRef.current;
      if (disposed || !container) return;

      const cesdk = await CreativeEditorSDK.create(container, {
        userId: "ugc-studio",
        license: process.env.NEXT_PUBLIC_CESDK_LICENSE ?? "",
      });
      // Unmounted while `create` was in flight (StrictMode / fast nav) — throw
      // the late instance away so we never leak a second engine.
      if (disposed) {
        cesdk.dispose();
        return;
      }
      local = cesdk;
      instanceRef.current = cesdk;

      await initVideoEditor(cesdk, {
        onSaved: (video, scene) => onSavedRef.current(video, scene),
      });
      if (disposed) return;

      // Resume a saved edit when one exists; otherwise start from the source.
      if (sceneUrl) {
        await cesdk.loadFromURL(sceneUrl);
      } else {
        await cesdk.createFromVideo(sourceVideoUrl);
        if (!disposed && audioUrl) await addSeparateAudioTrack(cesdk, audioUrl);
      }
    })().catch((err) => {
      // Most common cause: the source video URL is blocked by CORS (Supabase
      // Storage must allow this origin) — surfaced here for debugging.
      console.error("Failed to initialize the video editor:", err);
    });

    return () => {
      disposed = true;
      local?.dispose();
      instanceRef.current = null;
    };
  }, [sourceVideoUrl, sceneUrl, audioUrl]);

  return <div ref={containerRef} className="h-full w-full" />;
}

// Split the video's audio into its own timeline lane: add the pre-extracted
// audio file as a standalone `audio` block, then mute the video clip's baked-in
// audio so it doesn't double up. CE.SDK has no "detach audio from video" action,
// so this is how the separate, editable audio track is produced.
async function addSeparateAudioTrack(
  cesdk: CreativeEditorSDK,
  audioUrl: string,
): Promise<void> {
  const { block } = cesdk.engine;
  const page = cesdk.engine.scene.getCurrentPage();
  if (page == null) return;

  // 1) Add the audio as its own timeline lane. Order matters: append to the page
  //    BEFORE loading the resource — appending is what makes the block part of
  //    the timeline (per img.ly's "Add Music" guide). Loading a detached block
  //    first produces no visible lane.
  const audio = block.create("audio");
  block.setString(audio, "audio/fileURI", audioUrl);
  block.appendChild(page, audio);
  await block.forceLoadAVResource(audio);
  block.setTimeOffset(audio, 0);
  block.setDuration(audio, block.getDuration(page)); // align to the clip length

  // 2) Mute the video's baked-in audio so it doesn't double up with the lane.
  //    Mute the video-CLIP graphic blocks directly (the effective way to silence
  //    a clip's audio) — safe because the audio block is a child of the PAGE, not
  //    of any graphic, so this never touches the lane. If instead the video lives
  //    on the page's own fill, mute that FILL — never the page block itself, which
  //    would cascade and silence the appended audio block. Guarded/best-effort.
  const mute = (b: number) => {
    if (block.supportsPlaybackControl(b)) block.setMuted(b, true);
  };
  try {
    // Each video clip: mute both the graphic block and its video fill (whichever
    // is the effective lever) — neither is the page or the audio block.
    for (const g of block.findByType("graphic")) {
      mute(g);
      if (block.hasFill(g)) mute(block.getFill(g));
    }
    // Video-as-page-fill: mute the FILL only, never the page block (that cascades
    // and silences the appended audio block).
    if (block.hasFill(page)) mute(block.getFill(page));
  } catch (err) {
    console.error("Failed to mute baked-in audio:", err);
  }

  // Belt-and-suspenders: make sure the new lane is actually audible.
  block.setMuted(audio, false);
  block.setVolume(audio, 1);
}
