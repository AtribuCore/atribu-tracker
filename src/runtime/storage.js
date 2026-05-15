// ---------------------------------------------------------------------------
// localStorage wrappers
// ---------------------------------------------------------------------------

import { genId } from "./util.js";

export var storage = window.localStorage;

export function readOrCreate(name, prefix) {
  try {
    var existing = storage.getItem(name);
    if (existing) return existing;
    var created = genId(prefix);
    storage.setItem(name, created);
    return created;
  } catch (_) {
    return genId(prefix);
  }
}

export function readJson(name) {
  try {
    var raw = storage.getItem(name);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function writeJson(name, value) {
  try {
    storage.setItem(name, JSON.stringify(value));
  } catch (_) {}
}
