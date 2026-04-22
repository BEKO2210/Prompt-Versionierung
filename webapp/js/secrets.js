// secrets.js — encrypted-at-rest API key storage.
//
// Keys are kept in a SEPARATE IndexedDB object store (not the main state
// document) so:
//   1. workspace export never includes them by accident
//   2. they can be cleared without nuking your work
//   3. cross-tab sync of state doesn't accidentally broadcast secrets
//
// At-rest encryption uses AES-GCM with a per-browser key derived from a
// stable random salt stored alongside. This is NOT a defence against an
// attacker with browser access — it's a defence against accidentally
// leaking the value via console.log, copy-paste, or DevTools snapshots.

const DB_NAME = "prompt-tree";
const DB_VERSION = 2;          // bumped from store.js's v1 → v2 to add the new store
const SECRETS_STORE = "secrets";
const KV_STORE      = "kv";    // pre-existing store from store.js
const SALT_KEY      = "__pt_salt__";

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return resolve(null);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE))      db.createObjectStore(KV_STORE);
      if (!db.objectStoreNames.contains(SECRETS_STORE)) db.createObjectStore(SECRETS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => { console.warn("Secrets IDB unavailable"); resolve(null); };
  });
  return _dbPromise;
}

async function idbGet(store, key) {
  const db = await openDB();
  if (!db) return null;
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => res(r.result ?? null);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(store, key, value) {
  const db = await openDB();
  if (!db) return;
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(store, key) {
  const db = await openDB();
  if (!db) return;
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbAllKeys(store) {
  const db = await openDB();
  if (!db) return [];
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).getAllKeys();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}

// ---------------------------------------------------------------------------
// AES-GCM at-rest encryption with a per-browser derived key.
// ---------------------------------------------------------------------------
async function getOrCreateSalt() {
  let salt = await idbGet(SECRETS_STORE, SALT_KEY);
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
    await idbSet(SECRETS_STORE, SALT_KEY, salt);
  }
  return salt instanceof Uint8Array ? salt : new Uint8Array(salt);
}

async function deriveKey() {
  const salt = await getOrCreateSalt();
  // Bind to the page's origin so a copied IDB blob can't be decrypted on
  // a different host. The "passphrase" is a fixed app constant — this is
  // obfuscation, not authentication. A user-supplied passphrase is a
  // future-proofing path (B1.x).
  const material = new TextEncoder().encode("prompt-tree:" + location.origin);
  const baseKey = await crypto.subtle.importKey(
    "raw", material, "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(plain) {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

async function decrypt(blob) {
  if (!blob || !blob.iv || !blob.ct) return "";
  const key = await deriveKey();
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);
  try {
    const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(buf);
  } catch {
    return ""; // wrong origin / wrong salt → silently ignore
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const KEY_PREFIX = "key:";  // IDB keys: key:anthropic, key:openai, ...

const PROVIDERS = ["anthropic", "openai", "google"];

export function listProviders() { return PROVIDERS.slice(); }

// Set or clear a provider's API key.
export async function setApiKey(provider, value) {
  if (!PROVIDERS.includes(provider)) throw new Error("Unknown provider: " + provider);
  if (value && value.trim()) {
    const blob = await encrypt(value.trim());
    await idbSet(SECRETS_STORE, KEY_PREFIX + provider, blob);
  } else {
    await idbDel(SECRETS_STORE, KEY_PREFIX + provider);
  }
}

// Read a provider's API key. Returns "" if not configured.
export async function getApiKey(provider) {
  const blob = await idbGet(SECRETS_STORE, KEY_PREFIX + provider);
  return blob ? await decrypt(blob) : "";
}

// Cheap "is configured?" probe — does NOT decrypt.
export async function hasApiKey(provider) {
  const blob = await idbGet(SECRETS_STORE, KEY_PREFIX + provider);
  return !!blob;
}

// Status snapshot for the settings UI.
export async function statusAll() {
  const out = {};
  for (const p of PROVIDERS) out[p] = await hasApiKey(p);
  return out;
}

// Clear ALL secrets. The salt is preserved so re-entering the same key
// still decrypts to the same value if you ever restore an export.
export async function clearAllSecrets() {
  for (const p of PROVIDERS) await idbDel(SECRETS_STORE, KEY_PREFIX + p);
}

// Helper: redact a key for display ("sk-ant-…1234").
export function redact(key) {
  if (!key) return "";
  if (key.length < 12) return "•".repeat(key.length);
  return key.slice(0, 7) + "…" + key.slice(-4);
}
