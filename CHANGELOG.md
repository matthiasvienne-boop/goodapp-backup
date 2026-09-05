# Changelog

All notable changes to this package are documented here, per [PACKAGE-STANDARD.md](https://github.com/matthiasvienne-boop/GoodApp-OS/blob/main/docs/PACKAGE-STANDARD.md) Chapter 9.

## 0.1.0 — 2026-09-05

### Added

- `runDatabaseBackup(options)`: `pg_dump` → gzip → upload to an S3-compatible bucket → prune backups outside the retention policy.
- `daysToRetain(now, policy?)`: the grandfather-father-son retention calculation, exported standalone for independent testing.
- Extracted from Newbuild's original implementation (PLAT-102). Every product-specific value (database URL, R2 credentials, bucket, key prefix, retention policy, logging) is now a parameter instead of hardcoded.
