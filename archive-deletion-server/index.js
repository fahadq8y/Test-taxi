"use strict";

const admin = require("firebase-admin");
const { ArchiveDeletionService } = require("./service");
const protocol = require("./protocol");

function environmentConfig(env = process.env) {
  return {
    enabled: env.ARCHIVE_DELETION_ENABLED === "true",
    rulesVerified: env.ARCHIVE_DELETION_RULES_VERIFIED === "true",
    writerLocksVerified: env.ARCHIVE_DELETION_WRITER_LOCKS_VERIFIED === "true",
    readerGateVerified: env.ARCHIVE_DELETION_READER_GATE_VERIFIED === "true",
  };
}

function createService(options = {}) {
  if (!admin.apps.length) admin.initializeApp();
  return new ArchiveDeletionService({
    db: options.db || admin.firestore(),
    FieldValue: options.FieldValue || admin.firestore.FieldValue,
    FieldPath: options.FieldPath || admin.firestore.FieldPath,
    config: options.config || environmentConfig(),
  });
}

function createHttpHandler({ service = createService(), auth = admin.auth() } = {}) {
  return async function archiveDeletionHandler(req, res) {
    try {
      if (req.method !== "POST") throw new protocol.ProtocolError("METHOD_NOT_ALLOWED", "POST is required.", 405);
      const match = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!match) throw new protocol.ProtocolError("UNAUTHENTICATED", "A Firebase ID token is required.", 401);
      const claims = await auth.verifyIdToken(match[1], true);
      const { action, ...input } = req.body || {};
      const methods = {
        prepare: "prepare",
        commit: "commit",
        cancel: "cancel",
        step: "purgeNextChunk",
        purgeNextChunk: "purgeNextChunk",
      };
      if (!methods[action]) throw new protocol.ProtocolError("INVALID_ACTION", "Unknown action.", 400);
      const result = await service[methods[action]]({ ...input, claims });
      res.status(200).json(result);
    } catch (error) {
      const status = error instanceof protocol.ProtocolError ? error.status : 500;
      res.status(status).json({
        error: error instanceof protocol.ProtocolError ? error.code : "INTERNAL",
        message: error instanceof protocol.ProtocolError ? error.message : "Archive deletion failed.",
      });
    }
  };
}

function createCallableHandler({ service = createService() } = {}) {
  return async function archiveDeletionCallable(request) {
    const claims = request && request.auth && request.auth.token;
    if (!claims) throw new protocol.ProtocolError("UNAUTHENTICATED", "Authentication is required.", 401);
    const { action, ...input } = request.data || {};
    protocol.requireAdmin(claims);
    if (action === "capability") {
      const config = service.config;
      return {
        authorized: true,
        enabled:
          config.enabled === true &&
          config.rulesVerified === true &&
          config.writerLocksVerified === true &&
          config.readerGateVerified === true,
        checks: {
          enabled: config.enabled === true,
          rulesVerified: config.rulesVerified === true,
          writerLocksVerified: config.writerLocksVerified === true,
          readerGateVerified: config.readerGateVerified === true,
        },
        stages: ["preparing", "prepared", "committed", "purging", "completed"],
        maxChunkSize: protocol.MAX_CHUNK_DOCS,
      };
    }
    service.guard(claims);
    if (action === "status") {
      const employeeNumber = protocol.canonicalEmployeeNumber(input.employeeNumber);
      const opId = protocol.operationId(input.idempotencyKey);
      const snapshot = await service.refs(employeeNumber, opId).operation.get();
      if (!snapshot.exists) throw new protocol.ProtocolError("OPERATION_NOT_FOUND", "Operation does not exist.", 404);
      service.assertOperationIdentity(snapshot.data(), employeeNumber, input.idempotencyKey);
      return service.operationResult(snapshot);
    }
    const methods = { prepare: "prepare", commit: "commit", step: "purgeNextChunk", cancel: "cancel" };
    if (!methods[action]) throw new protocol.ProtocolError("INVALID_ACTION", "Unknown action.", 400);
    return service[methods[action]]({ ...input, claims });
  };
}

function createCallableHandlers(options = {}) {
  const handler = createCallableHandler(options);
  const bind = action => request =>
    handler({ ...request, data: { ...(request.data || {}), action } });
  return {
    capability: bind("capability"),
    status: bind("status"),
    prepare: bind("prepare"),
    commit: bind("commit"),
    step: bind("step"),
    cancel: bind("cancel"),
  };
}

module.exports = {
  createService,
  createHttpHandler,
  createCallableHandler,
  createCallableHandlers,
  environmentConfig,
  ArchiveDeletionService,
  ...protocol,
};