# Plainly Videos API — integration research & plan

> Status: **research + design doc only** (no code shipped yet). Read this to decide
> _Designs vs custom template_ and _Option A vs Option B_ below, then we build.
>
> What this covers: what Plainly is, how it fits our Seedance pipeline, the full
> setup, every endpoint we'd use and what it does, the two ways to wire it in, the
> data-model/code changes each needs, gotchas, pricing, and a 1-day validation plan.
>
> Verified against `help.plainlyvideos.com` (June 2026). Facts taken straight from
> a marketing page or the pasted research (not re-verified) are tagged **[verify live]**.

---

## 1. What Plainly is & why it fits us

**Plainly Videos** renders Adobe **After Effects** projects in the cloud via a REST
API. The model is "merge fields for video": a designer builds an `.aep` with
placeholder layers (text, image, audio, **video footage**, color); at render time
you POST a `parameters` map that fills those layers; Plainly renders and gives back
a finished MP4. Professional motion design stays in AE; you swap dynamic content
per render.

**Why it fits this system.** Our pipeline already produces Seedance MP4 **clips** and
stores them in Supabase Storage as **stable public URLs** (the public `ugc-assets`
bucket). Plainly's one hard input requirement is exactly that:

> "Media assets you're sending to Plainly have to be stored on the Internet … a
> public URL, or a signed URL with long-enough validity period. Before starting the
> render, Plainly will validate links … If any … is invalid … you end up with an
> invalid render." — Plainly docs

So the single biggest reliability risk in any "AI-clip → assembler" pipeline
(expiring source URLs) **does not apply to us** — our clips are already permanently
public. A clip URL looks like:

```
https://hmrxavtdeykgtzyxojip.supabase.co/storage/v1/object/public/ugc-assets/runs/<runId>/segment_video-<uuid>.mp4
```

**What Plainly buys us over the current ffmpeg merge:** AE-grade branded assembly —
lower-thirds, logo stings, transitions, captions, music, intros/outros, and
templated brand variations — instead of a plain concatenation.

**What it costs:** the assembly/branding must be authored as an After Effects
template (there is no web template builder). See §2.

---

## 2. Two ways to get a template (you want both)

A render always targets a `projectId` + `templateId`. There are two sources:

### 2a. Plainly **Designs** (no After Effects needed) — the shipped default path

Plainly ships ready-made public template "Designs" you can render directly by their
`projectId` (the docs example uses `media-abstract@v1` with `templateId: "square"`).
Good for getting started and for users with no AE skills — less branding control.

- **Designs are a separate namespace from `/projects`.** Discover them via
  `GET /api/v2/designs` (list, each with `variants[]` + rendered-example previews) and
  `GET /api/v2/designs/{id}` (the param keys). The design's `id` is the render
  `projectId`; each `variant.id` is the `templateId`. (Confirmed live + against
  Plainly's official MCP server.)
- **Gotcha:** because designs are NOT projects, `GET /projects/{designId}/templates/{tid}`
  **404s** for a design — use the `/designs` endpoints to introspect them.
- **How we use it (shipped):** `apps/api/src/providers/plainly/designs.ts` pins a curated
  allow-list of the video-capable `media-*` designs + their shared param schema
  (`MEDIA_DESIGN_PARAMS`). At request time `listDesignsEnriched()` calls
  `GET /api/v2/designs`, confirms each curated id still exists (drops any that don't),
  and attaches the live preview MP4 + category. The editor shows them as a card grid.
- **⚠️ Video-into-Design caveat:** the public Design API does NOT declare a media
  subtype (`MEDIA` only, no `image`/`video`), and the catalog skews image+text
  (the official render example feeds `image` a still `picsum.photos` URL). A given
  design's main slot may treat our MP4 as a **still frame** rather than playing it.
  Verify with one render (`scripts/plainly-smoke.ts`) and WATCH the output before
  trusting a design. If the clip freezes, the reliable fix is a custom `.aep` (§2b,
  `plainly-aep-template-spec.md`) whose layer is a real `MEDIA (video)` slot.

### 2b. Custom `.aep` upload (full control)

Author your own AE template, upload it, parametrize the layers.

- **Author in AE:** put each dynamic video in **its own composition** with no effects
  applied directly to the footage; give layers a **consistent name/prefix** (e.g.
  `editClip1`, `editClip2`, `brandLogo`, `headline`, `musicTrack`) so Plainly
  auto-detects them as parameters.
- **Bake scripting** for variable-length/aspect AI clips (critical — Seedance clips
  vary): media **auto-scale** (`fill` + `fixedRatio`), **set-duration / trim /
  stretch**, and **spread-layers** (lay clips end-to-end so comp length follows the
  clips). Set these up once in the template. **[verify live]** exact script names.
- **Upload:** `POST /api/v2/projects` (see §5). Plainly analyzes it
  (`uploaded → analyzing → render ready`); then you define/READ a Template and its
  parameter names.

> In the product, "use a default template" = a Design; "use my own" = an uploaded
> project + template. The integration should let the user pick either per run.

---

## 3. Setup & prerequisites

1. **Account / plan.** Sign up (14-day free trial = Pro-level limits **and** API
   access, no card **[verify live]**). Pick a paid plan for production (§11).
2. **API key.** Create it in the dashboard under **Organization settings → API
   keys**. Treat it as a server secret.
3. **A template to render.** Either a Plainly **Design** `projectId`, or your own
   **uploaded + analyzed** project + template (§2).
4. **Env vars** (added to `apps/api/src/config/index.ts` Zod schema when we build —
   mirrors the `BYTEPLUS_*` pattern):

   | Var                                           | Required     | Default                                | Purpose                                                   |
   | --------------------------------------------- | ------------ | -------------------------------------- | --------------------------------------------------------- |
   | `PLAINLY_API_KEY`                             | yes          | —                                      | Basic-auth username                                       |
   | `PLAINLY_API_BASE_URL`                        | no           | `https://api.plainlyvideos.com/api/v2` | base URL                                                  |
   | `PLAINLY_POLL_INTERVAL_MS`                    | no           | `5000`                                 | poll cadence (poll mode)                                  |
   | `PLAINLY_POLL_TIMEOUT_MS`                     | no           | `1800000` (30 min)                     | poll dead-man's switch                                    |
   | `PLAINLY_WEBHOOK_URL`                         | webhook mode | —                                      | public callback, e.g. `https://api.prod/webhooks/plainly` |
   | `PLAINLY_WEBHOOK_SECRET`                      | webhook mode | —                                      | HMAC-on-passthrough secret                                |
   | `PLAINLY_DEFAULT_PROJECT_ID` / `_TEMPLATE_ID` | no           | —                                      | a default template for quick runs                         |

---

## 4. Authentication

HTTP **Basic** auth: **API key = username, password empty** (note the trailing colon).

```bash
curl -u "$PLAINLY_API_KEY:" https://api.plainlyvideos.com/api/v2/renders
# → Authorization: Basic base64("<API_KEY>:")
```

In our code (Node):

```ts
const authHeader =
  "Basic " + Buffer.from(`${process.env.PLAINLY_API_KEY}:`).toString("base64");
```

No Bearer-token flow. Keep the key server-side only (never reaches the browser),
same as `BYTEPLUS_API_KEY` / `OPENAI_API_KEY`.

---

## 5. Endpoint reference (what each does)

Base: `https://api.plainlyvideos.com/api/v2`. All calls Basic-authed.

### Renders

| Method / path             | Does                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /renders`           | Trigger a render. Body `{ projectId, templateId, parameters{}, webhook?{} , options?, attributes? }`. Returns a `Render` `{ id, state, parameters, parametrizationResults, output: null, … }`. Validation (params + media-URL reachability) is **synchronous** → an unreachable URL comes back `INVALID` immediately. |
| `GET /renders/{renderId}` | Fetch one render's `state` + `output` (URL when `DONE`). Used by **poll mode**.                                                                                                                                                                                                                                       |
| `GET /renders`            | List/paginate/filter renders (by attributes); also cancel/resubmit/delete/re-trigger webhook.                                                                                                                                                                                                                         |
| `POST /batch`             | Submit many renders in one request (Batch API).                                                                                                                                                                                                                                                                       |

### Projects (custom `.aep`)

| Method / path                        | Does                                                                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /projects`                     | Create a project. `multipart/form-data`: **either** `file` (zipped AE package) **or** `fileUrl` (a public/signed URL Plainly downloads), plus `name`, `description`. Kicks off analysis. |
| `GET /projects/{projectId}`          | Project info + analysis state (`analyzed` boolean / lifecycle).                                                                                                                          |
| `GET /projects/{projectId}/meta`     | Project metadata tree.                                                                                                                                                                   |
| `POST /projects/{projectId}/options` | Project-level default render options (output format, webhook).                                                                                                                           |

### Templates (discover the parameter names)

| Method / path                                      | Does                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /projects/{projectId}/templates/{templateId}` | Returns the template incl. `layers[]`, each with its `parametrization` (the **parameter name**, `layerType` = `DATA`\|`MEDIA`\|`COMPOSITION`, `mediaType`, `mandatory`, `defaultValue`). **Call this first** to learn exactly which keys to put in `parameters`. |

### Designs

| Method / path                 | Does                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v2/designs`         | List ready-made Designs: `[{ id, name, description, category, variants:[{ id, name, aspectRatio, duration, examples:[{ videoUrl, … }] }] }]`. `examples[].videoUrl` is a rendered **preview** of the variant, not an input slot. |
| `GET /api/v2/designs/{id}`    | One Design's flat `parameters[]` (`{ key, type, name, optional, defaultValue, sampleValue }`) — `key` is the `parameters` map key. |

Render a public Design by passing its `id` as `projectId` (+ a `variant.id` as
`templateId`) to `POST /renders` — no upload, no clone step. Designs are a separate
namespace, so `GET /projects/{designId}/templates/{tid}` 404s — introspect via
`/api/v2/designs/{id}` instead. The render response carries `publicDesign: true`.

### Create-render example (official shape)

```bash
curl -X POST -H "Content-Type: application/json" -u "$PLAINLY_API_KEY:" \
  -d '{
    "projectId": "media-abstract@v1",
    "templateId": "square",
    "parameters": {
      "image": "https://picsum.photos/1920/1920",
      "newsHeading": "Plainly Videos",
      "newsCta": "Book a demo"
    },
    "webhook": { "url": "https://example.com/render-callback", "passthrough": "job-123" }
  }' \
  https://api.plainlyvideos.com/api/v2/renders
```

---

## 6. Injecting our Seedance clips (the crux)

Fully supported — render `parameters` values can be **text, hex color, or media URLs
(image, audio, AND video)**. A footage layer is parametrized as a **URL input**; pass
the clip URL.

**Flow:**

1. `GET /projects/{projectId}/templates/{templateId}` → read `layers[]`, note each
   `MEDIA` layer's `mediaType: "video"` parameter name (e.g. `clip1`, `clip2`).
2. Pull this run's clip URLs from our DB. For 30/45/60s runs that's the
   `segment_video` assets (one per ~15s segment); for 15s it's the single clip. These
   are already public `ugc-assets` URLs — pass them straight through.
3. `POST /renders` with the clips mapped to the media params + any text/brand params:

```jsonc
{
  "projectId": "<PROJECT_ID>",
  "templateId": "<TEMPLATE_ID>",
  "parameters": {
    "clip1": "https://hmrxavtdeykgtzyxojip.supabase.co/storage/v1/object/public/ugc-assets/runs/<runId>/segment_video-<uuidA>.mp4",
    "clip2": "https://hmrxavtdeykgtzyxojip.supabase.co/storage/v1/object/public/ugc-assets/runs/<runId>/segment_video-<uuidB>.mp4",
    "headline": "Generated with Seedance",
    "brandLogo": "https://hmrxavtdeykgtzyxojip.supabase.co/storage/v1/object/public/ugc-assets/...logo.png",
    "musicTrack": "https://.../music.mp3",
  },
  "webhook": { "url": "<OUR_CALLBACK>", "passthrough": "<runId>" },
}
```

**Variable-length / aspect:** Seedance clips differ in length and ratio — the AE
template must use the scripting from §2b (auto-scale, set-duration, spread) so the
layout absorbs them. This is the main advantage over a dumb concat, and the main
template-engineering cost. **HEVC/AV1/HEIC inputs are auto-converted**; a conversion
failure → `INVALID` render. **[verify live]**

---

## 7. Render lifecycle & getting the result

**States:** `PENDING → (INVALID | THROTTLED) → QUEUED → IN-PROGRESS → DONE | ERROR`.
`INVALID` = bad params/URL (synchronous); `THROTTLED` = over your concurrency cap
(auto-starts later); `ERROR` = render failed.

**Output expires.** On `DONE`, the render exposes `output` (a public MP4 URL) plus an
`expirationDate`. Plainly does **not** keep renders indefinitely (24h–7d by plan), so
we **must download the output and re-host it** into our own `ugc-assets` bucket
immediately — exactly what we already do for Seedance outputs.

There are two ways to learn a render finished. **We can ship poll first and add
webhook later — they're not mutually exclusive.**

### 7a. Polling (recommended for v1)

`GET /renders/{renderId}` until `state` is `DONE`/`ERROR`/`INVALID`. This mirrors how
our worker already polls Seedance (`apps/api/src/agents/video/index.ts` poll loop with
`BYTEPLUS_POLL_INTERVAL_MS` / `BYTEPLUS_POLL_TIMEOUT_MS`). Zero new infrastructure —
no public route, no signature handling. Best fit for our **in-process worker**.

```ts
async function waitForRender(
  renderId: string,
  { tries = 360, delayMs = 5000 } = {},
) {
  for (let i = 0; i < tries; i++) {
    const r = await getRender(renderId); // GET /renders/{id}
    if (r.state === "DONE") return r.output; // a URL → download + re-host
    if (r.state === "ERROR" || r.state === "INVALID")
      throw new Error(`Render ${r.state}`);
    await sleep(delayMs);
  }
  throw new Error("Render timed out");
}
```

### 7b. Webhook (production scale)

Supply `webhook: { url, passthrough, onFailure, onInvalid }` on the render; Plainly
POSTs your `url` when the render reaches a **final** state. The handler reads
`{ renderId, success, output, error, passthrough }`.

Constraints to honour:

- **Ack within ~30s with a 2xx**, then offload the download/re-host to the worker
  (don't do heavy work in the request). Plainly retries failed deliveries with
  backoff for ~1 day → **make the handler idempotent** (dedupe on `renderId`).
- **No signed-header spec.** Roll our own: HMAC the `passthrough` (the `runId`) with
  `PLAINLY_WEBHOOK_SECRET`, append as a query param on the callback URL, verify in the
  handler.
- Needs a **public** callback URL and a **new route** (`routes/webhooks.ts` →
  `POST /webhooks/plainly`, registered in `app.ts`) — we have **no inbound-webhook
  routes today**, and it must sit outside browser CORS.
- **[verify live]** the exact payload field names with a real test render before
  coding against them (the docs' Express example uses `renderId`/`output`; some
  delivery docs say `renderingId`).

**Bonus:** Plainly can also push the finished video straight to S3/GCS/Drive/etc via
its **delivery integrations** — an alternative to manual re-hosting.

---

## 8. Two ways to wire Plainly into our pipeline (you choose later)

Today: `… → segment_video (×N) → merge (ffmpeg) → final_video → [optional CE.SDK editor]`
(15s skips merge: `… → video → final_video`). Files: `agents/video/index.ts`,
`agents/merge/index.ts` + `lib/video/merge.ts`, sequenced by
`agents/creative-direction/plan.ts` `nextStep` + executed in `orchestrator.ts`.

### Option A — optional branded-render step (recommended default, non-destructive)

Add a new **`plainly_render`** step that runs **after** the clips exist, consumes the
`segment_video` URLs (or the single 15s clip), renders the branded video via Plainly,
re-hosts it as a **new `plainly_video` asset**, and leaves the ffmpeg `merge` path
untouched. The run can surface both the plain merged video and the Plainly-branded one;
the user opts in per run (e.g. picked a template).

```
… → segment_video (×N) → merge → plainly_render → done      (multi-clip)
… → video → plainly_render → done                            (15s)
```

- Pros: zero risk to the working pipeline; A/B the two outputs; opt-in.
- Cons: pays for both the ffmpeg merge and the Plainly render.

### Option B — replace the ffmpeg merge

Plainly's AE template does the stitching **and** branding/music, so `plainly_render`
**replaces** the `merge` step (and `lib/video/merge.ts` stops being the assembler for
runs that use a template).

```
… → segment_video (×N) → plainly_render → done
```

- Pros: one assembler; AE-grade output is the final video.
- Cons: every multi-clip run now depends on Plainly + an AE template; ffmpeg merge
  becomes a fallback only.

**Both options share the same building blocks** (provider adapter, step, persist,
config, poll/webhook) — they differ only in whether `plainly_render` runs **after** or
**instead of** `merge`. Start with A; flip to B once a template is trusted.

---

## 9. Data model & code surfaces (for the later build)

Provider boundary first: Plainly is a **distinct async job** (assembly, not
generation), so it does **not** implement our `VideoProvider` interface
(`submitVideo`/`pollVideo` over a storyboard sheet). New adapter:

- **`apps/api/src/providers/plainly/index.ts`** — `submitRender({projectId, templateId, parameters, webhook?})`, `pollRender(renderId)`, `downloadOutput(url)`; Basic auth; mirrors `providers/byteplus/index.ts` structure + the `providers/index.ts` factory.
- **`apps/api/src/config/index.ts`** — add the `PLAINLY_*` env (table in §3).
- **`apps/api/src/agents/plainly/index.ts`** — the step skill: gather clip URLs from `agents/creative-direction/inputs.ts`-style queries, build `parameters`, submit, poll (or await webhook), download, persist.
- **State machine:** add `"plainly_render"` to the shared `stepSchema` (`@ugc/shared`) → `pgEnum("step", …)` in `db/schema.ts` (needs a **migration**) → a `case` in `plan.ts` `nextStep` (after `merge`/`video` for A, replacing `merge` for B) → a `case` in `orchestrator.ts` `executeStep`.
- **Assets/videos:** new asset kind **`plainly_video`** (shared `assetKind` enum + pg enum + migration); persist via `persistSheet`/`uploadAsset` (`lib/storage.ts`, `agents/persist.ts`); `videos.providerMeta = { provider: "plainly", renderId, projectId, templateId }`.
- **Render↔run mapping:** store `renderId` in `providerMeta` (poll mode) or a column so the webhook can find the run by `passthrough = runId`.
- **Per-run template choice:** `runs.plainly_template_id` + `runs.plainly_params` jsonb (or reuse `brandText`/brand assets as params) — migration.
- **Webhook (Option 7b only):** `apps/api/src/routes/webhooks.ts` `POST /webhooks/plainly` + register in `app.ts`; HMAC verify; ack-fast + hand off to the worker; `notifyRunChanged(runId)`.
- **Surfacing:** `lib/mappers.ts` `toRunDetailDto` already lists all assets; `routes/runs.ts` `isSettled` closes the SSE stream on `final_video` — extend it to also accept `plainly_video` when that's the chosen final. The existing SSE (`GET /runs/:id/events`, `notifyRunChanged`) carries progress to the UI with no new transport.
- **Web UI:** a template picker (Design vs custom) + a "render branded version" trigger; status rides the existing SSE + asset list.

---

## 10. Reliability & gotchas

- **Inputs:** our clip URLs are already public + permanent → no re-host of inputs needed (the usual #1 failure mode is moot for us).
- **Outputs expire → re-host immediately** (24h–7d). Reuse `uploadAsset`.
- **Rate/concurrency:** 25,000 max open (non-final) renders → HTTP 429; **400 req/min** avg (burst 600) + `Retry-After`; per-plan concurrency → `THROTTLED` (auto-starts). Queue submissions; back off on 429.
- **Idempotency:** dedupe on `renderId` (webhook retries up to a day).
- **AE template authoring is a real cost** (no web builder); variable-length clips need scripting set up up front.
- **No official SDK** — REST via fetch (an official MCP server + AE plugin + `plainly-videos/examples` repo exist).
- **Confirm with a live test:** exact webhook payload field names; whether a Designs-list API exists; auto-conversion of HEVC/AV1; trial limits; pricing.

---

## 11. Pricing & plans (published; **[verify live]** before committing)

Metered by **rendered video minutes** (exact seconds; a 30s video = 0.5 min; errored
renders refunded; drafts free) + **concurrent renders** + **retention**.

| Plan       | Monthly  | Render min/mo | Concurrent | Retention                              |
| ---------- | -------- | ------------- | ---------- | -------------------------------------- |
| Starter    | $69      | 50            | up to 2    | 24h                                    |
| Explorer   | $134     | 100           | up to 4    | 48h                                    |
| Team       | $259     | 200           | up to 8    | 72h                                    |
| Pro        | $649     | 600           | up to 16   | 7 days                                 |
| Unlimited  | ~$1,350+ | unlimited     | from 2     | —                                      |
| Enterprise | custom   | custom        | custom     | custom (SSO, static-IP webhooks, SLAs) |

14-day trial = Pro limits + API access. All paid tiers include API, scripting, custom
output formats, thumbnails, and the delivery integrations.

---

## 12. Stage 0 — validate before building (~1 day)

1. Start the free trial; create an API key.
2. Get one template: either pick a **Design**, or build a **minimal `.aep`** with two
   video placeholder layers + a headline + a music layer and upload it (`POST /projects`).
3. `GET /projects/{id}/templates/{tid}` to read the media parameter names.
4. `curl` a render passing **two real `ugc-assets` clip URLs** from a recent run as the
   media params (the §6 example). Poll `GET /renders/{id}` to `DONE`.
5. Download `output`; judge: did the video clips inject correctly, did auto-scale
   handle the aspect/length, is the quality acceptable?
6. **Go/no-go:** if AE-template authoring + scripting feels heavier than you want,
   reconsider a no-AE JSON/code assembler (Creatomate/Shotstack) before we build the
   integration. Otherwise pick **Designs vs custom** + **Option A vs B** and we wire it.

---

## References

- Developer guide: `https://help.plainlyvideos.com/docs/developer-guide`
- Renders API: `https://help.plainlyvideos.com/docs/developer-guide/renders-api`
- Creating renders: `https://help.plainlyvideos.com/docs/user-guide/rendering/creating-renders`
- Video delivery: `https://help.plainlyvideos.com/docs/user-guide/rendering/video-delivery`
- API reference (interactive): `https://app.plainlyvideos.com/api-reference.html`
- Examples repo: `https://github.com/plainly-videos/examples`
- Our pipeline seams: `agents/video/index.ts`, `agents/merge/index.ts`, `lib/video/merge.ts`, `agents/creative-direction/plan.ts`, `db/schema.ts`, `lib/storage.ts`, `routes/runs.ts`.
