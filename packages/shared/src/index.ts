// Shared types and utilities consumed by both `web` and `api`.

export const APP_NAME = "ugc-video-system";

export interface Video {
  id: string;
  title: string;
  url: string;
  status: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
}
