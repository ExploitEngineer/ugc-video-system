// BytePlus / Volcengine OpenAPI request signer — signature V4 (HMAC-SHA256).
//
// Asset management (create group / create asset / list assets) lives on the
// BytePlus OpenAPI, which authenticates with an Access Key + Secret Key (AK/SK)
// — NOT the `ark-` inference key. This module signs a single POST-JSON request
// and exposes `signedFetch(action, body)`.
//
// The signing algorithm is the standard Volcengine V4 four-step HMAC chain:
//   kDate    = HMAC(SK, yyyymmdd)
//   kRegion  = HMAC(kDate, region)
//   kService = HMAC(kRegion, service)
//   kSigning = HMAC(kService, "request")
// Authorization: HMAC-SHA256 Credential=AK/scope, SignedHeaders=…, Signature=…
//
// ⚠️ The OpenAPI HOST, SERVICE string, API VERSION, and ACTION names are
// config placeholders (see src/config) — confirm them against the BytePlus
// console / API Explorer before the first live run.

import { createHash, createHmac } from "node:crypto";
import { env } from "../../config/index.js";
import { fetchWithRetry } from "../../lib/http.js";

const ALGORITHM = "HMAC-SHA256";

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** `20260601T130000Z` and its `20260601` date stamp, from an ISO timestamp. */
function timestamps(nowIso: string): { amzDate: string; dateStamp: string } {
  const amzDate = `${nowIso.replace(/[-:]/g, "").slice(0, 15)}Z`; // yyyymmddTHHMMSSZ
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export interface SignedFetchResult {
  ok: boolean;
  status: number;
  json: unknown;
  raw: string;
}

export interface SignedFetchOptions {
  /**
   * Retry a thrown network error. All OpenAPI actions are POST, so this is keyed
   * on semantics, not method: `true` for READ actions (List*) which are safe to
   * replay, `false` (default) for WRITE actions (Create*) so a drop after the
   * request reached the server can't duplicate the asset/group.
   */
  idempotent?: boolean;
  /** Injectable timestamp for tests. */
  nowIso?: string;
}

/**
 * Sign + send a BytePlus OpenAPI action as `POST /?Action=…&Version=…` with a
 * JSON body. Requires AK/SK to be configured (guard with assets.ts's
 * `isAssetMgmtConfigured()` first). `opts.nowIso` is injectable for testing.
 */
export async function signedFetch(
  action: string,
  body: unknown,
  opts: SignedFetchOptions = {},
): Promise<SignedFetchResult> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const accessKey = env.BYTEPLUS_ACCESS_KEY;
  const secretKey = env.BYTEPLUS_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error(
      "BytePlus asset management needs BYTEPLUS_ACCESS_KEY + BYTEPLUS_SECRET_KEY",
    );
  }

  const host = env.BYTEPLUS_OPENAPI_HOST;
  const region = env.BYTEPLUS_REGION;
  const service = env.BYTEPLUS_ASSET_SERVICE;
  const version = env.BYTEPLUS_ASSET_API_VERSION;
  const { amzDate, dateStamp } = timestamps(nowIso);

  const payload = JSON.stringify(body ?? {});
  const payloadHash = sha256Hex(payload);

  // Query string — keys sorted (only Action + Version here).
  const canonicalQuery = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(version)}`;

  // Canonical headers — must be sorted by lowercase name.
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${amzDate}\n`;

  const canonicalRequest = [
    "POST",
    "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization =
    `${ALGORITHM} Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}/?${canonicalQuery}`;
  const headers = {
    "Content-Type": "application/json",
    Host: host,
    "X-Date": amzDate,
    "X-Content-Sha256": payloadHash,
    Authorization: authorization,
  };

  // fetchWithRetry adds a per-attempt timeout (a stalled OpenAPI call must never
  // hang the worker) + capped backoff. Network-error retry is gated on
  // `opts.idempotent` so a write (Create*) is never replayed after a post-send
  // drop. A non-retryable failure still throws — caller checks `res.ok`.
  const res = await fetchWithRetry(
    url,
    { method: "POST", headers, body: payload },
    {
      label: `byteplus-openapi ${action}`,
      retryOnNetworkError: opts.idempotent ?? false,
    },
  );

  const raw = await res.text();
  let json: unknown = undefined;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  return { ok: res.ok, status: res.status, json, raw };
}
