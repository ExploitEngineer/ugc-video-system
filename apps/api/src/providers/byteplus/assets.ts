// BytePlus asset library — register real-human/face images so Seedance's face
// filter accepts them. Raw face URLs are rejected by the video API; a face must
// first be registered as an asset (AK/SK-signed OpenAPI) and then referenced as
// `asset://<asset_id>` with role "reference_image". See docs/byteplus-face-assets.md.
//
// This module is DB-free and idempotent against BytePlus itself: assets are
// named deterministically and we list-before-create so a regen/resume reuses an
// existing Active asset instead of registering a duplicate.
//
// Contract verified live against open.byteplusapi.com (service "ark", version
// "2024-01-01", region from BYTEPLUS_REGION):
//   CreateAssetGroup { Name, GroupType:"AIGC" }                   → Result.Id
//   ListAssetGroups  { Filter:{ GroupType:"AIGC" } }              → Result.Items[]
//   CreateAsset      { GroupId, URL, AssetType:"Image", Name }    → Result.Id
//   ListAssets       { Filter:{ GroupType:"AIGC", GroupId }, PageNumber, PageSize }
//                                                                 → Result.Items[]
// Asset Item: { Id, Name, URL, AssetType, GroupId, Status, Error?, ... }
// Status: "Active" (usable) | "Failed"/"Rejected" (moderation) | else processing.

import { env } from "../../config/index.js";
import { createLogger } from "../../lib/log.js";
import { signedFetch, type SignedFetchResult } from "./sign.js";

const log = createLogger("byteplus");
const GROUP_TYPE = "AIGC";
const ACTIVE_STATUS = "Active";
const REJECTED_STATUSES = new Set(["Failed", "Rejected", "Banned"]);
const LIST_PAGE_SIZE = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when AK/SK are present — required for any asset-management call. */
export function isAssetMgmtConfigured(): boolean {
  return Boolean(env.BYTEPLUS_ACCESS_KEY && env.BYTEPLUS_SECRET_KEY);
}

function result(res: SignedFetchResult): Record<string, unknown> {
  return ((res.json as Record<string, unknown>)?.Result ?? {}) as Record<string, unknown>;
}

/** Pull `ResponseMetadata.Error.Message` (or raw) for a failed call. */
function errorOf(res: SignedFetchResult): string {
  const meta = (res.json as { ResponseMetadata?: { Error?: { Code?: string; Message?: string } } })
    ?.ResponseMetadata;
  const e = meta?.Error;
  if (e?.Code || e?.Message) return `${e.Code ?? ""} ${e.Message ?? ""}`.trim();
  return res.raw.slice(0, 300);
}

function idOf(r: Record<string, unknown>): string | undefined {
  return typeof r.Id === "string" && r.Id ? r.Id : undefined;
}

let memoizedGroupId: string | undefined;

/** Reuse `BYTEPLUS_ASSET_GROUP_ID`; else create one group, memoize, and log it. */
export async function ensureGroup(): Promise<string> {
  if (env.BYTEPLUS_ASSET_GROUP_ID) return env.BYTEPLUS_ASSET_GROUP_ID;
  if (memoizedGroupId) return memoizedGroupId;

  const res = await signedFetch("CreateAssetGroup", {
    Name: "ugc-video-system-faces",
    Description: "Reference face images (ugc-video-system)",
    GroupType: GROUP_TYPE,
  });
  if (!res.ok) throw new Error(`BytePlus CreateAssetGroup failed: ${errorOf(res)}`);
  const id = idOf(result(res));
  if (!id) throw new Error(`BytePlus CreateAssetGroup returned no Id: ${res.raw.slice(0, 300)}`);

  memoizedGroupId = id;
  log.info("created asset group — pin as BYTEPLUS_ASSET_GROUP_ID to reuse across restarts", {
    group: id,
  });
  return id;
}

export interface AssetRow {
  id: string;
  name: string;
  status: string;
  error?: string;
}

/** One page of assets in a group. */
async function listAssetsPage(groupId: string, pageNumber: number): Promise<AssetRow[]> {
  const res = await signedFetch("ListAssets", {
    Filter: { GroupType: GROUP_TYPE, GroupId: groupId },
    PageNumber: pageNumber,
    PageSize: LIST_PAGE_SIZE,
  });
  if (!res.ok) throw new Error(`BytePlus ListAssets failed: ${errorOf(res)}`);
  const items = (result(res).Items ?? []) as Record<string, unknown>[];
  const rows: AssetRow[] = [];
  for (const it of items) {
    const id = idOf(it);
    if (!id || it.GroupId !== groupId) continue; // GroupId filter is not enforced server-side
    const err = (it.Error as { Code?: string; Message?: string } | undefined) ?? undefined;
    rows.push({
      id,
      name: typeof it.Name === "string" ? it.Name : "",
      status: typeof it.Status === "string" ? it.Status : "",
      error: err?.Code ? `${err.Code} ${err.Message ?? ""}`.trim() : undefined,
    });
  }
  return rows;
}

/** Find an asset in a group by its (deterministic) name across pages. */
async function findAssetByName(groupId: string, name: string): Promise<AssetRow | undefined> {
  // Names are deterministic + assets list newest-first, so the first page
  // almost always has it; cap the scan to stay bounded on busy groups.
  for (let page = 1; page <= 5; page++) {
    const rows = await listAssetsPage(groupId, page);
    const hit = rows.find((a) => a.name === name);
    if (hit) return hit;
    if (rows.length < LIST_PAGE_SIZE) break; // last page
  }
  return undefined;
}

/** Register a public image URL as an asset → returns the new asset id. */
export async function createAsset(
  groupId: string,
  url: string,
  name: string,
): Promise<string> {
  const res = await signedFetch("CreateAsset", {
    GroupId: groupId,
    URL: url,
    AssetType: "Image",
    Name: name,
  });
  if (!res.ok) throw new Error(`BytePlus CreateAsset failed: ${errorOf(res)}`);
  const id = idOf(result(res));
  if (!id) throw new Error(`BytePlus CreateAsset returned no Id: ${res.raw.slice(0, 300)}`);
  return id;
}

/** Poll an asset by id until Active (bounded by the poll timeout). */
async function waitAssetActive(groupId: string, assetId: string): Promise<void> {
  const deadline = Date.now() + env.BYTEPLUS_POLL_TIMEOUT_MS;
  for (;;) {
    let row: AssetRow | undefined;
    for (let page = 1; page <= 5 && !row; page++) {
      row = (await listAssetsPage(groupId, page)).find((a) => a.id === assetId);
    }
    const status = row?.status;
    if (status === ACTIVE_STATUS) return;
    if (status && REJECTED_STATUSES.has(status)) {
      throw new Error(`BytePlus asset ${assetId} moderation ${status}: ${row?.error ?? ""}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`BytePlus asset ${assetId} not Active before timeout (last: ${status})`);
    }
    await sleep(env.BYTEPLUS_POLL_INTERVAL_MS);
  }
}

/**
 * Resolve a face image URL → an Active asset id, idempotently. Reuses an
 * existing Active asset with the same deterministic `name`; otherwise creates
 * one and waits for it to pass moderation.
 */
export async function ensureFaceAsset(url: string, name: string): Promise<string> {
  const groupId = await ensureGroup();

  const existing = await findAssetByName(groupId, name);
  if (existing?.status === ACTIVE_STATUS) return existing.id;
  if (existing && REJECTED_STATUSES.has(existing.status)) {
    throw new Error(`BytePlus asset "${name}" previously ${existing.status}: ${existing.error ?? ""}`);
  }
  if (existing) {
    await waitAssetActive(groupId, existing.id);
    return existing.id;
  }

  const assetId = await createAsset(groupId, url, name);
  await waitAssetActive(groupId, assetId);
  return assetId;
}
