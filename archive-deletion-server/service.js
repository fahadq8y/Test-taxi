"use strict";

const {
  MAX_CHUNK_DOCS,
  MAX_CHUNK_BYTES,
  MAX_PREPARE_BATCH_BYTES,
  QUERY_PAGE_DOCS,
  ProtocolError,
  requireEnabled,
  requireAdmin,
  canonicalEmployeeNumber,
  operationId,
  evidenceId,
  versionOf,
  assertEvidenceSize,
  estimatedBytes,
  nextStage,
  buildMatchPlan,
} = require("./protocol");

class ArchiveDeletionService {
  constructor({ db, FieldValue, FieldPath, config, now = () => new Date() }) {
    if (!db || !FieldValue || !FieldPath) throw new TypeError("db, FieldValue and FieldPath are required");
    this.db = db;
    this.FieldValue = FieldValue;
    this.FieldPath = FieldPath;
    this.config = Object.freeze({ ...config });
    this.now = now;
  }

  guard(claims) {
    requireEnabled(this.config);
    requireAdmin(claims);
  }

  refs(employeeNumber, opId) {
    return {
      archive: this.db.collection("archivedDrivers").doc(employeeNumber),
      lock: this.db.collection("archiveDeletionLocks").doc(employeeNumber),
      operation: this.db.collection("archiveDeletionOperations").doc(opId),
      evidence: this.db.collection("archiveDeletionOperations").doc(opId).collection("evidence"),
      events: this.db.collection("archiveDeletionOperations").doc(opId).collection("events"),
      control: this.db.collection("archiveDeletionControl").doc("state"),
    };
  }

  async activeDriverSnapshots(employeeNumber, archive, tx = null) {
    const ids = [...new Set([employeeNumber, archive.driverId, archive.id].filter(v => typeof v === "string" && v))];
    const read = target => (tx ? tx.get(target) : target.get());
    const results = [];
    for (const id of ids) results.push(await read(this.db.collection("drivers").doc(id)));
    for (const id of ids) {
      const query = this.db.collection("drivers").where("employeeNumber", "==", id).limit(1);
      results.push(await read(query));
    }
    return results.flatMap(item => item.docs || [item]).filter(item => item.exists);
  }

  assertOperationIdentity(data, employeeNumber, idempotencyKey) {
    if (data.employeeNumber !== employeeNumber || data.idempotencyKey !== idempotencyKey) {
      throw new ProtocolError("IDEMPOTENCY_CONFLICT", "The idempotency key belongs to a different archive operation.");
    }
  }

  async captureEvidenceBatch(refs, rows, claims) {
    if (!rows.length) return;
    await this.db.runTransaction(async tx => {
      const operation = await tx.get(refs.operation);
      if (!operation.exists) throw new ProtocolError("OPERATION_NOT_FOUND", "Preparing operation is missing.");
      if (operation.data().stage !== "preparing") {
        throw new ProtocolError("STAGE_CONFLICT", `Evidence cannot be captured in stage ${operation.data().stage}.`);
      }
      const snapshots = [];
      for (const row of rows) snapshots.push(await tx.get(refs.evidence.doc(row.id)));
      const missing = rows.filter((row, index) => !snapshots[index].exists);
      if (!missing.length) return;
      const from = operation.data().capturedCount || 0;
      missing.forEach((row, index) => {
        tx.create(refs.evidence.doc(row.id), {
          ...row,
          sequence: from + index,
          capturedAt: this.FieldValue.serverTimestamp(),
        });
      });
      tx.update(refs.operation, {
        capturedCount: from + missing.length,
        lastCaptureAt: this.FieldValue.serverTimestamp(),
      });
      tx.create(refs.events.doc(`capture-${String(from).padStart(12, "0")}`), {
        type: "evidenceCaptured",
        from,
        count: missing.length,
        evidenceIds: missing.map(row => row.id),
        actorUid: claims.uid,
        at: this.FieldValue.serverTimestamp(),
      });
    });
  }

  async captureRowsBounded(refs, rows, claims) {
    let chunk = [];
    let bytes = 0;
    for (const row of rows) {
      const rowBytes = row.sourceBytes;
      if (chunk.length && bytes + rowBytes > MAX_PREPARE_BATCH_BYTES) {
        await this.captureEvidenceBatch(refs, chunk, claims);
        chunk = [];
        bytes = 0;
      }
      chunk.push(row);
      bytes += rowBytes;
    }
    await this.captureEvidenceBatch(refs, chunk, claims);
  }

  async captureAllSources(employeeNumber, archive, refs, claims) {
    const seen = new Set();
    for (const spec of buildMatchPlan(employeeNumber, archive)) {
      let cursor = null;
      do {
        let query = this.db.collection(spec.collection)
          .where(spec.field, "==", spec.value)
          .orderBy(this.FieldPath.documentId())
          .limit(QUERY_PAGE_DOCS);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        const rows = [];
        for (const source of page.docs) {
          cursor = source;
          if (seen.has(source.ref.path)) continue;
          seen.add(source.ref.path);
          const data = source.data();
          assertEvidenceSize({ data });
          rows.push({
            id: evidenceId(source.ref.parent.id, source.id),
            collection: source.ref.parent.id,
            documentId: source.id,
            data,
            sourceVersion: versionOf(source),
            sourceBytes: estimatedBytes(data),
            purge: true,
          });
        }
        await this.captureRowsBounded(refs, rows, claims);
        if (page.size < QUERY_PAGE_DOCS) cursor = null;
      } while (cursor);
    }
  }

  async prepare({ employeeNumber: rawEmployeeNumber, idempotencyKey, expectedArchiveVersion, claims }) {
    this.guard(claims);
    const employeeNumber = canonicalEmployeeNumber(rawEmployeeNumber);
    const opId = operationId(idempotencyKey);
    const refs = this.refs(employeeNumber, opId);
    const existing = await refs.operation.get();
    if (existing.exists) {
      this.assertOperationIdentity(existing.data(), employeeNumber, idempotencyKey);
      if (existing.data().stage !== "preparing") return this.operationResult(existing);
    }

    const archiveSnap = await refs.archive.get();
    if (!archiveSnap.exists) throw new ProtocolError("ARCHIVE_NOT_FOUND", "Archived driver does not exist.", 404);
    const archive = archiveSnap.data();
    if (archiveSnap.id !== employeeNumber || archive.employeeNumber !== employeeNumber) {
      throw new ProtocolError("ARCHIVE_IDENTITY_MISMATCH", "Archive ID and employeeNumber are not identical.");
    }
    for (const alias of [archive.driverId, archive.id]) {
      if (typeof alias === "string" && alias && alias !== employeeNumber) {
        throw new ProtocolError(
          "ARCHIVE_ALIAS_MISMATCH",
          "Archive driver aliases must equal the canonical employeeNumber; no alias lock was acquired.",
        );
      }
    }
    const archiveVersion = versionOf(archiveSnap);
    if (expectedArchiveVersion && expectedArchiveVersion !== archiveVersion) {
      throw new ProtocolError("ARCHIVE_CHANGED", "Archive identity/version does not match the confirmation.");
    }
    await this.db.runTransaction(async tx => {
      const [lock, operation, liveArchive, control] = await Promise.all([
        tx.get(refs.lock),
        tx.get(refs.operation),
        tx.get(refs.archive),
        tx.get(refs.control),
      ]);
      if (operation.exists) {
        this.assertOperationIdentity(operation.data(), employeeNumber, idempotencyKey);
        if (operation.data().archiveVersion !== archiveVersion) {
          throw new ProtocolError("ARCHIVE_CHANGED", "Preparing operation belongs to another archive version.");
        }
        return;
      }
      if (lock.exists) {
        throw new ProtocolError("LOCK_OPERATION_MISMATCH", "A lock exists without its matching operation.");
      }
      if (!liveArchive.exists || versionOf(liveArchive) !== archiveVersion) throw new ProtocolError("ARCHIVE_CHANGED", "Archive changed while acquiring its lock.");
      if ((await this.activeDriverSnapshots(employeeNumber, liveArchive.data(), tx)).length) {
        throw new ProtocolError("ACTIVE_DRIVER_EXISTS", "An active driver matches this archive.");
      }
      tx.create(refs.lock, {
        employeeNumber,
        operationId: opId,
        archiveVersion,
        createdAt: this.FieldValue.serverTimestamp(),
        permanent: false,
      });
      tx.create(refs.operation, {
        operationId: opId,
        idempotencyKey,
        employeeNumber,
        archiveVersion,
        stage: "preparing",
        capturedCount: 0,
        purgedCount: 0,
        actorUid: claims.uid,
        preparingAt: this.FieldValue.serverTimestamp(),
      });
      tx.create(refs.events.doc("preparing"), {
        type: "preparing",
        actorUid: claims.uid,
        at: this.FieldValue.serverTimestamp(),
      });
      const maintenanceCount = (control.exists ? control.data().maintenanceCount : 0) + 1;
      tx.set(refs.control, {
        maintenanceCount,
        maintenance: true,
        activeOperationId: opId,
        epoch: (control.exists ? control.data().epoch || 0 : 0) + 1,
        updatedAt: this.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    // All production writers must reject writes when this provisional lock and
    // the global maintenance gate exist.
    const archiveEvidence = {
      id: evidenceId("archivedDrivers", employeeNumber),
      collection: "archivedDrivers",
      documentId: employeeNumber,
      data: archive,
      sourceVersion: archiveVersion,
      sourceBytes: estimatedBytes(archive),
      purge: false,
    };
    assertEvidenceSize(archiveEvidence);
    await this.captureRowsBounded(refs, [archiveEvidence], claims);
    await this.captureAllSources(employeeNumber, archive, refs, claims);

    await this.db.runTransaction(async tx => {
      const [operation, lock, liveArchive] = await Promise.all([tx.get(refs.operation), tx.get(refs.lock), tx.get(refs.archive)]);
      if (!operation.exists) throw new ProtocolError("OPERATION_NOT_FOUND", "Preparing operation is missing.");
      this.assertOperationIdentity(operation.data(), employeeNumber, idempotencyKey);
      if (operation.data().stage === "prepared") return;
      nextStage(operation.data().stage, "ready");
      if (!lock.exists || lock.data().operationId !== opId || lock.data().permanent === true) {
        throw new ProtocolError("LOCK_LOST", "Provisional archive lock is missing or invalid.");
      }
      if (!liveArchive.exists || versionOf(liveArchive) !== archiveVersion) throw new ProtocolError("ARCHIVE_CHANGED", "Archive changed after evidence capture.");
      const childCount = (operation.data().capturedCount || 0) - 1;
      if (childCount < 0) throw new ProtocolError("EVIDENCE_INCOMPLETE", "Archive evidence is missing.");
      tx.update(refs.operation, {
        stage: "prepared",
        childCount,
        preparedAt: this.FieldValue.serverTimestamp(),
      });
      tx.create(refs.events.doc("prepared"), {
        type: "prepared",
        childCount,
        actorUid: claims.uid,
        at: this.FieldValue.serverTimestamp(),
      });
    });
    return this.operationResult(await refs.operation.get());
  }

  async cancel({ employeeNumber: rawEmployeeNumber, idempotencyKey, claims }) {
    this.guard(claims);
    const employeeNumber = canonicalEmployeeNumber(rawEmployeeNumber);
    const refs = this.refs(employeeNumber, operationId(idempotencyKey));
    await this.db.runTransaction(async tx => {
      const [operation, control, lock] = await Promise.all([tx.get(refs.operation), tx.get(refs.control), tx.get(refs.lock)]);
      if (!operation.exists) throw new ProtocolError("OPERATION_NOT_FOUND", "Operation does not exist.", 404);
      this.assertOperationIdentity(operation.data(), employeeNumber, idempotencyKey);
      if (operation.data().stage === "cancelled") return;
      nextStage(operation.data().stage, "cancel");
      if (!lock.exists || lock.data().operationId !== operation.data().operationId || lock.data().permanent === true) {
        throw new ProtocolError("LOCK_LOST", "Cancellable provisional lock does not match.");
      }
      const maintenanceCount = Math.max(0, (control.exists ? control.data().maintenanceCount : 0) - 1);
      tx.delete(refs.lock);
      tx.update(refs.operation, { stage: "cancelled", cancelledAt: this.FieldValue.serverTimestamp(), cancelledBy: claims.uid });
      tx.create(refs.events.doc("cancelled"), { type: "cancelled", actorUid: claims.uid, at: this.FieldValue.serverTimestamp() });
      tx.set(refs.control, {
        maintenanceCount,
        maintenance: maintenanceCount > 0,
        epoch: (control.exists ? control.data().epoch || 0 : 0) + 1,
        updatedAt: this.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return this.operationResult(await refs.operation.get());
  }

  async commit({ employeeNumber: rawEmployeeNumber, idempotencyKey, claims }) {
    this.guard(claims);
    const employeeNumber = canonicalEmployeeNumber(rawEmployeeNumber);
    const refs = this.refs(employeeNumber, operationId(idempotencyKey));
    await this.db.runTransaction(async tx => {
      const [operation, lock, archive] = await Promise.all([tx.get(refs.operation), tx.get(refs.lock), tx.get(refs.archive)]);
      if (!operation.exists) throw new ProtocolError("OPERATION_NOT_FOUND", "Operation does not exist.", 404);
      this.assertOperationIdentity(operation.data(), employeeNumber, idempotencyKey);
      if (["committed", "purging", "completed"].includes(operation.data().stage)) return;
      nextStage(operation.data().stage, "commit");
      if (!lock.exists || lock.data().operationId !== operation.data().operationId || lock.data().permanent === true) {
        throw new ProtocolError("LOCK_LOST", "Provisional lock does not match.");
      }
      if (!archive.exists || archive.id !== employeeNumber || archive.data().employeeNumber !== employeeNumber || versionOf(archive) !== operation.data().archiveVersion) {
        throw new ProtocolError("ARCHIVE_CHANGED", "Archive identity/version changed before commit.");
      }
      const active = await this.activeDriverSnapshots(employeeNumber, archive.data(), tx);
      if (active.length) throw new ProtocolError("ACTIVE_DRIVER_EXISTS", "An active driver matches this archive.");
      tx.delete(refs.archive);
      tx.update(refs.lock, { permanent: true, committedAt: this.FieldValue.serverTimestamp() });
      tx.update(refs.operation, { stage: "committed", committedAt: this.FieldValue.serverTimestamp(), committedBy: claims.uid });
      tx.create(refs.events.doc("committed"), { type: "committed", actorUid: claims.uid, at: this.FieldValue.serverTimestamp() });
    });
    return this.operationResult(await refs.operation.get());
  }

  async beginPurge(refs, claims) {
    await this.db.runTransaction(async tx => {
      const operation = await tx.get(refs.operation);
      if (!operation.exists) throw new ProtocolError("OPERATION_NOT_FOUND", "Operation does not exist.", 404);
      if (["purging", "completed"].includes(operation.data().stage)) return;
      nextStage(operation.data().stage, "beginPurge");
      tx.update(refs.operation, { stage: "purging", purgeStartedAt: this.FieldValue.serverTimestamp() });
      tx.create(refs.events.doc("purging"), { type: "purging", actorUid: claims.uid, at: this.FieldValue.serverTimestamp() });
    });
  }

  async purgeNextChunk({ employeeNumber: rawEmployeeNumber, idempotencyKey, claims, chunkSize = MAX_CHUNK_DOCS }) {
    this.guard(claims);
    const employeeNumber = canonicalEmployeeNumber(rawEmployeeNumber);
    const refs = this.refs(employeeNumber, operationId(idempotencyKey));
    if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_DOCS) {
      throw new ProtocolError("INVALID_CHUNK_SIZE", `chunkSize must be 1..${MAX_CHUNK_DOCS}.`, 400);
    }
    await this.beginPurge(refs, claims);
    const operationBefore = await refs.operation.get();
    if (!operationBefore.exists) throw new ProtocolError("OPERATION_NOT_FOUND", "Operation does not exist.", 404);
    this.assertOperationIdentity(operationBefore.data(), employeeNumber, idempotencyKey);
    if (operationBefore.data().stage === "completed") return this.operationResult(operationBefore);
    const start = operationBefore.data().purgedCount || 0;
    let evidenceQuery = refs.evidence
      .where("purge", "==", true)
      .orderBy("sequence")
      .limit(chunkSize)
      .select("collection", "documentId", "sourceVersion", "sourceBytes", "sequence");
    if (operationBefore.data().lastPurgedSequence !== undefined) {
      evidenceQuery = evidenceQuery.startAfter(operationBefore.data().lastPurgedSequence);
    }
    const candidates = await evidenceQuery.get();
    const selected = [];
    let selectedBytes = 0;
    for (const doc of candidates.docs) {
      const bytes = doc.data().sourceBytes || 0;
      if (selected.length && selectedBytes + bytes > MAX_CHUNK_BYTES) break;
      selected.push(doc);
      selectedBytes += bytes;
    }
    const page = { docs: selected, size: selected.length, empty: selected.length === 0 };
    if (page.empty && start !== operationBefore.data().childCount) {
      throw new ProtocolError("EVIDENCE_INCOMPLETE", "Immutable evidence is missing; purge stopped.");
    }
    const chunkEvent = refs.events.doc(`chunk-${String(start).padStart(12, "0")}`);
    await this.db.runTransaction(async tx => {
      const [operation, lock, control] = await Promise.all([tx.get(refs.operation), tx.get(refs.lock), tx.get(refs.control)]);
      if (operation.data().stage === "completed") return;
      this.assertOperationIdentity(operation.data(), employeeNumber, idempotencyKey);
      if (operation.data().stage !== "purging") throw new ProtocolError("STAGE_CONFLICT", "Operation is not purging.");
      if (operation.data().purgedCount !== start) return; // A concurrent worker won; this retry converges.
      if (!lock.exists || lock.data().operationId !== operation.data().operationId) throw new ProtocolError("LOCK_LOST", "Permanent lock does not match.");
      const liveRows = [];
      for (const evidence of page.docs) {
        const row = evidence.data();
        const ref = this.db.collection(row.collection).doc(row.documentId);
        liveRows.push({ evidence, row, ref, live: await tx.get(ref) });
      }
      for (const item of liveRows) {
        if (item.live.exists && versionOf(item.live) !== item.row.sourceVersion) {
          throw new ProtocolError("SOURCE_CHANGED", `Source ${item.ref.path} changed after evidence capture.`);
        }
      }
      liveRows.forEach(item => {
        if (item.live.exists) tx.delete(item.ref);
      });
      const count = page.size;
      const newCount = start + count;
      const completed = newCount === operation.data().childCount;
      const lastPurgedSequence = page.size
        ? page.docs[page.docs.length - 1].data().sequence
        : operation.data().lastPurgedSequence;
      tx.update(refs.operation, {
        stage: completed ? "completed" : "purging",
        purgedCount: newCount,
        lastChunkAt: this.FieldValue.serverTimestamp(),
        lastPurgedSequence,
        ...(completed ? { completedAt: this.FieldValue.serverTimestamp() } : {}),
      });
      tx.create(chunkEvent, {
        type: "purgeChunk",
        from: start,
        count,
        evidenceIds: page.docs.map(doc => doc.id),
        actorUid: claims.uid,
        at: this.FieldValue.serverTimestamp(),
      });
      if (completed) {
        const maintenanceCount = Math.max(0, (control.exists ? control.data().maintenanceCount : 0) - 1);
        tx.set(refs.control, {
          maintenanceCount,
          maintenance: maintenanceCount > 0,
          epoch: (control.exists ? control.data().epoch || 0 : 0) + 1,
          updatedAt: this.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });
    return this.operationResult(await refs.operation.get());
  }

  operationResult(snapshot) {
    const data = snapshot.data();
    return {
      operationId: snapshot.id,
      employeeNumber: data.employeeNumber,
      stage: data.stage,
      childCount: data.childCount,
      purgedCount: data.purgedCount,
    };
  }
}

module.exports = { ArchiveDeletionService };