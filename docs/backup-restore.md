# Backup and restore runbook

Baul's free-tier recovery target is a 24-hour RPO and four-hour RTO. The nightly GitHub Actions workflow exports database roles, schema, data, all four private Storage buckets, and a checksum manifest. Restic encrypts and deduplicates the export before sending it to a dedicated private Cloudflare R2 bucket.

## Required GitHub secrets

- `SUPABASE_DB_URL`: production Session Pooler connection string, percent-encoded.
- `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`: read-only Storage S3 credentials where supported.
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: write access limited to the backup bucket.
- `RESTIC_PASSWORD`: a randomly generated backup-encryption secret. Keep a second copy in Paul John E. Antigo's offline password manager.

Never upload the Restic password, database URL, or provider keys as workflow artifacts. Do not add an R2 lifecycle rule that deletes Restic pack files; `restic forget --prune` owns retention.

## Monthly local restore drill

1. Start Docker Desktop and run `npm run db:start` in a clean checkout.
2. Set the R2 credentials, `RESTIC_REPOSITORY`, and `RESTIC_PASSWORD` in the shell without writing them to the repository.
3. Restore the newest snapshot into a temporary directory with `restic restore latest --target <temporary-directory>`.
4. Verify `sha256sum --check SHA256SUMS` from the restored backup root.
5. Follow Supabase's documented order to restore `roles.sql`, `schema.sql`, and `data.sql` into the disposable local database with `ON_ERROR_STOP=1` and a single transaction where supported.
6. Restore every object to its matching private bucket, then compare object counts and checksums.
7. Run `npm run db:lint`, `npm run test:db`, and the staging smoke journey.
8. Record the snapshot ID, date, elapsed restore time, row/object counts, failures, and corrective work in the release record.

Do not point a restore command at the production database. A production restore requires preserving incident evidence, confirming data corruption, selecting a verified snapshot, and explicit operator confirmation.
