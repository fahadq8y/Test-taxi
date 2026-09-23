# Staged archive deletion server

This is an Admin SDK-only, fail-closed service. It does **not** mean deletion is
enabled in any environment. The supplied legacy rules contain an unsafe
catch-all write grant, so all four verification flags must remain false until
new rules are deployed and independently verified.

## HTTP API

Deploy `createHttpHandler()` with the project's normal Cloud Functions/Run
wrapper. Send `POST` with `Authorization: Bearer <Firebase ID token>` and JSON:

```json
{
  "action": "prepare",
  "employeeNumber": "DRV030",
  "idempotencyKey": "a-client-generated-random-key-at-least-16-chars",
  "expectedArchiveVersion": "1712345678901"
}
```

Callable actions are `capability`, `status`, `prepare`, `commit`, `step`, and
`cancel` (`purgeNextChunk` is the HTTP alias for `step`). Stages are
`preparing`, `prepared`, `committed`, `purging`, and `completed` (plus terminal
`cancelled`). `step` also
accepts `chunkSize` (1–200, additionally capped at 6 MB of source documents).
Responses contain `operationId`, `stage`,
`childCount`, and `purgedCount`. Persist and reuse the same idempotency key.
Cancellation is legal in `preparing` or `prepared`; it atomically releases the
provisional lock and global maintenance gate. Commit turns that lock into a
permanent tombstone and removes only the archive record atomically. Purging then removes
financial children in retryable atomic chunks while preserving evidence.

Authorization uses only the signed custom claim `archiveAdmin === true`; a role
in a user/profile document is ignored. Export `createCallableHandler()` through
the deployment project's `onCall` wrapper, passing the callable request through
unchanged. Alternatively, `createCallableHandlers()` returns six named
handlers so the deployment can expose callable functions named
`archiveDeletionCapability`, `archiveDeletionStatus`,
`archiveDeletionPrepare`, `archiveDeletionCommit`, `archiveDeletionStep`, and
`archiveDeletionCancel`.

## Required deployment invariants

Set all values below to the literal string `true` only after verification:

- `ARCHIVE_DELETION_ENABLED`
- `ARCHIVE_DELETION_RULES_VERIFIED`
- `ARCHIVE_DELETION_WRITER_LOCKS_VERIFIED`
- `ARCHIVE_DELETION_READER_GATE_VERIFIED`

Rules must deny clients access to lock/operation/evidence/event/control
collections. Every driver, archive, and financial read/write must check
`archiveDeletionControl/state` and refuse while `maintenance == true`. Prepare
enters this global gate before evidence collection; cancel or successful purge
completion leaves it. Every coordinated driver/financial writer must also
transactionally check `archiveDeletionLocks/{employeeNumber}` and refuse while
it exists; after commit it is a permanent tombstone, while safe pre-commit
cancel deletes the provisional lock. This is the contract required by the `archive-guards`
workstream. Inventory and migration of every other Admin SDK writer is a rollout
blocker because Admin SDK bypasses Firestore rules.
Required composite indexes include evidence `(purge, sequence)`. Child
collections are queried by **both** `employeeNumber` and `driverId`.
Preparation rejects an archive whose `driverId` or embedded `id` differs from
the canonical archive ID/`employeeNumber`; this avoids leaving an alias
unlocked.

Evidence retains original Admin SDK values (Timestamp, GeoPoint, DocumentReference
and bytes) without JSON conversion. It is permanent and stored one bounded
document per source. A lock is provisional only while cancellation is safe; the
commit transaction marks it permanent, after which it is never released.