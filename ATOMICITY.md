# Atomic business writes and audit evidence

Source: `fahadq8y/Test-taxi`, root HTML pages on `main`.

The six changed pages commit each Firestore business operation and its audit
events together. Transactions re-read mutable records before writing audit
snapshots. Restoring a deleted record reads the source event and destination,
rejects already-restored events and existing destinations, and commits the
destination, restoration marker and new audit event together.

Driver archival writes an individual event for each archived payment, expense
and revenue in addition to the parent event. Archives exceeding Firestore write
or conservative size limits fail explicitly without splitting the operation
into partially successful chunks.

## Verification

Run `node --test tests/*.test.cjs` from this directory.

Tests extract actual page functions/callbacks and run them against synthetic
in-memory Firestore/Auth substitutes. They inject audit/commit failures and
concurrent requests. Separate syntax checks parse all inline scripts. No test
contacts Firebase or writes real financial data. These tests are not a Firebase
emulator or a deployed security-rules validation.

## Boundaries

- Firebase Authentication and Firestore cannot share a transaction. User
  provisioning uses isolated Auth and attempts compensating account deletion
  if the Firestore commit fails; unsuccessful cleanup is explicitly reported.
- Client-side archival queries enumerate children before the transaction.
  Included records are re-read and protected from stale edits; this is not a
  predicate lock against other pages creating additional children mid-archive.
- Financial formulas, the unified balance engine and Firestore rules are
  unchanged.
- The existing shared read/compatibility helper is retained unchanged. Other
  pages outside the six-file scope may still use its legacy separate-write API.