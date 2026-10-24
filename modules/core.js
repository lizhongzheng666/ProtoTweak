/* ProtoTweak — core utilities
 * 无构建、无框架；所有模块挂在 window.PT 下。
 */
(function () {
  'use strict';

  const PT = window.PT = window.PT || {};
  const listeners = new Map();

  const Core = {
    version: '1.0.0',

    on(type, fn) {
      if (typeof fn !== 'function') return () => {};
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => Core.off(type, fn);
    },

    off(type, fn) {
      const set = listeners.get(type);
      if (set) set.delete(fn);
    },

    emit(type, payload) {
      const set = listeners.get(type);
      if (!set) return;
      Array.from(set).forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error('[ProtoTweak] event handler failed:', type, err);
        }
      });
    },

    $(sel, root) {
      return (root || document).querySelector(sel);
    },

    $$(sel, root) {
      return Array.from((root || document).querySelectorAll(sel));
    },

    uid(prefix) {
      const p = prefix || 'wb';
      try {
        if (window.crypto && window.crypto.randomUUID) {
          return p + '-' + window.crypto.randomUUID().slice(0, 8);
        }
      } catch (e) { /* ignore */ }
      return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    },

    shortId() {
      return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    },

    hashString(str) {
      const s = String(str == null ? '' : str);
      let h = 5381;
      for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
      }
      return (h >>> 0).toString(16) + '-' + s.length.toString(16);
    },

    escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    escapeAttr(value) {
      return Core.escapeHtml(value).replace(/`/g, '&#96;');
    },

    escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    cssEscape(value) {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
      return String(value).replace(/([^\w-])/g, '\\$1');
    },

    debounce(fn, wait) {
      let timer = null;
      let lastArgs = null;
      function debounced() {
        lastArgs = arguments;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          const args = lastArgs;
          lastArgs = null;
          fn.apply(null, args);
        }, wait || 200);
      }
      debounced.cancel = function () {
        if (timer) clearTimeout(timer);
        timer = null;
        lastArgs = null;
      };
      debounced.flush = function () {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
        const args = lastArgs || [];
        lastArgs = null;
        fn.apply(null, args);
      };
      return debounced;
    },

    rafBatch(fn) {
      let pending = false;
      let lastArgs = null;
      return function () {
        lastArgs = arguments;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          const args = lastArgs || [];
          lastArgs = null;
          fn.apply(null, args);
        });
      };
    },

    clamp(n, min, max) {
      return Math.min(max, Math.max(min, n));
    },

    parsePx(value, fallback) {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : (fallback || 0);
    },

    normalizeText(value) {
      return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    },

    nowIso() {
      return new Date().toISOString();
    },

    formatTime(value, withDate) {
      const d = value ? new Date(value) : new Date();
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
      if (!withDate) return time;
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + time;
    },

    formatDateShort(value) {
      const d = value ? new Date(value) : new Date();
      if (Number.isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    download(filename, content, mime) {
      const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = Core.sanitizeFilename(filename);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },

    sanitizeFilename(name) {
      const cleaned = String(name || 'prototype')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned || 'prototype';
    },

    fileNameWithoutExt(name) {
      return String(name || 'prototype').replace(/\.html?$/i, '') || 'prototype';
    },

    readFileAsText(file) {
      return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('没有文件'));
        if (typeof file.text === 'function') {
          file.text().then(resolve, reject);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
        reader.readAsText(file, 'utf-8');
      });
    },

    readFileAsDataURL(file) {
      return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('没有文件'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
        reader.readAsDataURL(file);
      });
    },

    copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(String(text)).catch(() => Core.fallbackCopy(text));
      }
      return Promise.resolve(Core.fallbackCopy(text));
    },

    fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = String(text);
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (e) { /* ignore */ }
      ta.remove();
    },

    toast(message, type, timeout) {
      let root = document.getElementById('toast-container');
      if (!root) {
        root = document.createElement('div');
        root.id = 'toast-container';
        root.className = 'toast-container';
        document.body.appendChild(root);
      }
      const el = document.createElement('div');
      el.className = 'toast toast-' + (type || 'info');
      el.textContent = String(message || '');
      root.appendChild(el);
      requestAnimationFrame(() => el.classList.add('on'));
      setTimeout(() => {
        el.classList.remove('on');
        setTimeout(() => el.remove(), 220);
      }, timeout || 2600);
    },

    isEditableTarget(el) {
      if (!el || el.nodeType !== 1) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      try {
        if (el.isContentEditable) return true;
      } catch (e) { /* ignore */ }
      return false;
    },

    rgbToHex(value) {
      if (!value) return '';
      const v = String(value).trim();
      if (/^#[0-9a-f]{3,8}$/i.test(v)) {
        if (v.length === 4) {
          return '#' + v.slice(1).split('').map((c) => c + c).join('').slice(0, 6).toLowerCase();
        }
        return v.slice(0, 7).toLowerCase();
      }
      const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
      if (!m) return '';
      const toHex = (n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, '0');
      return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
    },

    isMac() {
      return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
    },

    mdCell(value) {
      return String(value == null ? '' : value)
        .replace(/\r?\n/g, '<br>')
        .replace(/\|/g, '\\|')
        .trim();
    },

    mdCode(value) {
      return '`' + String(value == null ? '' : value).replace(/`/g, '\\`') + '`';
    },

    truncate(value, len) {
      const s = String(value == null ? '' : value);
      return s.length > (len || 60) ? s.slice(0, len || 60) + '…' : s;
    },

    isPromise(value) {
      return value && typeof value.then === 'function';
    },

    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  };

  PT.core = Core;

  // Single active pointer operation: move / resize / col-resize / row-resize.
  // Modules check this before starting so table drag, table scale and row/column
  // resizing can never run at the same time.
  const ops = {
    current: null,
    start(name) {
      if (this.current) return false;
      this.current = name || 'operation';
      Core.emit('ops:change', { current: this.current });
      return true;
    },
    end(name) {
      if (!this.current) return;
      if (name && this.current !== name) return;
      this.current = null;
      Core.emit('ops:change', { current: null });
    },
    isBusy() {
      return !!this.current;
    },
    get() {
      return this.current;
    }
  };
  PT.ops = ops;
})();
