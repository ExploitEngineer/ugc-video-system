// Ark provider adapter (stub) — Volcengine / BytePlus Seedance 2.0 video.
//
// Adapter boundary: the Video Builder skill depends on this interface only,
// never on the Ark SDK/REST directly, so the provider is swappable.
// Seedance runs async: submit a task, then poll until the video is ready.
// Real implementation lands in F6.

export interface SubmitVideoInput {
  /** Full storyboard sheet (URL or data URI) sent as the visual reference. */
  storyboardSheet: string;
  /** Text prompt describing motion/audio/ad style for the ~15s clip. */
  prompt: string;
  /** Target duration in seconds (~15). */
  durationSec?: number;
}

export interface VideoTask {
  /** Ark task id, used to poll. */
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

export interface ArkProvider {
  /** Submit the storyboard sheet → returns a task to poll. */
  submitVideo(input: SubmitVideoInput): Promise<VideoTask>;
  /** Poll a previously submitted task. */
  pollVideo(task: VideoTask): Promise<VideoTaskResult>;
}

const notImplemented = (name: string): never => {
  throw new Error(`ArkProvider.${name} not implemented (lands in F6)`);
};

/** Stub factory. Replace internals in F6; the interface is the contract. */
export function createArkProvider(): ArkProvider {
  return {
    submitVideo: () => notImplemented("submitVideo"),
    pollVideo: () => notImplemented("pollVideo"),
  };
}
