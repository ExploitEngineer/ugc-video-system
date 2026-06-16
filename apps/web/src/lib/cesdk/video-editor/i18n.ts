/**
 * Internationalization Configuration - Customize Labels and Translations
 *
 * This file configures custom translations for the video editor UI.
 * You can override any built-in label or add translations for new languages.
 *
 * @see https://img.ly/docs/cesdk/js/user-interface/localization-508e20/
 */

import type CreativeEditorSDK from "@cesdk/cesdk-js";

/**
 * Configure translations for the video editor.
 *
 * Translations allow you to:
 * - Customize button labels and UI text
 * - Support multiple languages
 * - Match your brand voice
 * - Provide context-specific terminology
 *
 * @param cesdk - The CreativeEditorSDK instance to configure
 *
 * @example Changing the locale
 * ```typescript
 * cesdk.i18n.setLocale('de');
 * ```
 */
export function setupTranslations(cesdk: CreativeEditorSDK): void {
  // Expose CE.SDK's built-in entrance/exit animations *as transitions*.
  //
  // CE.SDK has no true clip-to-clip transition primitive (no overlapping
  // crossfade). The way to add a transition is: split a clip on the timeline,
  // then apply an exit animation to the left piece + an entrance animation to
  // the right piece at the cut. Those animations live under the "Animations"
  // button — a name users won't read as "transition". Relabel the In/Out
  // groups to "Transition In/Out" (and the button to "Transitions &
  // Animations") so the workflow is discoverable. Loop animations
  // (breathing/pulsating) are genuinely not transitions, so their label is
  // left unchanged. Pure label override — no behavior change. Keys taken from
  // the @cesdk/cesdk-js 1.76 English bundle.
  cesdk.i18n.setTranslations({
    en: {
      // Inspector button + panel title (image/video and text blocks)
      "input.animations": "Transitions & Animations",
      "libraries.ly.img.animations.ly.img.animations.label":
        "Transitions & Animations",
      "libraries.ly.img.textAnimations.ly.img.animations.label":
        "Transitions & Animations",
      // Entrance group → "Transition In"
      "libraries.ly.img.animations.ly.img.animations.in.label":
        "Transition In",
      "libraries.ly.img.textAnimations.ly.img.animations.in.label":
        "Transition In",
      // Exit group → "Transition Out"
      "libraries.ly.img.animations.ly.img.animations.out.label":
        "Transition Out",
      "libraries.ly.img.textAnimations.ly.img.animations.out.label":
        "Transition Out",
    },
  });
}
