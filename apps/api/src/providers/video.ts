// Shared video-provider boundary — Kling 3.0 Pro via the OpenRouter adapter.
//
// The Video Builder skill depends on this interface only, never on a concrete
// SDK/REST, so the provider is swappable. Kling runs async: submit a job, then
// poll until the video is ready, then download the (auth-gated) content URL.

export interface SubmitVideoInput {
  /** Full storyboard sheet (URL or data URI) sent as the first-frame reference. */
  storyboardSheet: string;
  /** Text prompt describing motion/ad style for the ~15s clip. */
  prompt: string;
  /** Target duration in seconds (~15). */
  durationSec?: number;
  /** Optional person/product reference sheet URLs sent as style guidance. */
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
