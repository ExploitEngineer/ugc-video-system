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
  onSaved,
}: {
  sourceVideoUrl: string;
  sceneUrl: string | null;
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
      if (sceneUrl) await cesdk.loadFromURL(sceneUrl);
      else await cesdk.createFromVideo(sourceVideoUrl);
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
  }, [sourceVideoUrl, sceneUrl]);

  return <div ref={containerRef} className="h-full w-full" />;
}
