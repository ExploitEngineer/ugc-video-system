# Row-Level Security (RLS)

## Current posture: locked down, service-role-only

RLS is **enabled on every table** (`projects`, `runs`, `assets`, `step_events`, `product_reference_sheets`, `person_reference_sheets`, `storyboard_sheets`, `videos`) and **no policies are defined**.

In Postgres, RLS-enabled + zero policies = **deny all** for any role that is subject to RLS. The Supabase `service_role` **bypasses RLS entirely**, so:

| Caller | Key | Access |
|---|---|---|
| API / background worker | `SUPABASE_SERVICE_ROLE_KEY` (or `DATABASE_URL` superuser conn) | full read/write (bypasses RLS) |
| Browser / public client | `SUPABASE_ANON_KEY` | **zero** — every row blocked |
| Logged-in user | `authenticated` | **zero** — every row blocked |

This is the intended, safe default for the current phase.

## Why no owner-based policies yet

Auth is deferred to **F8** (see SPEC.md). Until then:

- There are no users — `projects.owner_id` is **nullable and always null**.
- The only thing touching the DB is the server-side API/worker, which connects with service-role credentials and therefore bypasses RLS regardless of policies.
- Enabling RLS now (rather than waiting for F8) means the database is **secure by default**: if the public anon key ever leaks or a client connects directly, it gets nothing. We are not relying on "no policy = open"; we are relying on "RLS on + no policy = closed".

## How it's declared

In `apps/api/src/db/schema.ts`, every `pgTable(...)` chains `.enableRLS()`, which makes `drizzle-kit generate` emit:

```sql
ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
```

No `pgPolicy(...)` is declared, so no `CREATE POLICY` is emitted.

## Verifying live

```sql
-- every public table should show rowsecurity = true
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and relkind = 'r'
order by relname;

-- should return zero rows
select * from pg_policies where schemaname = 'public';
```

(Confirmed at F1: all 8 tables `rowsecurity = true`, `pg_policies` count = 0.)

## F8 follow-up — owner-based policies

When Supabase Auth lands and `projects.owner_id` is populated with `auth.uid()`:

1. Add owner-scoped policies on `projects` (e.g. `using (owner_id = auth.uid())` for select/update/delete; `with check (owner_id = auth.uid())` for insert).
2. Cascade ownership to child tables via the `run → project` chain (policies that join back to the owning project), or denormalize `owner_id` where read paths need it.
3. Keep the server worker on the service role so background processing is unaffected by user-scoped policies.
4. Decide Storage bucket RLS + signed-URL strategy alongside table RLS (tracked as an open question in SPEC.md §8).

Policies will ship as a new Drizzle migration (declared via `pgPolicy` in `schema.ts`), not hand-edited in the dashboard, so the repo stays the source of truth.

## Storage bucket CORS (video-editor prerequisite)

Separate from table RLS: the post-completion **video editor** runs in the browser and fetches the
`final_video`'s **public `ugc-assets` URL cross-origin** (`*.supabase.co` ≠ the web app origin). For
that to work, **Supabase Storage CORS must allow the web origin for `GET`** (incl. range requests) —
`http://localhost:3000` in dev, the deployed web origin in prod. If the editor canvas loads but the
video never appears, this is almost always the cause. This is a Storage HTTP-layer setting (Supabase
dashboard → Storage), not a Postgres policy. See [video-editor.md](video-editor.md).
