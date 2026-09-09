export { runDatabaseBackup } from "./backup.js";
export type { BackupOptions, BackupResult, S3Credentials } from "./backup.js";

export { daysToRetain } from "./retention.js";

// Exported so a consumer can mask its own logging around this package -- the
// connection string does not become harmless once it leaves here (TEN-86).
export { maskeer, maskeerVerbindingssnoeren, gemaskeerdeFout } from "./redact.js";
export type { RetentionPolicy } from "./retention.js";
