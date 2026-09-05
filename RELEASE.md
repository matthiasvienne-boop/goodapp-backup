# Release Guide — `@goodapp/backup`

Follows the process defined in [`@goodapp/observability`'s RELEASE.md](https://github.com/matthiasvienne-boop/goodapp-observability/blob/main/RELEASE.md), the template every GoodApp shared package uses. This document records this package's own specifics; see that one for the process itself in full.

## Why this package exists

Newbuild had a working, self-contained nightly-backup implementation (`pg_dump` → gzip → upload to Cloudflare R2 → grandfather-father-son retention pruning), built for PLAT-102. Every other GoodApp product needs the exact same capability — the six products all run a Postgres database on Railway, none had a backup mechanism, and the underlying steps (dump, compress, upload, prune) don't vary by product; only the connection string, bucket prefix, and possibly the retention window do. That is precisely the shape Chapter 13 of the Package Standard looks for: concrete, immediate, multi-product need, zero business logic, independently testable, no coordinated cross-consumer changes required to evolve it.

## Public API

One subpath export. Nothing is exported from the package root — every import names its target explicitly.

**`@goodapp/backup/server`** (Node only): `runDatabaseBackup`, `daysToRetain`, plus the `BackupOptions`, `BackupResult`, `S3Credentials`, `RetentionPolicy` types.

Full usage examples: [README.md](./README.md).

## Semantic versioning policy

Strict SemVer, per [PACKAGE-STANDARD.md](https://github.com/matthiasvienne-boop/GoodApp-OS/blob/main/docs/PACKAGE-STANDARD.md) Chapter 4:

- **Major** — anything a caller would observe: a removed export, a changed function signature, a changed default retention policy, a changed key-naming format, a changed throw/no-op behavior.
- **Minor** — a new export or a new optional parameter with a backward-compatible default.
- **Patch** — a bug fix with zero change to the public API surface.

Pre-1.0 (starts at `0.1.0`, Draft lifecycle stage): breaking changes are allowed between minor versions. Graduates to Experimental once a first product depends on a version in production; to Production once a second product does, independently, without a rollback.

## Backwards compatibility policy

- A minor or patch release must never break a consumer who hasn't opted into anything new.
- Every production consumer pins to a **resolved commit SHA**, never a tag or branch.
- Deprecating an export: mark it `@deprecated` in JSDoc and note it in `CHANGELOG.md` for at least one minor version before removing it in a major.

## Release checklist

1. Make the change. Decide major/minor/patch per the policy above *before* writing the version bump.
2. From a completely clean state, build and commit `dist/` yourself:
   ```
   rm -rf node_modules dist && npm install && npm run build
   ```
3. Bump `version` in `package.json`.
4. Add a `CHANGELOG.md` entry.
5. Commit (including the rebuilt `dist/`).
6. Tag: `git tag -a vX.Y.Z -m "..."`, then `git push origin main --tags`.
7. **Before touching any consumer**, validate the new tag from a fresh, isolated scratch project — not any product:
   ```
   mkdir /tmp/scratch && cd /tmp/scratch
   npm init -y
   npm install github:matthiasvienne-boop/goodapp-backup#<new-tag-or-sha>
   ```
   Confirm: `npm install` succeeds with no build step, the subpath import resolves under both a plain-`tsc`/`module:"commonjs"` consumer (no `moduleResolution` set) and at runtime with `node`/`tsx` — not just a type check.
8. Only after step 7 passes: update **one** consumer's `package.json` to the new pinned SHA, regenerate its lockfile, run its own typecheck + build + a real backup against a non-production database before trusting it in production.
9. Repeat step 8 for each other consumer, independently, on its own schedule — never roll out a new version to every product at once.
10. Deploying is a separate, later decision for each product — this checklist stops at "validated and pinned."

## Rollback checklist

Because every consumer pins to an exact commit SHA, rollback never touches this repository:

1. In the affected product, change the pinned SHA back to the previous known-good one.
2. `npm install` to regenerate the lockfile.
3. Re-run that product's typecheck + build.
4. Deploy per that product's own process.

If the package itself shipped a real bug: fix forward with a new patch release, while affected consumers stay on their last-known-good pin in the meantime.

## Validation performed before first publish (2026-09-05)

Per [PACKAGE-STANDARD.md](https://github.com/matthiasvienne-boop/GoodApp-OS/blob/main/docs/PACKAGE-STANDARD.md) Chapter 8:

1. **Build** — both CJS and ESM targets compile with zero errors.
2. **Typecheck, legacy node10 resolution** — a scratch consumer with plain `tsc`, `module:"commonjs"`, no `moduleResolution` set (the configuration that does *not* read `exports` for types) typechecks cleanly against the `typesVersions` map.
3. **Fresh install** — `rm -rf node_modules dist && npm install && npm run build` reproduces a working build from a clean state.
4. **Example consumer** — a scratch project importing `runDatabaseBackup` and `daysToRetain` via a `file:` dependency, compiled and *executed* with `tsx` (not just typechecked) — both resolve and are callable.
5. **Unit tests** — `daysToRetain`'s grandfather-father-son logic: 5/5 passing, covering the default policy, a custom policy, and that results depend only on the passed-in `now`, never the real clock.

**Not yet performed, and honestly noted:** a live smoke test of `runDatabaseBackup` itself (a real `pg_dump` against a real database, a real upload to R2, a real prune) — the Chapter 8 requirement for "an actual round-trip" for any capability with real runtime behavior. This is the reason the package stays at **Draft** rather than claiming validated-in-production status: the pure logic is tested, the I/O orchestration is faithfully extracted from Newbuild's already-working, already-running-in-production script (unchanged behavior, only parameterized), but the *combination* has not yet had its own dedicated round-trip test. The first product to adopt this package (Chapter 3's Draft → Experimental promotion) effectively performs that round-trip as part of its own rollout — verify its first successful backup shows up in R2 before trusting the integration.

## How this package differs from `@goodapp/observability` / `@goodapp/email`

No `/client` export — a database backup has no browser surface, so there's no `src/client` directory and no ESM-vs-bundler client-side typecheck concern. Otherwise, the structure, build, and release process are identical by design (Chapter 6 of the standard).
