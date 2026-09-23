"use strict";

const crypto = require("node:crypto");

const COLLECTIONS = Object.freeze(["driverPayments", "revenues", "expenses"]);
const MAX_CHUNK_DOCS = 200;
const MAX_CHUNK_BYTES = 6_000_000;
const MAX_PREPARE_BATCH_BYTES = 3_000_000;
// With MAX_EVIDENCE_BYTES this also bounds one query response below 6 MB.
const QUERY_PAGE_DOCS = 8;
const MAX_EVIDENCE_BYTES = 700_000;

class ProtocolError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
    this.status = status;
  }
}

function requireEnabled(config) {
  if (
    config.enabled !== true ||
    config.rulesVerified !== true ||
    config.writerLocksVerified !== true ||
    config.readerGateVerified !== true
  ) {
    throw new ProtocolError(
      "DISABLED",
      "Archive deletion is fail-closed until restrictive rules, writer locks, and the global financial-reader gate are verified.",
      503,
    );
  }
}

function requireAdmin(claims) {
  if (!claims || claims.archiveAdmin !== true) {
    throw new ProtocolError("FORBIDDEN", "A server-issued archiveAdmin custom claim is required.", 403);
  }
}

function canonicalEmployeeNumber(value) {
  if (typeof value !== "string") throw new ProtocolError("INVALID_EMPLOYEE_NUMBER", "employeeNumber must be a string.", 400);
  const canonical = value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(canonical) || canonical !== value) {
    throw new ProtocolError("INVALID_EMPLOYEE_NUMBER", "employeeNumber is not a canonical Firestore document ID.", 400);
  }
  return canonical;
}

function operationId(idempotencyKey) {
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 256) {
    throw new ProtocolError("INVALID_IDEMPOTENCY_KEY", "idempotencyKey must contain 16 to 256 characters.", 400);
  }
  return crypto.createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
}

function evidenceId(collection, id) {
  return crypto.createHash("sha256").update(`${collection}\0${id}`, "utf8").digest("hex");
}

function versionOf(snapshot) {
  const value = snapshot.updateTime || snapshot.readTime;
  if (!value) throw new ProtocolError("MISSING_VERSION", `Firestore did not return a version for ${snapshot.ref.path}.`);
  if (Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return `${value.seconds}:${String(value.nanoseconds).padStart(9, "0")}`;
  }
  return typeof value.toMillis === "function" ? String(value.toMillis()) : String(value);
}

// Deliberately conservative. Values are retained untouched in evidence; this only
// refuses documents too close to Firestore's 1 MiB limit.
function estimatedBytes(value, seen = new Set()) {
  if (value === null || value === undefined) return 8;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8") + 8;
  if (typeof value === "number" || typeof value === "boolean") return 16;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return value.byteLength + 16;
  if (typeof value !== "object") return 32;
  if (value instanceof Date) return 16;
  const constructorName = value.constructor && value.constructor.name;
  if (
    (constructorName === "Timestamp" && typeof value.toDate === "function") ||
    (constructorName === "GeoPoint" && typeof value.isEqual === "function") ||
    (constructorName === "DocumentReference" &&
      typeof value.isEqual === "function" &&
      typeof value.path === "string" &&
      value.firestore)
  ) {
    return 64;
  }
  if (seen.has(value)) throw new ProtocolError("INVALID_SOURCE", "Circular source data cannot be archived.");
  seen.add(value);
  let bytes = 32;
  for (const [key, child] of Object.entries(value)) bytes += Buffer.byteLength(key, "utf8") + estimatedBytes(child, seen);
  seen.delete(value);
  return bytes;
}

function assertEvidenceSize(data) {
  if (estimatedBytes(data) > MAX_EVIDENCE_BYTES) {
    throw new ProtocolError("EVIDENCE_TOO_LARGE", "A source document is too large for bounded immutable evidence.", 413);
  }
}

function nextStage(stage, action) {
  const transitions = {
    preparing: { ready: "prepared", cancel: "cancelled" },
    prepared: { commit: "committed", cancel: "cancelled" },
    committed: { beginPurge: "purging" },
    purging: { complete: "completed" },
  };
  const next = transitions[stage] && transitions[stage][action];
  if (!next) throw new ProtocolError("STAGE_CONFLICT", `Cannot ${action} an operation in stage ${stage}.`);
  return next;
}

function buildMatchPlan(employeeNumber, archive) {
  const ids = [...new Set([employeeNumber, archive.employeeNumber, archive.driverId, archive.id].filter(v => typeof v === "string" && v))];
  return COLLECTIONS.flatMap(collection =>
    ["employeeNumber", "driverId"].flatMap(field => ids.map(value => ({ collection, field, value }))),
  );
}

module.exports = {
  COLLECTIONS,
  MAX_CHUNK_DOCS,
  MAX_CHUNK_BYTES,
  MAX_PREPARE_BATCH_BYTES,
  QUERY_PAGE_DOCS,
  MAX_EVIDENCE_BYTES,
  ProtocolError,
  requireEnabled,
  requireAdmin,
  canonicalEmployeeNumber,
  operationId,
  evidenceId,
  versionOf,
  estimatedBytes,
  assertEvidenceSize,
  nextStage,
  buildMatchPlan,
};