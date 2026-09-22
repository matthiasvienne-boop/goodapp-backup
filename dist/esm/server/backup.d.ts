import { type RetentionPolicy } from "./retention.js";
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
export declare function assertDumpIsComplete(filePath: string): void;
export declare function runDatabaseBackup(options: BackupOptions): Promise<BackupResult>;
