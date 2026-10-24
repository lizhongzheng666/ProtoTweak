/* ProtoTweak — storage: localStorage annotations + IndexedDB sessions/versions */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  // Keep the IndexedDB database name stable: it is an internal storage
  // identifier, and renaming it would silently orphan existing sessions.
  const DB_NAME = 'wb-workbench';
  const DB_VERSION = 1;
  const ANNOTATION_PREFIX = 'prototweak_annotations_v1:';
  const LAST_DOC_KEY = 'prototweak_lastDocId';
  const PREFS_KEY = 'prototweak_annotation_prefs_v1';
  const FALLBACK_SESSION_KEY = 'prototweak_session_fallback_v1';
  const FALLBACK_VERSIONS_PREFIX = 'prototweak_versions_fallback_v1:';
  const MAX_VERSIONS = 30;
  const LEGACY_ANNOTATION_PREFIX = 'wb.annotations.v1:';
  const LEGACY_KEYS = {
    'wb.lastDocId': LAST_DOC_KEY,
    'wb.annotation.prefs.v1': PREFS_KEY,
    'wb.session.fallback.v1': FALLBACK_SESSION_KEY
  };
  const LEGACY_VERSIONS_PREFIX = 'wb.versions.fallback.v1:';

  let dbPromise = null;
  let idbBroken = false;
  let localStorageOk = true;
  const warnings = new Set();

  function warnOnce(key, message) {
    if (warnings.has(key)) return;
    warnings.add(key);
    try { Core.emit('storage:warning', { key, message }); } catch (e) { /* ignore */ }
    console.warn('[ProtoTweak storage]', message);
  }

  function lsGet(key) {
    if (!localStorageOk) return null;
    try { return window.localStorage.getItem(key); } catch (e) {
      localStorageOk = false;
      warnOnce('ls', '浏览器禁止了 localStorage，批注将只保留在当前会话中，请及时导出 JSON。');
      return null;
    }
  }

  function lsSet(key, value) {
    if (!localStorageOk) return false;
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      warnOnce('ls-write', 'localStorage 写入失败（可能是空间不足），请及时导出批注 JSON。');
      return false;
    }
  }

  function lsRemove(key) {
    if (!localStorageOk) return;
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (idbBroken || !window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      let req;
      try {
        req = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        idbBroken = true;
        return reject(e);
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'docId' });
        }
        if (!db.objectStoreNames.contains('versions')) {
          const store = db.createObjectStore('versions', { keyPath: 'id' });
          store.createIndex('docId', 'docId', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        idbBroken = true;
        reject(req.error || new Error('IndexedDB open failed'));
      };
      req.onblocked = () => {
        warnOnce('idb-blocked', 'IndexedDB 被其他标签页占用，草稿和版本快照可能无法保存。');
      };
    }).catch((err) => {
      idbBroken = true;
      warnOnce('idb', 'IndexedDB 不可用，草稿与版本快照将降级到 localStorage。');
      throw err;
    });
    return dbPromise;
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function reqResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
    });
  }

  async function idbPut(storeName, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    await txDone(tx);
    return value;
  }

  async function idbGet(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const result = await reqResult(tx.objectStore(storeName).get(key));
    await txDone(tx);
    return result || null;
  }

  async function idbDelete(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    await txDone(tx);
  }

  async function idbAll(storeName) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const result = await reqResult(tx.objectStore(storeName).getAll());
    await txDone(tx);
    return result || [];
  }

  function migrateLegacyLocalStorage() {
    try {
      Object.keys(LEGACY_KEYS).forEach((oldKey) => {
        if (lsGet(LEGACY_KEYS[oldKey]) == null) {
          const value = lsGet(oldKey);
          if (value != null) lsSet(LEGACY_KEYS[oldKey], value);
        }
      });
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) keys.push(window.localStorage.key(i));
      keys.forEach((key) => {
        if (!key) return;
        let next = '';
        if (key.indexOf(LEGACY_ANNOTATION_PREFIX) === 0) {
          next = ANNOTATION_PREFIX + key.slice(LEGACY_ANNOTATION_PREFIX.length);
        } else if (key.indexOf(LEGACY_VERSIONS_PREFIX) === 0) {
          next = FALLBACK_VERSIONS_PREFIX + key.slice(LEGACY_VERSIONS_PREFIX.length);
        }
        if (next && lsGet(next) == null) {
          const value = lsGet(key);
          if (value != null) lsSet(next, value);
        }
      });
    } catch (e) { /* storage may be unavailable */ }
  }

  const Storage = {
    init() {
      migrateLegacyLocalStorage();
      // Touch localStorage once so a denied file:// origin is detected early.
      lsGet(PREFS_KEY);
    },

    getStatus() {
      return { localStorageOk, idbBroken };
    },

    annotationKey(docId) {
      return ANNOTATION_PREFIX + String(docId || 'untitled');
    },

    loadAnnotations(docId) {
      if (!docId) return null;
      let raw = lsGet(Storage.annotationKey(docId));
      if (!raw) {
        raw = lsGet(LEGACY_ANNOTATION_PREFIX + String(docId || 'untitled'));
        if (raw) lsSet(Storage.annotationKey(docId), raw);
      }
      if (!raw) return null;
      try {
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.annotations)) return null;
        return data;
      } catch (e) {
        warnOnce('ann-parse', '批注缓存解析失败，已忽略。');
        return null;
      }
    },

    saveAnnotations(docId, data) {
      if (!docId) return false;
      try {
        return lsSet(Storage.annotationKey(docId), JSON.stringify(data));
      } catch (e) {
        warnOnce('ann-save', '批注保存失败，请导出 JSON。');
        return false;
      }
    },

    loadPrefs() {
      let raw = lsGet(PREFS_KEY);
      if (!raw) {
        raw = lsGet('wb.annotation.prefs.v1');
        if (raw) lsSet(PREFS_KEY, raw);
      }
      if (!raw) return { showInPreview: false };
      try {
        const data = JSON.parse(raw);
        return { showInPreview: !!data.showInPreview };
      } catch (e) {
        return { showInPreview: false };
      }
    },

    savePrefs(prefs) {
      try {
        lsSet(PREFS_KEY, JSON.stringify(prefs || {}));
      } catch (e) { /* ignore */ }
    },

    async saveSession(session) {
      if (!session || !session.docId) return false;
      lsSet(LAST_DOC_KEY, session.docId);
      // Keep a synchronous localStorage copy for immediate refresh/reload safety.
      let syncOk = false;
      try {
        syncOk = lsSet(FALLBACK_SESSION_KEY, JSON.stringify(session));
      } catch (e) { /* ignore quota */ }
      try {
        await idbPut('sessions', session);
        return true;
      } catch (e) {
        warnOnce('session-idb', 'IndexedDB 不可用，会话草稿已保存在 localStorage（可能受容量限制）。');
        return syncOk;
      }
    },

    async loadSession(docId) {
      if (!docId) return null;
      try {
        const row = await idbGet('sessions', docId);
        if (row) return row;
      } catch (e) { /* fall through */ }
      const raw = lsGet(FALLBACK_SESSION_KEY);
      if (!raw) {
        const legacy = lsGet('wb.session.fallback.v1');
        if (legacy) {
          lsSet(FALLBACK_SESSION_KEY, legacy);
          try {
            const data = JSON.parse(legacy);
            return data && data.docId === docId ? data : null;
          } catch (e) { return null; }
        }
        return null;
      }
      try {
        const data = JSON.parse(raw);
        return data && data.docId === docId ? data : null;
      } catch (e) {
        return null;
      }
    },

    async loadLastSession() {
      let docId = lsGet(LAST_DOC_KEY);
      if (!docId) {
        docId = lsGet('wb.lastDocId');
        if (docId) lsSet(LAST_DOC_KEY, docId);
      }
      if (!docId) return null;
      return Storage.loadSession(docId);
    },

    async clearLastSession() {
      lsRemove(LAST_DOC_KEY);
      lsRemove(FALLBACK_SESSION_KEY);
    },

    async saveVersion(version) {
      if (!version || !version.docId) return false;
      const row = {
        id: version.id || Core.uid('ver'),
        docId: version.docId,
        fileName: version.fileName || 'prototype',
        label: version.label || '快照',
        kind: version.kind || 'auto',
        createdAt: version.createdAt || Core.nowIso(),
        html: version.html || '',
        annotations: version.annotations || { annotations: [], nextSeq: 1 },
        annotationCount: version.annotationCount || 0,
        size: version.size || (version.html ? version.html.length : 0)
      };
      try {
        await idbPut('versions', row);
        await Storage.pruneVersions(row.docId);
        return row;
      } catch (e) {
        const key = FALLBACK_VERSIONS_PREFIX + row.docId;
        const list = Storage.loadFallbackVersions(row.docId);
        list.unshift(row);
        while (list.length > 3) list.pop();
        try {
          lsSet(key, JSON.stringify(list));
          return row;
        } catch (err) {
          warnOnce('version-save', '版本快照保存失败。建议使用“保存基线”下载文件。');
          return null;
        }
      }
    },

    loadFallbackVersions(docId) {
      let raw = lsGet(FALLBACK_VERSIONS_PREFIX + docId);
      if (!raw) {
        raw = lsGet(LEGACY_VERSIONS_PREFIX + docId);
        if (raw) lsSet(FALLBACK_VERSIONS_PREFIX + docId, raw);
      }
      if (!raw) return [];
      try {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    },

    async listVersions(docId) {
      if (!docId) return [];
      try {
        const all = await idbAll('versions');
        return all.filter((v) => v.docId === docId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      } catch (e) {
        return Storage.loadFallbackVersions(docId);
      }
    },

    async getVersion(id) {
      if (!id) return null;
      try {
        return await idbGet('versions', id);
      } catch (e) {
        const keys = [];
        try {
          for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        } catch (err) { return null; }
        for (const key of keys) {
          if (!key || key.indexOf(FALLBACK_VERSIONS_PREFIX) !== 0) continue;
          const list = Storage.loadFallbackVersions(key.slice(FALLBACK_VERSIONS_PREFIX.length));
          const found = list.find((v) => v.id === id);
          if (found) return found;
        }
        return null;
      }
    },

    async deleteVersion(id) {
      if (!id) return;
      try {
        await idbDelete('versions', id);
        return;
      } catch (e) { /* fallback */ }
      const keys = [];
      try {
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      } catch (err) { return; }
      keys.forEach((key) => {
        if (!key || key.indexOf(FALLBACK_VERSIONS_PREFIX) !== 0) return;
        const docId = key.slice(FALLBACK_VERSIONS_PREFIX.length);
        const list = Storage.loadFallbackVersions(docId).filter((v) => v.id !== id);
        lsSet(key, JSON.stringify(list));
      });
    },

    async pruneVersions(docId) {
      try {
        const list = await Storage.listVersions(docId);
        if (list.length > MAX_VERSIONS) {
          const remove = list.slice(MAX_VERSIONS);
          for (const v of remove) {
            try { await idbDelete('versions', v.id); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) { /* ignore */ }
    },

    async deleteSession(docId) {
      if (!docId) return;
      try { await idbDelete('sessions', docId); } catch (e) { /* ignore */ }
      const raw = lsGet(FALLBACK_SESSION_KEY);
      if (raw) {
        try {
          const data = JSON.parse(raw);
          if (data && data.docId === docId) lsRemove(FALLBACK_SESSION_KEY);
        } catch (e) { /* ignore */ }
      }
      const last = lsGet(LAST_DOC_KEY);
      if (last === docId) lsRemove(LAST_DOC_KEY);
    }
  };

  PT.storage = Storage;
})();
