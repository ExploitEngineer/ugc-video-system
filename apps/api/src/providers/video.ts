// Shared video-provider boundary — Seedance 2.0 via the BytePlus adapter.
//
// The Video Builder skill depends on this interface only, never on a concrete
// SDK/REST, so the provider is swappable. Seedance runs async: submit a
// task, then poll until the video is ready.

export interface SubmitVideoInput {
  /** Full storyboard sheet (URL or data URI) sent as the visual reference. */
  storyboardSheet: string;
  /** Text prompt describing motion/audio/ad style for the ~15s clip. */
  prompt: string;
  /** Target duration in seconds (~15). */
  durationSec?: number;
}

export interface VideoTask {
  /** Provider task id, used to poll. */
  taskId: string;
}

export type VideoTaskState = "processing" | "completed" | "failed";

export interface VideoTaskResult {
  state: VideoTaskState;
  /** Present when `state === "completed"`. */
  videoUrl?: string;
  hasAudio?: boolean;
  error?: string;
}

export interface VideoProvider {
  /** Submit the storyboard sheet → returns a task to poll. */
  submitVideo(input: SubmitVideoInput): Promise<VideoTask>;
  /** Poll a previously submitted task. */
  pollVideo(task: VideoTask): Promise<VideoTaskResult>;
}
