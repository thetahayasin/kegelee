/**
 * Kegelee Offline Database — IndexedDB wrapper.
 *
 * Stores exercises, levels, onboarding slides, settings, knowledge lessons,
 * workout sessions, measurements, reminders, and sync metadata.
 *
 * Zero dependencies. Works in all modern browsers and WebViews.
 */

const DB_NAME = 'kegelee';
const DB_VERSION = 1;

const STORES = {
    exercises:          { keyPath: 'id' },
    levels:             { keyPath: 'id' },
    onboarding_slides:  { keyPath: 'id' },
    settings:           { keyPath: 'key' },
    knowledge_lessons:  { keyPath: 'id' },
    // User data — queued for push
    workout_sessions:   { keyPath: 'local_id', autoIncrement: true },
    measurements:       { keyPath: 'local_id', autoIncrement: true },
    reminders:          { keyPath: 'weekday' },
    // Meta
    sync_meta:          { keyPath: 'key' },
};

let _db = null;

function open() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            for (const [name, opts] of Object.entries(STORES)) {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name, opts);
                }
            }
        };

        req.onsuccess = (e) => {
            _db = e.target.result;
            resolve(_db);
        };

        req.onerror = (e) => reject(e.target.error);
    });
}

/** Get all records from a store. */
async function getAll(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Get a single record by key. */
async function get(storeName, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Put (upsert) a single record. */
async function put(storeName, record) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Put multiple records (replace all). */
async function putAll(storeName, records) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        for (const r of records) {
            store.put(r);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Add a record (auto-increment key). Returns the generated key. */
async function add(storeName, record) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Delete a record by key. */
async function remove(storeName, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/** Clear all records in a store. */
async function clear(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/** Count records in a store. */
async function count(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export default { open, getAll, get, put, putAll, add, remove, clear, count };
