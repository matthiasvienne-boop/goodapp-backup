# Changelog

All notable changes to this package are documented here, per [PACKAGE-STANDARD.md](https://github.com/matthiasvienne-boop/GoodApp-OS/blob/main/docs/PACKAGE-STANDARD.md) Chapter 9.

## 0.2.0 — 2026-09-19

### Fixed

- The Postgres connection string can no longer reach a log. `pg_dump` takes it
  as `argv[1]`, and Node's `execFile` puts the whole command line into the error
  it throws on a non-zero exit — so a dump that merely failed to resolve its
  host wrote the password to a log file (TEN-86). Errors are now rebuilt with
  the password masked, and `stderr` is masked before it is logged.

### Added

- `maskeer`, `maskeerVerbindingssnoeren` and `gemaskeerdeFout`, exported so a
  consumer can mask its own logging around this package. The connection string
  does not become harmless once it leaves here.

## 0.1.0 — 2026-09-05

### Added

- `runDatabaseBackup(options)`: `pg_dump` → gzip → upload to an S3-compatible bucket → prune backups outside the retention policy.
- `daysToRetain(now, policy?)`: the grandfather-father-son retention calculation, exported standalone for independent testing.
- Extracted from Newbuild's original implementation (PLAT-102). Every product-specific value (database URL, R2 credentials, bucket, key prefix, retention policy, logging) is now a parameter instead of hardcoded.
