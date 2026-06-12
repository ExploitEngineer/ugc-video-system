import type CreativeEditorSDK from "@cesdk/cesdk-js";

/**
 * Called after a successful in-editor export. Receives the rendered MP4 and the
 * serialized editor scene; the implementation uploads both back to the run.
 */
export type OnSaved = (video: Blob, scene: Blob) => Promise<void>;

/**
 * Override the built-in `exportDesign` action so the editor's Export button
 * saves back into the run instead of downloading a file: render the timeline to
 * an MP4, serialize the scene to a string (so the edit can be reopened later),
 * and hand both to `onSaved`.
 */
export function registerActions(
  cesdk: CreativeEditorSDK,
  { onSaved }: { onSaved: OnSaved },
): void {
  cesdk.actions.register("exportDesign", async (options) => {
    const { blobs } = await cesdk.utils.export(options);
    const sceneString = await cesdk.engine.scene.saveToString();
    const sceneBlob = new Blob([sceneString], { type: "application/json" });
    await onSaved(blobs[0], sceneBlob);
  });
}
