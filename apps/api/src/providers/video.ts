// Shared video-provider boundary — Kling 3.0 Pro via the OpenRouter adapter.
//
// The Video Builder skill depends on this interface only, never on a concrete
// SDK/REST, so the provider is swappable. Kling runs async: submit a job, then
// poll until the video is ready, then download the (auth-gated) content URL.

export interface SubmitVideoInput {
  /** Text prompt describing motion/ad style for the ~15s clip. */
  prompt: string;
  /** Target duration in seconds (~15). */
  durationSec?: number;
  /**
   * Optional clean first-frame image (URL or data URI) for image-to-video.
   * Omit to drive generation purely from the reference sheets + prompt — this
   * is deliberately NOT the annotated storyboard sheet, whose panel numbers,
   * arrows and captions would otherwise be animated into the final clip.
   */
  firstFrame?: string;
  /** Person/product reference sheet URLs sent as identity/style guidance. */
  referenceImages?: string[];
}

export interface VideoTask {
  /** Provider job id. */
  taskId: string;
  /** Absolute URL to poll for this job (provider-supplied). */
  pollUrl?: string;
}

export type VideoTaskState = "processing" | "completed" | "failed";

export interface VideoTaskResult {
  state: VideoTaskState;
  /** Present when `state === "completed"`. */
  videoUrl?: string;
  hasAudio?: boolean;
  /** Headers required to GET `videoUrl` (e.g. auth for unsigned content URLs). */
  downloadHeaders?: Record<string, string>;
  error?: string;
}

export interface VideoProvider {
  /** Submit the storyboard sheet → returns a job to poll. */
  submitVideo(input: SubmitVideoInput): Promise<VideoTask>;
  /** Poll a previously submitted job. */
  pollVideo(task: VideoTask): Promise<VideoTaskResult>;
}
