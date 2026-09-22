/**
 * Nightly Postgres backup to an S3-compatible bucket (Cloudflare R2 in
 * practice, but nothing here is R2-specific — any S3-compatible endpoint
 * works).
 *
 * Runs `pg_dump`, gzips the output, uploads it under `<prefix><timestamp>
 * .sql.gz`, then deletes whichever of this consumer's own backups (matched
 * by the same prefix) fall outside the retention policy (retention.ts) —
 * only after a successful upload, never before, so a failed run can never
 * delete a backup without a new one taking its place.
 *
 * Extracted from Newbuild's original implementation (PLAT-102). What
 * changed in the extraction: every product-specific value (database URL, R2
 * credentials, bucket, key prefix, retention policy, logging) is now a
 * parameter — see API-DESIGN-RULES in the GoodApp Package Standard,
 * "configuration over hardcoded values."
 *
 * Requires `pg_dump` on the host (postgresql-client). Not bundled — it's a
 * system binary, not an npm package. Each consumer's own build must install
 * it (e.g. a Nixpacks `nixPkgs` entry matching the server's Postgres major
 * version — a pg_dump/server version mismatch can make a dump fail or come
 * out incomplete).
 *
 * Throws on any failure — a swallowed backup failure is a silent production
 * incident (Package Standard, Chapter 11). The caller decides what to do
 * with the error (log it, report it to Sentry, exit non-zero); this
 * function does not assume any particular error-reporting stack.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { closeSync, createReadStream, createWriteStream, openSync, readSync, statSync, unlinkSync } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { daysToRetain, type RetentionPolicy } from "./retention.js";
import { gemaskeerdeFout, maskeer } from "./redact.js";

const execFileAsync = promisify(execFile);

export interface S3Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface BackupOptions {
  /** A Postgres connection string, passed straight to `pg_dump`. */
  databaseUrl: string;
  /** The S3-compatible bucket to upload into. */
  bucket: string;
  /**
   * Key prefix for this consumer's own backups, e.g. `"newbuild/"`. Must end
   * in `/` — this is also what scopes retention cleanup to this consumer's
   * own objects, never touching another product's backups sharing the same
   * bucket.
   */
  prefix: string;
  r2: S3Credentials;
  retention?: RetentionPolicy;
  /** Defaults to `console.log`. Pass a no-op to silence, or your own structured logger. */
  log?: (message: string) => void;
}

export interface BackupResult {
  key: string;
  sizeBytes: number;
  deletedKeys: string[];
}

function normalizedPrefix(prefix: string): string {
  if (!prefix.endsWith("/")) throw new Error(`prefix must end with "/", got "${prefix}"`);
  return prefix;
}

function s3Client(r2: S3Credentials): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
  });
}

async function dump(databaseUrl: string, filePath: string, log: (message: string) => void): Promise<void> {
  // --no-owner/--no-privileges: a dump restored into a different account
  // must not stumble over roles that don't exist there — exactly the
  // scenario a backup exists to cover.
  //
  // The connection string is argv[1], and that is the whole reason for the
  // masking below (TEN-86): when pg_dump exits non-zero, Node puts the entire
  // command line into the error it throws, password included. Nothing that
  // leaves this function may carry it.
  let stderr: string;
  try {
    ({ stderr } = await execFileAsync("pg_dump", [
      databaseUrl,
      "--no-owner",
      "--no-privileges",
      "--format=plain",
      `--file=${filePath}`,
    ]));
  } catch (fout) {
    throw gemaskeerdeFout(fout, databaseUrl);
  }
  if (stderr) {
    log(`[backup] pg_dump stderr (may just be normal progress output): ${maskeer(stderr.trim(), databaseUrl)}`);
  }
}

/**
 * `pg_dump --format=plain` closes a complete dump with a fixed trailer line.
 * Its absence means the file is truncated — a crashed connection, a disk that
 * filled up mid-dump, anything that stops the process before it finishes
 * writing but after it created the file. gzip and upload never see the
 * difference: a truncated dump compresses and uploads exactly as cleanly as a
 * complete one, and the retention policy then prunes the last good backup to
 * make room for a new one that restores nothing (PLAT-164, raised via
 * BEL-567).
 *
 * Ported from Newbuild's own `controleerDump()` (apps/api/src/scripts/
 * backup-database.ts) — the same check, generalized so every consumer of
 * `runDatabaseBackup()` gets it, not just the one product that wrote it
 * first.
 *
 * Only the tail is read: the trailer line is always the last thing pg_dump
 * writes, and a dump can be large enough that reading the whole file just to
 * check its last line would be wasteful.
 */
const DUMP_TRAILER = "PostgreSQL database dump complete";
const TAIL_BYTES_TO_CHECK = 4096;

export function assertDumpIsComplete(filePath: string): void {
  const sizeBytes = statSync(filePath).size;
  if (sizeBytes === 0) {
    throw new Error("[backup] pg_dump produced an empty file — nothing uploaded, nothing pruned.");
  }

  const tailLength = Math.min(sizeBytes, TAIL_BYTES_TO_CHECK);
  const buffer = Buffer.alloc(tailLength);
  const fd = openSync(filePath, "r");
  try {
    readSync(fd, buffer, 0, tailLength, sizeBytes - tailLength);
  } finally {
    closeSync(fd);
  }

  if (!buffer.toString("utf8").includes(DUMP_TRAILER)) {
    throw new Error(
      `[backup] the dump is missing its trailer line and is therefore incomplete (${sizeBytes} bytes). ` +
        "Nothing uploaded, nothing pruned — the previous backup stays in place."
    );
  }
}

async function gzipFile(source: string, destination: string): Promise<void> {
  await pipeline(createReadStream(source), createGzip(), createWriteStream(destination));
  unlinkSync(source);
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}

function keyDateMatcher(prefix: string): RegExp {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{4}-\\d{2}-\\d{2})-\\d{4}\\.sql\\.gz$`);
}

async function pruneOldBackups(
  client: S3Client,
  bucket: string,
  prefix: string,
  keepKey: string,
  retention?: RetentionPolicy
): Promise<string[]> {
  const dateMatcher = keyDateMatcher(prefix);
  const retainedDays = daysToRetain(new Date(), retention);
  const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));

  const toDelete = (list.Contents ?? []).filter((object) => {
    if (!object.Key || object.Key === keepKey) return false;
    const match = object.Key.match(dateMatcher);
    // A key that doesn't match this format (e.g. added by hand) is never
    // auto-deleted — only what this function itself recognizes gets pruned.
    if (!match) return false;
    return !retainedDays.has(match[1]);
  });

  for (const object of toDelete) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key! }));
  }
  return toDelete.map((o) => o.Key!);
}

export async function runDatabaseBackup(options: BackupOptions): Promise<BackupResult> {
  const prefix = normalizedPrefix(options.prefix);
  const log = options.log ?? console.log;
  const workDir = os.tmpdir();
  const rawPath = path.join(workDir, `${prefix.replace(/\//g, "-")}backup-${Date.now()}.sql`);
  const gzipPath = `${rawPath}.gz`;

  log("[backup] starting pg_dump...");
  await dump(options.databaseUrl, rawPath, log);
  assertDumpIsComplete(rawPath);

  log("[backup] compressing...");
  await gzipFile(rawPath, gzipPath);
  const sizeBytes = statSync(gzipPath).size;
  log(`[backup] compressed file: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  const client = s3Client(options.r2);
  const key = `${prefix}${timestamp()}.sql.gz`;

  log(`[backup] uploading to s3://${options.bucket}/${key}...`);
  await client.send(
    new PutObjectCommand({
      Bucket: options.bucket,
      Key: key,
      Body: createReadStream(gzipPath),
      ContentLength: sizeBytes,
    })
  );
  unlinkSync(gzipPath);
  log("[backup] upload succeeded.");

  const deletedKeys = await pruneOldBackups(client, options.bucket, prefix, key, options.retention);
  if (deletedKeys.length > 0) log(`[backup] pruned ${deletedKeys.length} backup(s) outside the retention policy.`);

  log("[backup] done.");
  return { key, sizeBytes, deletedKeys };
}
