"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDatabaseBackup = runDatabaseBackup;
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
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_fs_1 = require("node:fs");
const node_zlib_1 = require("node:zlib");
const promises_1 = require("node:stream/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const client_s3_1 = require("@aws-sdk/client-s3");
const retention_js_1 = require("./retention.js");
const redact_js_1 = require("./redact.js");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function normalizedPrefix(prefix) {
    if (!prefix.endsWith("/"))
        throw new Error(`prefix must end with "/", got "${prefix}"`);
    return prefix;
}
function s3Client(r2) {
    return new client_s3_1.S3Client({
        region: "auto",
        endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: r2.accessKeyId,
            secretAccessKey: r2.secretAccessKey,
        },
    });
}
async function dump(databaseUrl, filePath, log) {
    // --no-owner/--no-privileges: a dump restored into a different account
    // must not stumble over roles that don't exist there — exactly the
    // scenario a backup exists to cover.
    //
    // The connection string is argv[1], and that is the whole reason for the
    // masking below (TEN-86): when pg_dump exits non-zero, Node puts the entire
    // command line into the error it throws, password included. Nothing that
    // leaves this function may carry it.
    let stderr;
    try {
        ({ stderr } = await execFileAsync("pg_dump", [
            databaseUrl,
            "--no-owner",
            "--no-privileges",
            "--format=plain",
            `--file=${filePath}`,
        ]));
    }
    catch (fout) {
        throw (0, redact_js_1.gemaskeerdeFout)(fout, databaseUrl);
    }
    if (stderr) {
        log(`[backup] pg_dump stderr (may just be normal progress output): ${(0, redact_js_1.maskeer)(stderr.trim(), databaseUrl)}`);
    }
}
async function gzipFile(source, destination) {
    await (0, promises_1.pipeline)((0, node_fs_1.createReadStream)(source), (0, node_zlib_1.createGzip)(), (0, node_fs_1.createWriteStream)(destination));
    (0, node_fs_1.unlinkSync)(source);
}
function timestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
}
function keyDateMatcher(prefix) {
    return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{4}-\\d{2}-\\d{2})-\\d{4}\\.sql\\.gz$`);
}
async function pruneOldBackups(client, bucket, prefix, keepKey, retention) {
    const dateMatcher = keyDateMatcher(prefix);
    const retainedDays = (0, retention_js_1.daysToRetain)(new Date(), retention);
    const list = await client.send(new client_s3_1.ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    const toDelete = (list.Contents ?? []).filter((object) => {
        if (!object.Key || object.Key === keepKey)
            return false;
        const match = object.Key.match(dateMatcher);
        // A key that doesn't match this format (e.g. added by hand) is never
        // auto-deleted — only what this function itself recognizes gets pruned.
        if (!match)
            return false;
        return !retainedDays.has(match[1]);
    });
    for (const object of toDelete) {
        await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
    }
    return toDelete.map((o) => o.Key);
}
async function runDatabaseBackup(options) {
    const prefix = normalizedPrefix(options.prefix);
    const log = options.log ?? console.log;
    const workDir = node_os_1.default.tmpdir();
    const rawPath = node_path_1.default.join(workDir, `${prefix.replace(/\//g, "-")}backup-${Date.now()}.sql`);
    const gzipPath = `${rawPath}.gz`;
    log("[backup] starting pg_dump...");
    await dump(options.databaseUrl, rawPath, log);
    log("[backup] compressing...");
    await gzipFile(rawPath, gzipPath);
    const sizeBytes = (0, node_fs_1.statSync)(gzipPath).size;
    log(`[backup] compressed file: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    const client = s3Client(options.r2);
    const key = `${prefix}${timestamp()}.sql.gz`;
    log(`[backup] uploading to s3://${options.bucket}/${key}...`);
    await client.send(new client_s3_1.PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: (0, node_fs_1.createReadStream)(gzipPath),
        ContentLength: sizeBytes,
    }));
    (0, node_fs_1.unlinkSync)(gzipPath);
    log("[backup] upload succeeded.");
    const deletedKeys = await pruneOldBackups(client, options.bucket, prefix, key, options.retention);
    if (deletedKeys.length > 0)
        log(`[backup] pruned ${deletedKeys.length} backup(s) outside the retention policy.`);
    log("[backup] done.");
    return { key, sizeBytes, deletedKeys };
}
