# Archive deletion operator runbook

The published callable is staged **disabled**. Publishing this source does not authorize, activate, or run deletion.

## Before activation

1. Deploy this folder as a separate Firebase Functions codebase with `functions.js` as its entry point. Do not replace an existing functions codebase.
2. Verify the deployed Firestore rules exactly match this repository's `firestore.rules`, and wait for the `evidence` index to become ready.
3. Inventory every privileged writer. Each driver or finance writer must check `archiveDeletionControl/state` and the relevant `archiveDeletionLocks` document in the same transaction as its protected write. Readers must stop during maintenance.
4. Rehearse prepare, resume, pre-commit cancel, commit, bounded purge, and recovery in staging. Confirm legacy pages fail closed during maintenance.
5. Confirm the trusted operator, grant only the signed `archiveAdmin: true` custom claim, and separately review callable invoker IAM.
6. Enable all four server flags only during an approved maintenance window and only after every check above is independently recorded:
   - `ARCHIVE_DELETION_ENABLED`
   - `ARCHIVE_DELETION_RULES_VERIFIED`
   - `ARCHIVE_DELETION_WRITER_LOCKS_VERIFIED`
   - `ARCHIVE_DELETION_READER_GATE_VERIFIED`

## Operation

Keep one idempotency key for the whole operation. Preparation creates retained evidence and a provisional lock. Cancel is safe only before commit. Commit is irreversible: after it, keep maintenance active and repeatedly resume bounded `step` calls until the server reports `completed`. Never manually remove a permanent lock or clear maintenance after a failure.

## Recovery

Retry with the same idempotency key and inspect server status. Do not start another operation for the same driver. If the operation is committed or purging, recovery means completing purge—not rollback. Escalate with the operation ID; do not edit protocol documents by hand.
