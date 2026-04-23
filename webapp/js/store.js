// store.js — IndexedDB-backed key-value store with localStorage fallback.
//
// We keep ONE big "state" document inside an IDB object store. For the
// scale we expect (hundreds of versions per prompt, thousands per
// workspace), a single document is the right call: every write is a single
// IDB transaction, conflicts are impossible inside a tab, and
// import/export is a one-line operation.
//
// Cross-tab edits are coordinated by a BroadcastChannel — when one tab
// saves, all open tabs reload the state and re-render.

const DB_NAME = "prompt-tree";
const DB_VERSION = 2;          // v2 adds the "secrets" object store (see secrets.js)
const STORE = "kv";
const KEY = "state";
const LS_FALLBACK_KEY = "prompt-tree:state";

const channel = (typeof BroadcastChannel !== "undefined")
  ? new BroadcastChannel("prompt-tree")
  : null;

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in window)) {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE))     db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains("secrets")) db.createObjectStore("secrets");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      // Some browsers (private mode) refuse IDB. Fall back to localStorage.
      console.warn("IndexedDB unavailable, falling back to localStorage:", req.error);
      resolve(null);
    };
  });
  return dbPromise;
}

async function idbGet() {
  const db = await openDB();
  if (!db) {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value) {
  const db = await openDB();
  if (!db) {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(value));
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// In-memory state with subscribers.
// ---------------------------------------------------------------------------
let state = null;
const subscribers = new Set();
let saveTimer = null;
let savePending = false;

// ---------------------------------------------------------------------------
// Undo stack — ring buffer of pre-mutation snapshots.
// Mirrored from src/domain/history.ts (tested there in vitest). Kept inline
// as a class to avoid dragging a TS-typed import into the browser path.
// ---------------------------------------------------------------------------
const UNDO_LIMIT = 50;
class HistoryStack {
  constructor(limit = 50) { this.buf = []; this.limit = limit; }
  push(s) { this.buf.push(s); if (this.buf.length > this.limit) this.buf.shift(); }
  pop()   { return this.buf.pop() ?? null; }
  peek()  { return this.buf.length ? this.buf[this.buf.length - 1] : null; }
  canUndo(){ return this.buf.length > 0; }
  get size() { return this.buf.length; }
  clear() { this.buf.length = 0; }
}
const history = new HistoryStack(UNDO_LIMIT);

export function getState() { return state; }
export function canUndo()  { return history.canUndo(); }
export function undoSize() { return history.size; }

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify() {
  for (const fn of subscribers) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

export async function loadState({ defaults }) {
  const fromDisk = await idbGet();
  state = fromDisk ?? defaults;
  history.clear();
  return state;
}

// Mutate the state via a function. The function is called with a structured
// clone, so callers cannot accidentally mutate the live object. Returns the
// mutated state. Saves and broadcasts are coalesced. The previous state is
// pushed onto the undo stack so the caller can revert via undo().
export function mutate(fn) {
  const snapshot = state ? structuredClone(state) : null;
  const draft = structuredClone(state);
  const result = fn(draft);
  state = (result && typeof result === "object") ? result : draft;
  state.meta = state.meta || {};
  state.meta.updatedAt = Date.now();
  state.meta.revision = (state.meta.revision || 0) + 1;
  if (snapshot) history.push(snapshot);
  notify();
  scheduleSave();
  return state;
}

// Pop the most recent pre-mutation snapshot back into state.
// Returns `true` on a successful undo, `false` when the stack is empty.
// The restored state keeps its own meta.revision advancing so the UI still
// re-renders (otherwise subscribers that key off the revision would skip).
export function undo() {
  const prev = history.pop();
  if (!prev) return false;
  const rev = (state?.meta?.revision ?? 0) + 1;
  state = prev;
  state.meta = state.meta || {};
  state.meta.updatedAt = Date.now();
  state.meta.revision = rev;
  notify();
  scheduleSave();
  return true;
}

// Immediate save (no debounce). Used by import.
export async function commit() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await idbPut(state);
  if (channel) channel.postMessage({ type: "state-changed", revision: state.meta?.revision });
}

function scheduleSave() {
  savePending = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    savePending = false;
    try {
      await idbPut(state);
      if (channel) channel.postMessage({ type: "state-changed", revision: state.meta?.revision });
    } catch (err) {
      console.error("Save failed:", err);
    }
  }, 200);
}

export function isSavePending() { return savePending; }

// Cross-tab sync: when another tab writes, reload and notify.
export function startMultiTabSync() {
  if (!channel) return;
  channel.addEventListener("message", async (e) => {
    if (e.data?.type === "state-changed" && e.data.revision !== state?.meta?.revision) {
      const fresh = await idbGet();
      if (fresh) {
        state = fresh;
        notify();
      }
    }
  });
}

// Hard reset — useful for "Reset demo" and Import.
// Clears the undo stack so the user can't accidentally "undo" themselves
// back into a half-mixed pre-import state.
export async function resetTo(value) {
  state = value;
  state.meta = state.meta || {};
  state.meta.updatedAt = Date.now();
  state.meta.revision = (state.meta.revision || 0) + 1;
  history.clear();
  await commit();
  notify();
}

// Snapshot management — used by undo (in services.js).
export async function exportJSON() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "prompt-tree",
    state,
  };
}

export async function importJSON(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid payload");
  if (payload.app !== "prompt-tree") throw new Error("Not a Prompt Tree export");
  if (!payload.state) throw new Error("Payload is missing 'state'");
  await resetTo(payload.state);
}
