# BytePlus Seedance 2.0 — face-asset registration

## Why this exists

Seedance 2.0 runs a **real-human face filter**. A face passed as a raw `image_url`
URL is rejected, so person/UGC ads silently fail to generate. BytePlus's fix is to
**register the face in its asset library first** to get an `asset_id`, then reference
it in the video task as:

```
asset://<asset_id>
```

with `role: "reference_image"` — not a raw URL or base64.

## Two credentials (do not confuse them)

| Credential | Env | Used for |
| --- | --- | --- |
| ModelArk API key (`ark-…`) | `BYTEPLUS_API_KEY` | **Video generation only** (inference) |
| Access Key + Secret Key | `BYTEPLUS_ACCESS_KEY` / `BYTEPLUS_SECRET_KEY` | **Asset management** (create group/asset, list) — Volcengine OpenAPI, signature V4 |

Region: `BYTEPLUS_REGION` (default `ap-southeast-1`).

The `ark-` key **cannot** create assets. Asset APIs require AK/SK from the BytePlus console.

## The flow (mapped to our code)

```
person reference sheet                         apps/api/src/agents/image/person-image/
  → already uploaded to Supabase (public URL)  apps/api/src/lib/storage.ts (getPublicUrl)
  → register as a BytePlus asset               apps/api/src/providers/byteplus/assets.ts
      ensureGroup() → createAsset(url) → waitAssetActive()
  → reference as asset://<id> role:reference_image
                                               apps/api/src/providers/byteplus/index.ts (submitVideo)
  → submit task → poll → download mp4 to Supabase   (unchanged)
```

> **No fal.ai.** The user's reference guide uploads to fal.ai purely to obtain a public
> `https://` URL for BytePlus to ingest. We already host every reference sheet in the
> public Supabase bucket `ugc-assets`, so we register the existing Supabase URL directly.
> Any public host (S3/GCS/R2/CDN) would work the same way.

**Scope:** only the **person/face** sheet is registered as an asset. The **product**
sheet has no face, so it stays a plain `image_url` content part.

## Request shape (Seedance task)

```jsonc
{
  "model": "dreamina-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "<motion/camera/audio prompt>" },
    { "type": "image_url", "role": "reference_image", "image_url": { "url": "https://…/product-sheet.png" } },
    { "type": "image_url", "role": "reference_image", "image_url": { "url": "asset://asset-2026…-xxxx" } }
  ],
  "duration": 15,
  "resolution": "720p",
  "ratio": "16:9",
  "generate_audio": true,
  "watermark": false
}
```

`role` may also be `first_frame` to pin an image as the first frame. We never send the
annotated storyboard sheet as an image (its panel numbers/arrows would animate into the
clip); the storyboard reaches the model as the **text plan** built from `scenes`.

## Idempotency & group strategy

- **One shared asset group**, reused across runs. Set `BYTEPLUS_ASSET_GROUP_ID` to pin it.
  If unset, `ensureGroup()` creates one named `Faces`, memoizes it in-process, and logs the
  id with a hint to add it to env (so restarts don't keep creating groups).
- **Reuse, don't re-register.** Each asset is named deterministically
  (`{runId}-person-{i}`); `ensureFaceAsset()` lists the group and reuses an existing
  `Active` asset with that name before creating a new one — so regen/resume is cheap.

## Moderation status

Newly registered assets start `Processing` and become `Active` after consistency/moderation
checks. `waitAssetActive()` polls (bounded by `BYTEPLUS_POLL_TIMEOUT_MS`) and only proceeds
once the asset is `Active`; a `Rejected`/`Failed`/`Banned` status throws.

## Graceful fallback (current default)

`BYTEPLUS_ACCESS_KEY`/`BYTEPLUS_SECRET_KEY` are **optional**. When absent,
`isAssetMgmtConfigured()` is false and `submitVideo` sends face refs as raw `image_url`
URLs and logs a warning. The pipeline still runs end-to-end; Seedance's face filter will
likely reject the face until the AK/SK are added. This is intentional so the server boots
and builds before the credentials are configured.

## ⚠️ Confirm before the first live run

The public BytePlus docs are JS-rendered; these values are **placeholders** in
`apps/api/src/config/index.ts` and must be confirmed against the BytePlus console /
[API Explorer](https://api.byteplus.com/api-explorer):

- `BYTEPLUS_OPENAPI_HOST` — the OpenAPI host (e.g. `open.ap-southeast.bytepluses.com`).
- `BYTEPLUS_ASSET_SERVICE` — the signature service string (placeholder `ark`).
- `BYTEPLUS_ASSET_API_VERSION` — the API version query param.
- The **Action names** in `assets.ts`: `CreateContentGenerationAssetGroup`,
  `CreateContentGenerationAsset`, `ListContentGenerationAssets`, and the exact
  request/response field names (the parser in `assets.ts` is defensive about casing).

The signature V4 algorithm itself (`apps/api/src/providers/byteplus/sign.ts`) is standard
and does not change.

## Common mistakes (from the BytePlus guide)

1. Using only the `ark-` key for asset APIs — they need AK/SK.
2. Passing base64 or local paths — the generation API expects a registered `asset://id`.
3. Using an asset before it is `Active`.
4. Forgetting the generated video URL expires after 24h — we download immediately.
5. Creating a new group per face — reuse one group.

## Verify once configured

```bash
pnpm --filter api video:verify <runId> ["ad style"]
```

on a run that already has a person reference sheet. Watch the logs for the asset id and
`asset://` reference, then confirm the clip renders the real face.
