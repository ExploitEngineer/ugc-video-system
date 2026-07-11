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
 * Extract the audio track of a video as a standalone AAC/m4a file. Used by the
 * editor's "separate audio lane" feature: the baked-in audio (Seedance-native,
 * or the merged multi-segment mix) can't be detached inside CE.SDK, so the API
 * pulls it out once and serves it as its own asset. Reuses the same semaphore,
 * download, and signal/timeout-aware ffmpeg runner as `mergeSegmentUrls` —
 * `-vn` drops the video so this is a cheap, audio-only re-encode.
 */
/**
 * Cut `[startSec, startSec + durationSec)` out of a clip.
 *
 * Used to fill a template's video slots: one 15s master is sliced into a piece
 * per slot, each showing a different moment of the same continuous shot.
 * Nexrender cannot do this — a job asset replaces the footage item and carries
 * no in-point — so the cut happens here.
 *
 * Seeks AFTER `-i` (output seeking). Input seeking is faster but lands on the
 * nearest keyframe, which would silently shift a 2s cutaway by up to a second.
 * These clips are 15 seconds; accuracy is worth the decode.
 *
 * ALWAYS MUTED. Slicing a clip with a baked-in voiceover yields stuttering
 * half-words across the slots, with silence in the gaps between them. The
 * master's speech is laid over the finished render whole instead
 * (`muxVoiceover`).
 */
export async function sliceClip(
  videoUrl: string,
  opts: {
    startSec: number;
    durationSec: number;
    /**
     * Resize the slice to exactly this, cropping rather than letterboxing.
     *
     * The template's placeholder layer carries the designer's transform, sized
     * for the source they expected. `replaceSource` keeps that transform, and an
     * unnamed layer cannot be autoscaled afterwards — so footage of the original
     * source's dimensions is the only way the shot lands where they put it.
     */
    targetSize?: { width: number; height: number };
  },
): Promise<{ bytes: Uint8Array; mime: string }> {
  const { startSec, durationSec, targetSize } = opts;
  if (!(durationSec > 0)) {
    throw new Error(`sliceClip: durationSec must be positive, got ${durationSec}`);
  }

  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-slice-${randomUUID()}-`));
  try {
    const input = join(dir, "in.mp4");
    await fetchToFile(videoUrl, input);
    const out = join(dir, "out.mp4");

    // h264 needs even dimensions; a layer box can be fractional.
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const scaleCrop = targetSize
      ? [
          "-vf",
          `scale=${even(targetSize.width)}:${even(targetSize.height)}:force_original_aspect_ratio=increase,` +
            `crop=${even(targetSize.width)}:${even(targetSize.height)},setsar=1`,
        ]
      : [];

    log.info("▶ slicing clip", {
      startSec,
      durationSec,
      size: targetSize ? `${targetSize.width}x${targetSize.height}` : "source",
    });
    await runFfmpegWithRetry(
      [
        "-y",
        "-i", input,
        "-ss", String(startSec),
        "-t", String(durationSec),
        "-an",
        ...scaleCrop,
        // Match mergeSegmentUrls' normalize pass, so slices and merged clips
        // decode identically in After Effects.
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-threads", String(FFMPEG_THREADS),
        "-movflags", "+faststart",
        out,
      ],
      "slice-clip",
    );

    const bytes = await readFile(out);
    if (bytes.length === 0) {
      throw new Error(
        `sliceClip: produced an empty file for [${startSec}, ${startSec + durationSec}]`,
      );
    }
    log.info("✓ clip sliced", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "video/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Grab a single frame from a video as a JPEG poster.
 *
 * Used for the template library's preview cards: the `<video>` element shows
 * this until the card is hovered, so the grid never has to decode a dozen clips
 * just to render. Seeks ~1s in rather than to frame 0, because the first frame
 * of a rendered AE template is very often a black or empty fade-in.
 *
 * Seeking BEFORE `-i` is the fast path (ffmpeg jumps to the nearest keyframe
 * instead of decoding up to it). If the clip is shorter than the seek target
 * that yields no frames, so we retry from the very start.
 */
export async function extractPoster(
  videoUrl: string,
  atSeconds = 1,
): Promise<{ bytes: Uint8Array; mime: string }> {
  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-poster-${randomUUID()}-`));
  try {
    const input = join(dir, "in.mp4");
    await fetchToFile(videoUrl, input);
    const out = join(dir, "out.jpg");

    const grab = (seek: number) =>
      runFfmpegWithRetry(
        [
          "-y",
          ...(seek > 0 ? ["-ss", String(seek)] : []),
          "-i", input,
          "-frames:v", "1",
          "-q:v", "3", // visually lossless enough for a card thumbnail
          "-threads", String(FFMPEG_THREADS),
          out,
        ],
        "extract-poster",
      );

    log.info("▶ extracting poster frame", { atSeconds });
    await grab(atSeconds);
    let bytes = await readFile(out).catch(() => null);
    if (!bytes || bytes.length === 0) {
      // Clip shorter than the seek target — take the first frame instead.
      log.warn("poster seek past end of clip; retrying from frame 0");
      await grab(0);
      bytes = await readFile(out);
    }

    log.info("✓ poster extracted", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "image/jpeg" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

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

/**
 * Does this file carry an audio stream?
 *
 * There is no ffprobe in this image — `ffmpeg-static` ships the encoder alone —
 * so ask the stream mapper. `-map 0:a:0` against a silent file fails with
 * "Stream map '0:a:0' matches no streams"; decoding 0.1s to nowhere is cheap.
 */
async function hasAudioStream(file: string): Promise<boolean> {
  try {
    await runFfmpeg(
      ["-y", "-i", file, "-map", "0:a:0", "-t", "0.1", "-f", "null", "-"],
      "probe-audio",
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Lay a voiceover over a finished video.
 *
 * This is how a template ad gets its speech. Most After Effects templates have
 * no audio layer at all, so there is nowhere for Nexrender to inject the track —
 * and even the ones that do would only receive it if the designer happened to
 * name a layer we can find. Muxing afterwards works for every template, and the
 * result is one continuous voiceover across the whole ad rather than a fragment
 * under each scene.
 *
 * `-shortest` trims the 15s master's track to the composition's real runtime.
 * If the render brought its own audio — a music bed the designer baked in — the
 * bed is ducked under the voice rather than discarded.
 */
export async function muxVoiceover(
  videoUrl: string,
  audioUrl: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-mux-${randomUUID()}-`));
  try {
    const video = join(dir, "in.mp4");
    const audio = join(dir, "vo.m4a");
    await Promise.all([
      fetchToFile(videoUrl, video),
      fetchToFile(audioUrl, audio),
    ]);
    const out = join(dir, "out.mp4");

    const bed = await hasAudioStream(video);
    log.info("▶ muxing voiceover", { musicBed: bed });

    // The video is stream-copied in both branches: only audio re-encodes.
    const audioArgs = bed
      ? [
          "-filter_complex",
          "[0:a]volume=0.25[bed];[1:a][bed]amix=inputs=2:duration=first:dropout_transition=0[a]",
          "-map", "0:v:0",
          "-map", "[a]",
        ]
      : ["-map", "0:v:0", "-map", "1:a:0"];

    await runFfmpegWithRetry(
      [
        "-y",
        "-i", video,
        "-i", audio,
        ...audioArgs,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-ac", "2",
        // The voiceover outlives the composition; the render decides the length.
        "-shortest",
        "-threads", String(FFMPEG_THREADS),
        "-movflags", "+faststart",
        out,
      ],
      "mux-voiceover",
    );

    const bytes = await readFile(out);
    if (bytes.length === 0) {
      throw new Error("muxVoiceover: produced an empty file");
    }
    log.info("✓ voiceover muxed", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "video/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Hard-cap a finished video at `maxSec`, cropping anything past it.
 *
 * A template composition can run longer than the 15s master (many or long
 * slots), but the product is always a 15s ad, so the render is trimmed to length
 * here. Re-encodes rather than stream-copying so the cut lands exactly at maxSec,
 * not the nearest earlier keyframe. The muxed voiceover / baked audio is carried
 * through. `-t` never pads: a clip already shorter than maxSec passes through at
 * its own length.
 */
export async function capVideoDuration(
  bytes: Uint8Array,
  maxSec: number,
): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!(maxSec > 0)) {
    throw new Error(`capVideoDuration: maxSec must be positive, got ${maxSec}`);
  }

  await acquire();
  const dir = await mkdtemp(join(tmpdir(), `ugc-cap-${randomUUID()}-`));
  try {
    const input = join(dir, "in.mp4");
    await writeFile(input, bytes);
    const out = join(dir, "out.mp4");

    log.info("▶ capping video duration", { maxSec, bytesIn: bytes.length });
    await runFfmpegWithRetry(
      [
        "-y",
        "-i", input,
        "-t", String(maxSec),
        // Same normalize pass as sliceClip / mergeSegmentUrls, so the cropped
        // output decodes identically to the rest of the pipeline's clips.
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "48000",
        "-ac", "2",
        "-threads", String(FFMPEG_THREADS),
        "-movflags", "+faststart",
        out,
      ],
      "cap-duration",
    );

    const capped = await readFile(out);
    if (capped.length === 0) {
      throw new Error("capVideoDuration: produced an empty file");
    }
    log.info("✓ video capped", { bytes: capped.length });
    return { bytes: new Uint8Array(capped), mime: "video/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
