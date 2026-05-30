// One-time bucket setup — creates the public `ugc-assets` bucket if it is
// missing. Idempotent: re-running is a no-op once the bucket exists.
//
//   pnpm --filter api storage:setup

import { BUCKET, supabase } from "../lib/storage.js";

async function main() {
  const { data: buckets, error: listErr } =
    await supabase.storage.listBuckets();
  if (listErr) {
    console.error(`✗ Could not list buckets: ${listErr.message}`);
    process.exit(1);
  }

  if (buckets?.some((b) => b.name === BUCKET)) {
    console.log(`✓ Bucket "${BUCKET}" already exists.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
  });
  if (error) {
    console.error(`✗ Failed to create bucket "${BUCKET}": ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ Created public bucket "${BUCKET}".`);
}

main().then(() => process.exit(0));
