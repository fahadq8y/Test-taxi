"use strict";
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { createCallableHandler, ProtocolError } = require("./index");
const handler = createCallableHandler();
exports.archiveDeletion = onCall({ timeoutSeconds: 540, memory: "512MiB" }, async request => {
  try {
    return await handler(request);
  } catch (error) {
    if (!(error instanceof ProtocolError)) {
      console.error("Archive deletion request failed", error.code || "INTERNAL");
      throw new HttpsError("internal", "تعذر تنفيذ العملية. احتفظ بمعرّف العملية واستأنف لاحقاً.");
    }
    const codes = { 400: "invalid-argument", 401: "unauthenticated", 403: "permission-denied",
      404: "not-found", 409: "failed-precondition", 413: "resource-exhausted", 503: "unavailable" };
    throw new HttpsError(codes[error.status] || "internal", error.message, { code: error.code });
  }
});