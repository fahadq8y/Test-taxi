# Archive deletion operator runbook

## Current deployment state

Archive deletion is emergency-disabled. All four readiness flags are the literal string `false`, and the emergency review verified zero deletion operations. Do **not** enable any flag. Publishing this source does not deploy, activate, authorize, or run deletion. The service deployment owner must deploy the hardened server with every flag still false.

## Activation remains blocked

Do not enable deletion until all of these are completed and independently recorded:

1. Coordinate every privileged writer and every console, import, service-account, and IAM route that can bypass Firestore Rules. Driver and finance writers must check `archiveDeletionControl/state` and all relevant `archiveDeletionLocks` documents transactionally with their protected write.
2. Complete full reader and browser acceptance while maintenance is active. Every protected page, report, listener, and legacy route must fail closed without showing partial or cached data as current.
3. Complete a recovery rehearsal covering prepare, resume, pre-commit cancel, irreversible commit, bounded purge, restart from durable server state, and failure handling. Verify that maintenance and permanent locks are never manually cleared after commitment or failure.
4. Re-verify the deployed rules, evidence indexes, callable IAM, trusted `archiveAdmin` identity, and exact hardened server source in an approved maintenance window.

The required flags are:

- `ARCHIVE_DELETION_ENABLED`
- `ARCHIVE_DELETION_RULES_VERIFIED`
- `ARCHIVE_DELETION_WRITER_LOCKS_VERIFIED`
- `ARCHIVE_DELETION_READER_GATE_VERIFIED`

They must remain false until every blocker above is closed. Source presence, a successful deploy, or an earlier activation does not satisfy these gates.

## Recovery safety

Use one idempotency key for the whole operation. Cancel is safe only before commit. After commit, recovery means resuming bounded purge to verified completion—not rollback. Never delete a permanent lock, edit protocol documents by hand, or clear global maintenance merely because a request or deployment failed. Escalate with the operation ID.
