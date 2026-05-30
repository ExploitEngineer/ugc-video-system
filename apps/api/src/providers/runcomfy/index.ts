// RunComfy provider adapter (fallback) — Seedance 2.0 Pro via the RunComfy CLI.
//
// Secondary to the Ark adapter (Ark is the SPEC-canonical, tested path). Same
// VideoProvider boundary so the Video Builder skill is unchanged. The CLI runs
// synchronously (submit → poll → download), so this adapter runs it inside
// `submitVideo`, stashes the downloaded file, and reports completion from
// `pollVideo`. Selected via VIDEO_PROVIDER=runcomfy.

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../../config/index.js";
import type {
  SubmitVideoInput,
  VideoProvider,
  VideoTask,
  VideoTaskResult,
} from "../video.js";

const RUNCOMFY_MODEL = "bytedance/seedance-v2/pro";

// Completed runs keyed by synthetic task id → local file path of the mp4.
const completed = new Map<string, { filePath: string; error?: string }>();

function runCli(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("runcomfy", args, {
      cwd,
      env: env.RUNCOMFY_TOKEN
        ? { ...process.env, RUNCOMFY_TOKEN: env.RUNCOMFY_TOKEN }
        : process.env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`runcomfy exited with code ${code}`)),
    );
  });
}

export function createRunComfyProvider(): VideoProvider {
  return {
    async submitVideo(input: SubmitVideoInput): Promise<VideoTask> {
      if (!env.RUNCOMFY_TOKEN) {
        throw new Error("RUNCOMFY_TOKEN is required for VIDEO_PROVIDER=runcomfy");
      }
      const taskId = randomUUID();
      const outDir = await mkdtemp(join(tmpdir(), `runcomfy-${taskId}-`));
      const payload = {
        prompt: input.prompt,
        image_url: [input.storyboardSheet],
        duration: input.durationSec ?? 15,
        resolution: "720p",
        generate_audio: true,
      };

      try {
        await runCli(
          ["run", RUNCOMFY_MODEL, "--input", JSON.stringify(payload), "--output-dir", outDir],
          outDir,
        );
        const files = await readdir(outDir);
        const mp4 = files.find((f) => f.endsWith(".mp4"));
        if (!mp4) {
          completed.set(taskId, { filePath: "", error: "no mp4 in CLI output" });
        } else {
          completed.set(taskId, { filePath: join(outDir, mp4) });
        }
      } catch (err) {
        completed.set(taskId, {
          filePath: "",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { taskId };
    },

    async pollVideo(task: VideoTask): Promise<VideoTaskResult> {
      const done = completed.get(task.taskId);
      if (!done) return { state: "processing" };
      if (done.error || !done.filePath) {
        return { state: "failed", error: done.error ?? "no output" };
      }
      // Hand the local file back as a data URI so the skill's fetch works uniformly.
      const bytes = await readFile(done.filePath);
      const dataUri = `data:video/mp4;base64,${bytes.toString("base64")}`;
      return { state: "completed", videoUrl: dataUri, hasAudio: true };
    },
  };
}
