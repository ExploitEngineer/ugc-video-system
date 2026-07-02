// Video concatenation for the multi-segment pipeline — merge N ~15s Seedance
// clips into one continuous mp4, preserving each segment's native audio.
//
// Memory is the binding constraint here, not CPU: the old single-pass concat
// FILTER graph held N h264 decoders + one libx264 encoder open at once and got
// OOM-killed on small hosts (ffmpeg dies by signal → exit code null). So the
// merge now runs in three cheap passes, each holding at most ONE decoder and
// ONE encoder:
//   A. per segment, sequentially: normalize to pinned params (resolution, SAR,
//      fps, pix_fmt, audio rate/channels) + the shared grade + loudnorm,
//      encoded with libx264 veryfast.
//   B. concat DEMUXER with `-c copy` — safe because pass A makes the streams
//      uniform by construction; this pass is pure remuxing (trivial memory).
//   C. only with a music bed: mix the (looped) ducked music under the native
//      audio; video is stream-copied, so only audio re-encodes.
// A process-wide semaphore still caps how many merges run at once, ffmpeg gets
// a hard timeout + signal-aware exit handling, and a signal/timeout kill is
// retried once (memory pressure is often transient). Raw stderr never leaves
// `FfmpegError.detail` — it must not end up in `runs.error`.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { fetchWithRetry } from "../http.js";
import { createLogger } from "../log.js";

const log = createLogger("merge");

/** Cap concurrent merges across the process (each is one active encode). */
const MAX_CONCURRENT_MERGES = 1;
/** Per-ffmpeg thread cap so one merge can't monopolise every core. */
const FFMPEG_THREADS = 2;
/** Hard backstop per ffmpeg invocation — a pass that runs this long is hung. A
 *  normalize/concat/mix pass on a ~15–60s clip finishes in low minutes; 4 min
 *  is generous while bounding how long a stuck pass can hold the merge slot. */
const FFMPEG_TIMEOUT_MS = 4 * 60 * 1000;
/**
 * Pinned output fps. Seedance clips are 24fps; pinning makes every pass-A
 * intermediate identical (a hard requirement for the `-c copy` concat) and is
 * a no-op when the source already matches.
 */
const TARGET_FPS = 24;

// ── Continuity normalization (multi-segment only — never on the 15s path) ──
// Per-segment loudness normalization to ONE target so audio levels match across
// the cuts (no volume jump at each seam). Single-pass loudnorm is enough here:
// the clips come from the same Seedance settings, so they start close.
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11";
// ONE shared, mild grade so the clips sit in a single look across the cuts.
// Per-frame deterministic, so applying it per segment (pass A) is identical to
// grading the concatenated video.
const GRADE_EQ = "eq=contrast=1.03:saturation=1.05:gamma=1.0";
// Music-bed loudness (quieter than dialogue) + the sidechain ducker: the music
// dips whenever the native audio (dialogue) is present, so on-camera UGC speech
// is never drowned.
const MUSIC_LOUDNORM = "loudnorm=I=-20:TP=-2:LRA=11";
const MUSIC_DUCK = "sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300";

export interface MergeOptions {
  /**
   * Optional continuous music bed (URL). When set, one track is mixed under the
   * whole merged video and ducked beneath the native per-clip audio. When unset,
   * the merge keeps each segment's native audio unchanged apart from the
   * loudnorm + grade normalization.
   */
  musicBedUrl?: string;
  /**
   * Expected output resolution (from the run's aspect ratio + the provider
   * resolution setting). Segments are letterboxed/scaled to exactly this size in
   * pass A so the `-c copy` concat can never hit a resolution mismatch. When
   * absent, segments keep their native size (fine in practice — one run's clips
   * share generation settings).
   */
  targetSize?: { width: number; height: number };
}

/**
 * A failed/killed/hung ffmpeg invocation. `message` is short and clean (safe
 * to surface); the stderr tail rides in `detail` for logs + step_events only.
 */
export class FfmpegError extends Error {
  readonly kind: "signal" | "timeout" | "exit";
  /** Last ~1200 chars of ffmpeg stderr — NEVER for `runs.error`. */
  readonly detail: string;

  constructor(kind: "signal" | "timeout" | "exit", message: string, detail: string) {
    super(message);
    this.name = "FfmpegError";
    this.kind = kind;
    this.detail = detail;
  }
}

let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_MERGES) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const res = await fetchWithRetry(url, undefined, { label: "segment-download" });
  if (!res.ok) throw new Error(`segment download failed: ${res.status} ${url}`);
  await writeFile(dest, new Uint8Array(await res.arrayBuffer()));
}

function runFfmpeg(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static binary path is null"));
      return;
    }
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, FFMPEG_TIMEOUT_MS);
    proc.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      const tail = stderr.slice(-1200);
      if (timedOut) {
        reject(
          new FfmpegError(
            "timeout",
            `ffmpeg (${label}) timed out after ${FFMPEG_TIMEOUT_MS}ms and was killed`,
            tail,
          ),
        );
      } else if (code === 0) {
        resolve();
      } else if (signal != null || code == null) {
        // Killed by a signal (close reports code=null) — on a busy/small host
        // this is almost always the kernel OOM killer.
        reject(
          new FfmpegError(
            "signal",
            `ffmpeg (${label}) was killed by ${signal ?? "a signal"} — likely out of memory`,
            tail,
          ),
        );
      } else {
        reject(new FfmpegError("exit", `ffmpeg (${label}) exited with code ${code}`, tail));
      }
    });
  });
}

/**
 * Run ffmpeg, retrying ONCE if it was killed (signal/timeout) — transient
 * memory pressure usually clears. Real encode failures (nonzero exit) are
 * deterministic and not retried.
 */
async function runFfmpegWithRetry(args: string[], label: string): Promise<void> {
  try {
    await runFfmpeg(args, label);
  } catch (err) {
    // Retry ONLY a signal/OOM kill (usually transient memory pressure). A
    // TIMEOUT means the pass is genuinely stuck — retrying just holds the single
    // process-wide merge slot for another full timeout, stalling every other
    // run's merge + audio-extract. A nonzero `exit` is deterministic, not retried.
    if (err instanceof FfmpegError && err.kind === "signal") {
      log.warn(`ffmpeg (${label}) ${err.kind} — retrying once`, { err: err.message });
      await runFfmpeg(args, label);
      return;
    }
    throw err;
  }
}

/** Pass-A video filter: optional letterbox to the target size, pinned SAR/fps, shared grade. */
function normalizeVf(targetSize?: { width: number; height: number }): string {
  const scalePad = targetSize
    ? `scale=${targetSize.width}:${targetSize.height}:force_original_aspect_ratio=decrease,` +
      `pad=${targetSize.width}:${targetSize.height}:(ow-iw)/2:(oh-ih)/2,`
    : "";
  return `${scalePad}setsar=1,fps=${TARGET_FPS},${GRADE_EQ}`;
}

/**
 * Download `urls` (ordered segment clips), normalize each to uniform stream
 * parameters (pass A, one at a time), concatenate them losslessly with the
 * concat demuxer (pass B), optionally mix a ducked music bed under the native
 * audio (pass C), and return the merged bytes. Temp files live under the OS
 * tmp dir and are removed in a `finally`. Throttled by the module semaphore.
 */
export async function mergeSegmentUrls(
  urls: string[],
  opts: MergeOptions = {},
): Promise<{ bytes: Uint8Array; mime: string }> {
  if (urls.length < 2) {
    throw new Error(`merge needs at least 2 segments, got ${urls.length}`);
  }

  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-merge-${randomUUID()}-`));
  try {
    // Download all segments in parallel to local files.
    const inputs = await Promise.all(
      urls.map(async (url, i) => {
        const dest = join(dir, `seg-${i}.mp4`);
        await fetchToFile(url, dest);
        return dest;
      }),
    );
    // Optional music bed → its own local file.
    let musicFile: string | null = null;
    if (opts.musicBedUrl) {
      musicFile = join(dir, "music.bin");
      try {
        await fetchToFile(opts.musicBedUrl, musicFile);
      } catch (err) {
        // A bad MUSIC_BED_URL must not kill the run — fall back to no music.
        log.warn("music bed download failed — merging without it", {
          err: err instanceof Error ? err.message : String(err),
        });
        musicFile = null;
      }
    }

    const n = inputs.length;
    log.info("▶ merging segments", {
      count: n,
      music: Boolean(musicFile),
      targetSize: opts.targetSize
        ? `${opts.targetSize.width}x${opts.targetSize.height}`
        : null,
    });

    // Pass A — normalize each segment SEQUENTIALLY (one decoder + one encoder
    // alive at a time; this is what keeps peak memory flat regardless of N).
    const vf = normalizeVf(opts.targetSize);
    const normalized: string[] = [];
    for (let i = 0; i < n; i++) {
      const out = join(dir, `norm-${i}.mp4`);
      await runFfmpegWithRetry(
        [
          "-y",
          "-i", inputs[i],
          "-vf", vf,
          "-af", `${LOUDNORM},aresample=48000`,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "20",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-ar", "48000",
          "-ac", "2",
          "-threads", String(FFMPEG_THREADS),
          out,
        ],
        `normalize-seg-${i}`,
      );
      normalized.push(out);
      log.info(`✓ normalized segment ${i + 1}/${n}`);
    }

    // Pass B — pure remux: every intermediate has identical stream parameters
    // by construction, so the concat demuxer can stream-copy safely.
    const listFile = join(dir, "list.txt");
    // concat-demuxer quoting: a `'` inside the path (possible via TMPDIR) ends
    // the quoted string and must be spliced back in escaped, ffmpeg-style.
    await writeFile(
      listFile,
      normalized.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n"),
    );
    const merged = join(dir, "merged.mp4");
    await runFfmpegWithRetry(
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listFile,
        "-c", "copy",
        "-movflags", "+faststart",
        merged,
      ],
      "concat",
    );

    // Pass C — mix the (looped, loudness-matched, ducked) music bed under the
    // native audio. Video is stream-copied; only audio re-encodes. Best-effort:
    // music is OPTIONAL, so a bad/incompatible bed must never discard a good video.
    let finalFile = merged;
    if (musicFile) {
      try {
        const withMusic = join(dir, "final.mp4");
        const filter =
          `[0:a]asplit=2[ack][acm];` +
          `[1:a]${MUSIC_LOUDNORM}[mraw];` +
          `[mraw][ack]${MUSIC_DUCK}[mduck];` +
          `[acm][mduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
        await runFfmpegWithRetry(
          [
            "-y",
            "-i", merged,
            // Loop the music to cover the full video; `-shortest` trims it.
            "-stream_loop", "-1",
            "-i", musicFile,
            "-filter_complex", filter,
            "-map", "0:v",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-threads", String(FFMPEG_THREADS),
            "-shortest",
            "-movflags", "+faststart",
            withMusic,
          ],
          "music-mix",
        );
        finalFile = withMusic;
      } catch (err) {
        // A URL that 200s with non-audio bytes (HTML error page, expired CDN
        // object) downloads fine but has no audio stream, so pass C fails here.
        // Fall back to the music-free concat instead of failing the whole run.
        log.warn("music mix failed — using the music-free merge", {
          err: err instanceof Error ? err.message : String(err),
        });
        finalFile = merged;
      }
    }

    const bytes = await readFile(finalFile);
    log.info("✓ merge complete", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "video/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Strip the audio from a clip — copy the video stream, drop audio (`-an`), so no
 * re-encode (fast + lossless). Used by the Plainly stage when the user turns the
 * original voice OFF: we feed Plainly the muted clip, so the rendered template
 * carries only its own audio (music bed), never the Seedance voice. Plainly bakes
 * audio at render time, so muting must happen on the INPUT — it can't be removed
 * from the output afterward. Reuses the merge semaphore + ffmpeg runner.
 */
export async function muteVideo(
  videoUrl: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-mute-${randomUUID()}-`));
  try {
    const input = join(dir, "in.mp4");
    await fetchToFile(videoUrl, input);
    const out = join(dir, "out.mp4");
    log.info("▶ muting clip audio");
    await runFfmpegWithRetry(
      [
        "-y",
        "-i", input,
        "-c", "copy", // stream-copy video (no re-encode)
        "-an", // drop the audio track
        "-movflags", "+faststart",
        out,
      ],
      "mute-clip",
    );
    const bytes = await readFile(out);
    log.info("✓ clip muted", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "video/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Replace a clip's audio with a single music track. The public Plainly designs
 * bake the template's STOCK music into the render and expose no param to remove
 * it (a `newsMusic` URL adds/overrides only one layer; a separate baked track —
 * and the clip's own voice — still plays). So when the user supplies their own
 * music we OWN the final audio: drop the rendered output's audio entirely (the
 * `0:a` stream is never mapped) and mux ONLY the user's track, looped + trimmed
 * to the video length (`-shortest`). Video is stream-copied (no re-encode); only
 * the new audio encodes. Music-only on purpose — designs re-time the clip to
 * their fixed duration, so re-muxing the raw clip voice would desync. Reuses the
 * merge semaphore + signal/timeout-aware ffmpeg runner.
 */
export async function replaceAudioWithMusic(
  videoUrl: string,
  musicUrl: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-clipaudio-${randomUUID()}-`));
  try {
    const video = join(dir, "video.mp4");
    await fetchToFile(videoUrl, video);
    const music = join(dir, "music.bin");
    await fetchToFile(musicUrl, music);
    const out = join(dir, "out.mp4");
    log.info("▶ replacing clip audio with music track");
    await runFfmpegWithRetry(
      [
        "-y",
        "-i", video,
        // Loop the music to cover the full video; `-shortest` trims it.
        "-stream_loop", "-1",
        "-i", music,
        "-map", "0:v", // branded visuals
        "-map", "1:a", // ONLY the music (output's baked audio is dropped)
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-ac", "2",
        "-threads", String(FFMPEG_THREADS),
        "-shortest",
        "-movflags", "+faststart",
        out,
      ],
      "replace-audio",
    );
    const bytes = await readFile(out);
    log.info("✓ clip audio replaced", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "video/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Extract the audio track of a video as a standalone AAC/m4a file. Used by the
 * editor's "separate audio lane" feature: the baked-in audio (Seedance-native,
 * or the merged multi-segment mix) can't be detached inside CE.SDK, so the API
 * pulls it out once and serves it as its own asset. Reuses the same semaphore,
 * download, and signal/timeout-aware ffmpeg runner as `mergeSegmentUrls` —
 * `-vn` drops the video so this is a cheap, audio-only re-encode.
 */
export async function extractAudio(
  videoUrl: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-audio-${randomUUID()}-`));
  try {
    const input = join(dir, "in.mp4");
    await fetchToFile(videoUrl, input);
    const out = join(dir, "out.m4a");
    log.info("▶ extracting audio");
    await runFfmpegWithRetry(
      [
        "-y",
        "-i", input,
        "-vn", // drop video — audio-only output
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-ac", "2",
        "-threads", String(FFMPEG_THREADS),
        "-movflags", "+faststart",
        out,
      ],
      "extract-audio",
    );
    const bytes = await readFile(out);
    log.info("✓ audio extracted", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "audio/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
