# @goodapp/backup

A nightly Postgres backup to an S3-compatible bucket (Cloudflare R2 in practice, but nothing here is R2-specific), with a grandfather-father-son retention policy — shared across GoodApp products. Extracted from Newbuild's already-working implementation (PLAT-102); generalized only where a second consumer genuinely needed a different value plugged in. See [GoodApp OS's PACKAGE-STANDARD.md](https://github.com/matthiasvienne-boop/GoodApp-OS/blob/main/docs/PACKAGE-STANDARD.md) for the full standard this package follows.

**Status: Live.** Consumed in production by BeleggersApp and Brickstory (Brickstory keeps its own dump-completeness validation for its custom-format dump — see `assertDumpIsComplete`'s note above for why plain-format's trailer check doesn't apply there). Newbuild runs its own extracted-from implementation directly rather than this package.

## What's in it

One subpath export — this package has no browser surface, so there's no `/client` export.

### `@goodapp/backup/server`

```ts
import { runDatabaseBackup, daysToRetain } from "@goodapp/backup/server";

const result = await runDatabaseBackup({
  databaseUrl: process.env.DATABASE_URL!,
  bucket: process.env.R2_BUCKET_NAME!,
  prefix: "newbuild/", // scopes both the upload and cleanup to this consumer's own objects
  r2: {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  // retention: { dailyDays: 7, weeklySundays: 4, monthlySnapshots: 12 }, // these are the defaults
});

console.log(result.key, result.sizeBytes, result.deletedKeys);
```

`runDatabaseBackup` runs `pg_dump`, validates the dump is complete, gzips the output, uploads it as `<prefix><YYYY-MM-DD>-<HHmm>.sql.gz`, then deletes whichever of this consumer's own backups (matched by the same prefix) fall outside the retention policy — only after the upload succeeds, never before.

An empty or truncated dump (a crashed connection, a full disk — anything that stops `pg_dump` before it finishes writing) throws before compression or upload: nothing is uploaded, nothing is pruned, and the previous backup stays in place (PLAT-164). `assertDumpIsComplete(filePath)` is the check itself, exported standalone for a consumer with a different dump format (e.g. custom-format, which doesn't share `--format=plain`'s trailer line) to reuse or test against.

`daysToRetain(now, policy?)` is exported on its own because it's pure, deterministic logic worth testing independently of any I/O: given "now" and an optional policy, it returns the set of calendar days (`"YYYY-MM-DD"`, UTC) a backup taken on that day is allowed to survive on.

## What's deliberately *not* in it

- **Error reporting.** `runDatabaseBackup` throws on failure — a swallowed backup failure is a silent production incident. It does not assume Sentry, or any particular logging stack. Each consumer's own thin wrapper script decides what to do with a thrown error, e.g.:
  ```ts
  runDatabaseBackup({ /* ... */ }).catch((err) => {
    console.error("[backup] FAILED:", err);
    // your own Sentry.captureException(err), etc.
    process.exit(1);
  });
  ```
- **A cron scheduler.** This package does the backup, once, when called. Scheduling it nightly is the consumer's own Railway cron configuration (or whichever scheduler it already uses).
- **`pg_dump` itself.** It's a system binary, not an npm package, and isn't bundled. Each consumer's own build must install it — e.g. a Nixpacks `nixPkgs` entry matching the Postgres server's major version. A `pg_dump`/server version mismatch can make a dump fail or come out incomplete, so pin it to what your database actually runs.
- **Bucket/credential provisioning.** This package uploads to a bucket and credentials you already have. Creating the R2 bucket and API token is outside its scope.

## Install

### Right now: local development (`file:` dependency)

```json
{
  "dependencies": {
    "@goodapp/backup": "file:../goodapp-backup"
  }
}
```

### Production: pinned git dependency

Every production consumer pins to a **resolved commit SHA**, never a tag or branch:

```json
{
  "dependencies": {
    "@goodapp/backup": "github:matthiasvienne-boop/goodapp-backup#<resolved-sha>"
  }
}
```

Resolve the SHA a tag points to with `git ls-remote https://github.com/matthiasvienne-boop/goodapp-backup.git refs/tags/vX.Y.Z`, then use that SHA — not the tag — in `package.json`. See [RELEASE.md](./RELEASE.md) for why.

## Environment variables this package reads

None directly — every credential and connection string is passed in as an explicit `BackupOptions` field, never read from `process.env` inside the package itself. Naming the actual env vars in your own wrapper script (`DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` are the names Newbuild uses, but nothing requires matching them) is a product decision, documented in that product's own `.env.example`.

## Full options reference

```ts
interface BackupOptions {
  databaseUrl: string;
  bucket: string;
  /** Must end in "/". Scopes both the upload key and retention cleanup to this consumer's own objects. */
  prefix: string;
  r2: { accountId: string; accessKeyId: string; secretAccessKey: string };
  retention?: RetentionPolicy; // see below, all fields optional
  /** Defaults to console.log. Pass a no-op to silence, or your own structured logger. */
  log?: (message: string) => void;
}

interface RetentionPolicy {
  dailyDays?: number;       // default 7
  weeklySundays?: number;   // default 4
  monthlySnapshots?: number; // default 12
}

interface BackupResult {
  key: string;         // the uploaded object's key
  sizeBytes: number;   // compressed size
  deletedKeys: string[]; // keys pruned by the retention policy this run
}
```
