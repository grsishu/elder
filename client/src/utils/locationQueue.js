/**
 * IndexedDB Queue for Offline-First Location Tracking
 * Guarantees samples are stored locally before network delivery and flushed in order.
 */

const DB_NAME = 'smriti_guardian_db';
const STORE_NAME = 'location_samples';
const DB_VERSION = 1;

let dbPromise = null;
let memoryQueue = [];

function getFallbackQueue() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('smriti_loc_queue') || '[]';
      return JSON.parse(raw);
    } catch {
      return memoryQueue;
    }
  }
  return memoryQueue;
}

function setFallbackQueue(queue) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('smriti_loc_queue', JSON.stringify(queue));
    } catch {}
  }
  memoryQueue = queue;
}

function getDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'client_id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function enqueueSample(sample) {
  try {
    const db = await getDb();
    if (!db) {
      // Fallback to storage/memory if IndexedDB is not available
      const queue = getFallbackQueue();
      queue.push(sample);
      setFallbackQueue(queue);
      return sample;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(sample);
      req.onsuccess = () => resolve(sample);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[LocationQueue] Failed to enqueue sample:', err);
    return sample;
  }
}

export async function getPendingSamples() {
  try {
    const db = await getDb();
    if (!db) {
      const queue = getFallbackQueue();
      queue.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
      return queue;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const samples = req.result || [];
        // Sort ascending by captured_at
        samples.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
        resolve(samples);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[LocationQueue] Failed to get pending samples:', err);
    return [];
  }
}

export async function removeSamples(clientIds = []) {
  if (clientIds.length === 0) return;
  try {
    const db = await getDb();
    if (!db) {
      const queue = getFallbackQueue().filter(s => !clientIds.includes(s.client_id));
      setFallbackQueue(queue);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      clientIds.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[LocationQueue] Failed to remove samples:', err);
  }
}

export async function clearQueue() {
  try {
    const db = await getDb();
    if (!db) {
      setFallbackQueue([]);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[LocationQueue] Failed to clear queue:', err);
  }
}

