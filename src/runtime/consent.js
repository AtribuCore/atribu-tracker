// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

import { storage } from "./storage.js";

export function getConsent() {
  try {
    var raw = storage.getItem("atribu_consent");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setConsent(consentPayload) {
  try {
    storage.setItem("atribu_consent", JSON.stringify(consentPayload));
  } catch (_) {}
}
