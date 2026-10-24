/* ProtoTweak — iframe stage / coordinates / serialization */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let iframe = null;
  let canvas = null;
  let doc = null;
  let body = null;
  let ready = false;
  let loadToken = 0;
  let layoutPending = false;
  let observer = null;
  let resizeObserver = null;
  let scrollTargets = [];
  let originalHtml = '';
  let originalDoctype = '<!doctype html>';
  let loadResolve = null;

  const EDIT_STYLE_ID = '__pt_edit_style';
  const MODE_STYLE_ID = '__pt_mode_style';
  const DRAG_STYLE_ID = '__pt_drag_style';

  const Stage = {
    init(opts) {
      iframe = opts.iframe;
      canvas = opts.canvas;
      iframe.addEventListener('load', () => Stage.onIframeLoad());
    },

    getIframe() { return iframe; },
    getCanvas() { return canvas; },
    getDoc() { return doc; },
    getBody() { return body; },
    isReady() { return ready && !!doc && !!body; },
    getOriginalHtml() { return originalHtml; },
    getDoctype() { return originalDoctype; },

    load(html) {
      return new Promise((resolve, reject) => {
        if (!iframe) return reject(new Error('stage 未初始化'));
        const token = ++loadToken;
        const raw = String(html == null ? '' : html);
        originalHtml = raw;
        originalDoctype = detectDoctype(raw);
        const wrapped = ensureDocument(raw);
        ready = false;
        cleanupObservers();
        iframe.hidden = false;
        loadResolve = { token, resolve, reject };
        try {
          iframe.srcdoc = wrapped;
        } catch (err) {
          loadResolve = null;
          reject(err);
        }
      });
    },

    onIframeLoad() {
      const pending = loadResolve;
      if (!pending) return;
      if (pending.token !== loadToken) return;
      loadResolve = null;
      try {
        const d = iframe.contentDocument;
        if (!d) throw new Error('无法访问 iframe 文档');
        doc = d;
        body = d.body || d.documentElement;
        ready = true;
        setupObservers();
        setupScroll();
        Stage.scheduleLayout();
        emitReady();
        pending.resolve({ doc, body });
      } catch (err) {
        pending.reject(err);
      }
    },

    ensureEditStyle() {
      if (!doc) return;
      let style = doc.getElementById(EDIT_STYLE_ID);
      if (!style) {
        style = doc.createElement('style');
        style.id = EDIT_STYLE_ID;
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = [
        'html { scroll-snap-type: none !important; scroll-behavior: auto !important; }',
        '*, *::before, *::after { pointer-events: auto !important; }',
        'a { cursor: pointer; }',
        '.fade-in, .fade-up, .reveal, .animate-on-scroll,',
        '[class*="fade-in"], [class*="fade-up"] {',
        '  opacity: 1 !important;',
        '  transform: none !important;',
        '  visibility: visible !important;',
        '}'
      ].join('\n');
    },

    removeEditStyle() {
      if (!doc) return;
      const style = doc.getElementById(EDIT_STYLE_ID);
      if (style) style.remove();
    },

    setAnnotationCursor(on) {
      if (!doc) return;
      let style = doc.getElementById(MODE_STYLE_ID);
      if (!on) {
        if (style) style.remove();
        return;
      }
      if (!style) {
        style = doc.createElement('style');
        style.id = MODE_STYLE_ID;
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = 'html, body, body * { cursor: crosshair !important; }';
    },

    setDragStyle(on) {
      Stage.setInteractionStyle(on, 'grabbing');
    },

    setInteractionStyle(on, cursor) {
      if (!doc) return;
      let style = doc.getElementById(DRAG_STYLE_ID);
      if (!on) {
        if (style) style.remove();
        return;
      }
      if (!style) {
        style = doc.createElement('style');
        style.id = DRAG_STYLE_ID;
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = [
        '* { user-select: none !important; -webkit-user-select: none !important; }',
        'html, body { touch-action: none !important; }',
        'html, body, body * { cursor: ' + (cursor || 'grabbing') + ' !important; }'
      ].join('\n');
    },

    scheduleLayout: null,

    toCanvas(rect) {
      if (!rect || !iframe || !canvas) return { left: 0, top: 0, width: 0, height: 0 };
      const ir = iframe.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      const left = ir.left - cr.left - (canvas.clientLeft || 0) + rect.left;
      const top = ir.top - cr.top - (canvas.clientTop || 0) + rect.top;
      return {
        left,
        top,
        width: rect.width,
        height: rect.height,
        right: left + rect.width,
        bottom: top + rect.height
      };
    },

    elementRect(el) {
      if (!el || !el.getBoundingClientRect) return null;
      return el.getBoundingClientRect();
    },

    elementRects(el) {
      if (!el || !el.getClientRects) return [];
      return Array.from(el.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
    },

    docRect(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const win = doc && doc.defaultView;
      const sx = win ? win.scrollX : 0;
      const sy = win ? win.scrollY : 0;
      return { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height };
    },

    viewportSize() {
      if (!iframe) return { width: 0, height: 0 };
      return { width: iframe.clientWidth, height: iframe.clientHeight };
    },

    getScroll() {
      if (!doc || !doc.defaultView) return { x: 0, y: 0 };
      return { x: doc.defaultView.scrollX || 0, y: doc.defaultView.scrollY || 0 };
    },

    setScroll(x, y) {
      if (!doc || !doc.defaultView) return;
      try {
        doc.defaultView.scrollTo(x || 0, y || 0);
      } catch (e) { /* ignore */ }
    },

    scrollTo(el) {
      if (!el || !el.scrollIntoView) return;
      try {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      } catch (e) {
        try { el.scrollIntoView(); } catch (err) { /* ignore */ }
      }
      Stage.scheduleLayout();
    },

    resolve(selector) {
      if (!doc || !selector) return null;
      try { return doc.querySelector(selector); } catch (e) { return null; }
    },

    resolveAll(selector) {
      if (!doc || !selector) return [];
      try { return Array.from(doc.querySelectorAll(selector)); } catch (e) { return []; }
    },

    snapshotBody() {
      if (!body) return '';
      const clone = body.cloneNode(true);
      cleanTransient(clone);
      return clone.innerHTML;
    },

    replaceBody(html, scroll) {
      if (!body) return;
      body.innerHTML = html == null ? '' : html;
      if (scroll) Stage.setScroll(scroll.x, scroll.y);
      setupObserver();
      Stage.scheduleLayout();
      Core.emit('stage:body', { doc, body });
    },

    cleanElementHTML(el) {
      if (!el) return '';
      const clone = el.cloneNode(true);
      cleanForExport(clone, false);
      return clone.outerHTML;
    },

    serialize(opts) {
      const options = opts || {};
      const clone = Stage.cleanClone({ keepAid: !!options.keepAid });
      if (!clone) return '';
      return originalDoctype + '\n' + clone.outerHTML;
    },

    cleanClone(opts) {
      if (!doc || !doc.documentElement) return null;
      const keepAid = !!(opts && opts.keepAid);
      const clone = doc.documentElement.cloneNode(true);
      const junk = clone.querySelectorAll(
        '#' + EDIT_STYLE_ID + ', #' + MODE_STYLE_ID + ', #' + DRAG_STYLE_ID +
        ', #__pt_page_style, #__pt_viewport_style, #__wb_page_style, #__wb_viewport_style, #__wb_edit_style, #__wb_mode_style, #__wb_drag_style,' +
        ' [data-pt-ui], [data-wb-ui], script[data-pt-viewer], script[data-wb-viewer], style[data-pt-viewer], style[data-wb-viewer], #__pt_annotation_data, #__wb_annotation_data'
      );
      junk.forEach((n) => n.remove());
      cleanForExport(clone, keepAid);
      ensureCharset(clone);
      return clone;
    },

    removeAnnotationArtifacts(html) {
      const wrapper = doc ? doc.createElement('div') : document.createElement('div');
      wrapper.innerHTML = html;
      wrapper.querySelectorAll('[data-pt-ui], [data-wb-ui], script[data-pt-viewer], script[data-wb-viewer], style[data-pt-viewer], style[data-wb-viewer], #__pt_annotation_data, #__wb_annotation_data').forEach((n) => n.remove());
      wrapper.querySelectorAll('[data-pt-aid], [data-wb-aid]').forEach((n) => {
        n.removeAttribute('data-pt-aid');
        n.removeAttribute('data-wb-aid');
      });
      return wrapper.innerHTML;
    },

    extractDoctype() { return originalDoctype; }
  };

  Stage.scheduleLayout = Core.rafBatch(() => {
    if (!ready) return;
    Core.emit('layout', { doc, body });
  });

  function detectDoctype(html) {
    const m = String(html || '').match(/<!doctype[^>]*>/i);
    return m ? m[0] : '<!doctype html>';
  }

  function ensureDocument(html) {
    const raw = String(html || '').trim();
    if (!raw) {
      return '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
    }
    if (/<html[\s>]/i.test(raw)) return raw;
    return '<!doctype html><html><head><meta charset="utf-8"></head><body>' + raw + '</body></html>';
  }

  function emitReady() {
    Core.emit('stage:ready', { doc, body });
  }

  function revealAnimated() {
    if (!doc) return;
    const hooks = ['visible', 'in-view', 'is-visible', 'animated', 'show'];
    const nodes = doc.querySelectorAll('.fade-in, .fade-up, .reveal, .animate-on-scroll, [class*="fade-in"], [class*="fade-up"]');
    nodes.forEach((el) => hooks.forEach((c) => {
      try { el.classList.add(c); } catch (e) { /* ignore */ }
    }));
  }

  function setupObserver() {
    if (!body) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      Stage.scheduleLayout();
    });
    observer.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  function cleanupObservers() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    scrollTargets.forEach(({ target, type, fn }) => {
      try { target.removeEventListener(type, fn, true); } catch (e) { /* ignore */ }
    });
    scrollTargets = [];
  }

  function setupObservers() {
    if (!doc) return;
    setupObserver();
    if (window.ResizeObserver) {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(() => Stage.scheduleLayout());
      if (iframe) resizeObserver.observe(iframe);
      if (body) resizeObserver.observe(body);
    }
    doc.addEventListener('load', () => Stage.scheduleLayout(), true);
    if (doc.fonts && doc.fonts.ready) {
      doc.fonts.ready.then(() => Stage.scheduleLayout()).catch(() => {});
    }
  }

  function setupScroll() {
    if (!doc) return;
    const win = doc.defaultView;
    const handler = () => Stage.scheduleLayout();
    if (win) {
      win.addEventListener('scroll', handler, true);
      win.addEventListener('resize', handler, true);
      scrollTargets.push({ target: win, type: 'scroll', fn: handler });
      scrollTargets.push({ target: win, type: 'resize', fn: handler });
    }
    doc.addEventListener('scroll', handler, true);
    scrollTargets.push({ target: doc, type: 'scroll', fn: handler });
  }

  function cleanTransient(root) {
    if (!root) return;
    const selector = '[data-pt-selected], [data-pt-hover], [data-pt-editing], [data-pt-dragging], [data-pt-ce],' +
      ' [data-wb-selected], [data-wb-hover], [data-wb-editing], [data-wb-dragging], [data-wb-ce]';
    root.querySelectorAll(selector).forEach((el) => {
      const wasEditable = el.hasAttribute('data-pt-ce') || el.hasAttribute('data-wb-ce');
      ['data-pt-selected', 'data-pt-hover', 'data-pt-editing', 'data-pt-dragging', 'data-pt-ce',
        'data-wb-selected', 'data-wb-hover', 'data-wb-editing', 'data-wb-dragging', 'data-wb-ce'].forEach((a) => el.removeAttribute(a));
      if (wasEditable) {
        el.removeAttribute('contenteditable');
        el.removeAttribute('spellcheck');
      }
    });
    if (root.nodeType === 1) {
      const wasEditable = root.hasAttribute('data-pt-ce') || root.hasAttribute('data-wb-ce');
      ['data-pt-selected', 'data-pt-hover', 'data-pt-editing', 'data-pt-dragging', 'data-pt-ce',
        'data-wb-selected', 'data-wb-hover', 'data-wb-editing', 'data-wb-dragging', 'data-wb-ce'].forEach((a) => root.removeAttribute(a));
      if (wasEditable) {
        root.removeAttribute('contenteditable');
        root.removeAttribute('spellcheck');
      }
    }
  }

  function cleanForExport(root, keepAid) {
    if (!root) return;
    const all = [root].concat(Array.from(root.querySelectorAll('*')));
    all.forEach((el) => {
      if (el.nodeType !== 1) return;
      const wasEditorEditable = el.hasAttribute('data-pt-ce') || el.hasAttribute('data-wb-ce');
      const legacyAid = el.getAttribute('data-wb-aid');
      if (legacyAid && !el.getAttribute('data-pt-aid')) el.setAttribute('data-pt-aid', legacyAid);
      Array.from(el.attributes || []).forEach((attr) => {
        const name = attr.name;
        if (name === 'data-pt-aid' || name === 'data-wb-aid') {
          if (!keepAid) el.removeAttribute(name);
          else if (name === 'data-wb-aid') el.removeAttribute(name);
          return;
        }
        if (name.indexOf('data-pt-') === 0 || name.indexOf('data-wb-') === 0) {
          el.removeAttribute(name);
        }
      });
      if (wasEditorEditable) {
        el.removeAttribute('contenteditable');
        el.removeAttribute('spellcheck');
      }
      el.removeAttribute('data-pt-selected');
      el.removeAttribute('data-pt-hover');
      el.removeAttribute('data-pt-editing');
      el.removeAttribute('data-pt-dragging');
      el.removeAttribute('data-wb-selected');
      el.removeAttribute('data-wb-hover');
      el.removeAttribute('data-wb-editing');
      el.removeAttribute('data-wb-dragging');
      if (el.classList) {
        el.classList.remove('pt-annotate', 'pt-edit-mode', '__wb-annotate', '__wb-edit-mode');
        if (!el.getAttribute('class')) el.removeAttribute('class');
      }
    });
  }

  function ensureCharset(root) {
    if (!root) return;
    const head = root.querySelector('head');
    if (!head) return;
    const has = head.querySelector('meta[charset], meta[http-equiv="Content-Type" i]');
    if (!has) {
      const meta = root.ownerDocument.createElement('meta');
      meta.setAttribute('charset', 'utf-8');
      head.insertBefore(meta, head.firstChild);
    }
  }

  PT.stage = Stage;
})();
