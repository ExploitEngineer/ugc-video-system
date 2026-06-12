// Video concatenation for the 60s pipeline — merge four ~15s Seedance clips
// into one continuous 60s mp4, preserving each segment's native audio.
//
// There is no streaming concat we can trust here: the four clips come back from
// Seedance and, while usually uniform, can differ in exact fps/SAR/audio rate.
// The fast concat demuxer breaks on any mismatch (A/V drift), so we NORMALIZE +
// re-encode via the concat filter, which is robust at the cost of CPU. ffmpeg
// runs as a child process (does NOT block the event loop), but libx264 on 60s of
// 1080p spikes CPU — so a process-wide semaphore caps how many merges run at
// once across all in-flight runs.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { fetchWithRetry } from "../http.js";
import { createLogger } from "../log.js";

const log = createLogger("merge");

/** Cap concurrent re-encodes across the process (libx264 is CPU-heavy). */
const MAX_CONCURRENT_MERGES = 1;
/** Per-ffmpeg thread cap so one merge can't monopolise every core. */
const FFMPEG_THREADS = 2;

// ── Continuity normalization (60s only — this module is never on the 15s path) ──
// Per-segment loudness normalization to ONE target so audio levels match across
// the cuts (no volume jump at each seam). Single-pass loudnorm is enough here:
// the four clips come from the same Seedance settings, so they start close.
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11";
// ONE shared, mild grade applied to the whole concatenated video so the four
// clips sit in a single look across the cuts. Deliberately gentle — the clips
// already share the locked visual-style bible; this just removes residual drift.
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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static binary path is null"));
      return;
    }
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += String(d);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

/**
 * Build the `-filter_complex` graph + output maps for the merge.
 *
 * Always: per-segment loudnorm (matched levels across cuts) → concat (in order,
 * per-segment audio preserved) → one shared grade on the whole video.
 *
 * With a music bed (`musicInputIdx` set): the native concatenated audio is split;
 * one copy is the sidechain key that ducks the (looped) music, then the music is
 * mixed back under the native audio so dialogue always reads on top.
 */
function buildFilter(
  n: number,
  musicInputIdx: number | null,
): { filter: string; vLabel: string; aLabel: string } {
  const norm = Array.from(
    { length: n },
    (_, i) => `[${i}:a]${LOUDNORM}[a${i}]`,
  ).join(";");
  const concatIn = Array.from(
    { length: n },
    (_, i) => `[${i}:v][a${i}]`,
  ).join("");
  const concat = `${concatIn}concat=n=${n}:v=1:a=1[vc][ac]`;
  const grade = `[vc]${GRADE_EQ}[v]`;

  if (musicInputIdx == null) {
    return { filter: `${norm};${concat};${grade}`, vLabel: "[v]", aLabel: "[ac]" };
  }

  // Split the native audio: one branch is the sidechain key (ducks the music),
  // the other is mixed with the ducked music. `amix duration=first` ends with
  // the (finite) native audio so the infinite looped music can't run on.
  const music =
    `[ac]asplit=2[ack][acm];` +
    `[${musicInputIdx}:a]${MUSIC_LOUDNORM}[mraw];` +
    `[mraw][ack]${MUSIC_DUCK}[mduck];` +
    `[acm][mduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
  return { filter: `${norm};${concat};${grade};${music}`, vLabel: "[v]", aLabel: "[a]" };
}

/**
 * Download `urls` (ordered segment clips), concatenate them into one mp4 with
 * the concat filter (re-encoded, in order), and return the merged bytes. The
 * four clips' native audio is normalized to one loudness target (matched levels
 * across the cuts) and the video gets one shared grade so it reads as a single
 * look. When `opts.musicBedUrl` is set, one continuous track is mixed under the
 * whole video and ducked beneath the native audio. Temp files live under the OS
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
    // Optional music bed → its own local file, added as the LAST input so it
    // sits at index `n` (after the n segments) for the filtergraph.
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
    const out = join(dir, "merged.mp4");

    const n = inputs.length;
    const musicIdx = musicFile ? n : null;
    const { filter, vLabel, aLabel } = buildFilter(n, musicIdx);
    const args = [
      "-y",
      ...inputs.flatMap((f) => ["-i", f]),
      // Loop the music to cover the full video; `-shortest` trims it to length.
      ...(musicFile ? ["-stream_loop", "-1", "-i", musicFile] : []),
      "-filter_complex",
      filter,
      "-map",
      vLabel,
      "-map",
      aLabel,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-threads",
      String(FFMPEG_THREADS),
      "-movflags",
      "+faststart",
      ...(musicFile ? ["-shortest"] : []),
      out,
    ];

    log.info("▶ merging segments", { count: n, music: Boolean(musicFile) });
    await runFfmpeg(args);
    const bytes = await readFile(out);
    log.info("✓ merge complete", { bytes: bytes.length });
    return { bytes: new Uint8Array(bytes), mime: "video/mp4" };
  } finally {
    release();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
