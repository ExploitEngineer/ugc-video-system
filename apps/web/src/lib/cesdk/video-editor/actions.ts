/**
 * Video-editor actions hook. Intentionally a NO-OP: the only action this app
 * overrides is `exportDesign` (the "Export Video" button), and that override —
 * which UPLOADS the exported MP4 (+ scene) back to the run instead of downloading
 * a file — lives in ../actions.ts (`registerActions`) and runs AFTER this plugin,
 * so it wins. This hook is kept as the place to register future video-editor
 * actions via `cesdk.actions.register(id, handler)`.
 *
 * @see https://img.ly/docs/cesdk/js/actions-6ch24x
 */

import type CreativeEditorSDK from "@cesdk/cesdk-js";

/**
 * Register actions for the video editor. Currently registers none — see the
 * file header for why the real `exportDesign` override lives in ../actions.ts.
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 */
export function setupActions(cesdk: CreativeEditorSDK): void {
  void cesdk;
}
