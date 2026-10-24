/* ProtoTweak — single-file multi-page switcher */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const VIEWPORT_STYLE_ID = '__pt_viewport_style';
  const AUTO_SELECTORS = ['.page', '[data-page]', '[id^="page-"]', '[data-screen]', '.screen'];
  const INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'OPTION']);
  const PAGE_TAGS = new Set(['DIV', 'SECTION', 'MAIN', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'FORM', 'NAV', 'FIGURE']);

  let doc = null;
  let pages = [];
  let active = null;
  let activeKey = '';
  let lastActiveIndex = 0;
  let manualSelectors = [];
  let pageStates = new Map();
  let boundDocs = new WeakSet();
  let switcher = null;
  let selectEl = null;
  let addBtn = null;
  let rescanBtn = null;
  let switching = false;
  let syncPending = false;

  function init() {
    switcher = document.getElementById('page-switcher');
    selectEl = document.getElementById('page-select');
    addBtn = document.getElementById('page-add');
    rescanBtn = document.getElementById('page-rescan');

    if (selectEl) {
      selectEl.addEventListener('change', () => {
        const page = pages.find((p) => p.key === selectEl.value);
        if (page) showPage(page);
      });
    }
    if (rescanBtn) rescanBtn.addEventListener('click', () => scan({ preserve: true }));
    if (addBtn) addBtn.addEventListener('click', addManualPage);

    Core.on('stage:ready', ({ doc: d }) => bindDoc(d));
    Core.on('stage:body', () => {
      if (PT.app && PT.app.isLoaded()) scan({ preserve: true });
    });
    Core.on('history:restore', () => scan({ preserve: true }));
    Core.on('mode:change', updateUI);
    Core.on('annotations:focus', focusAnnotationPage);
    Core.on('layout', scheduleSync);

    if (PT.stage && PT.stage.isReady()) bindDoc(PT.stage.getDoc());
    updateUI();
  }

  function bindDoc(d) {
    if (!d || boundDocs.has(d)) return;
    boundDocs.add(d);
    doc = d;
    const win = d.defaultView;
    if (win) {
      win.addEventListener('click', onCaptureClick, true);
      win.addEventListener('hashchange', scheduleSync, true);
      win.addEventListener('popstate', scheduleSync, true);
    }
    ensureViewportStyle();
  }

  function ensureViewportStyle() {
    if (!doc) return;
    let style = doc.getElementById(VIEWPORT_STYLE_ID);
    if (!style) {
      style = doc.createElement('style');
      style.id = VIEWPORT_STYLE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    // Keep the vertical scrollbar gutter stable while switching between pages
    // of different heights. Without this, centered content shifts left/right
    // when the scrollbar appears or disappears.
    style.textContent = 'html { scrollbar-gutter: stable !important; }';
  }

  function removeViewportStyle() {
    if (!doc) return;
    const style = doc.getElementById(VIEWPORT_STYLE_ID);
    if (style) style.remove();
  }

  function mode() {
    return PT.app ? PT.app.getMode() : 'edit';
  }

  function loaded() {
    return !!(PT.app && PT.app.isLoaded());
  }

  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/^#/, '')
      .replace(/^page[-_:\s]*/i, '')
      .replace(/^\./, '')
      .trim()
      .toLowerCase();
  }

  function pageLabel(el, index) {
    const attr = el.getAttribute('data-title') || el.getAttribute('data-label') || el.getAttribute('aria-label');
    if (attr && attr.trim()) return attr.trim();
    const heading = el.querySelector('h1, h2, h3, [data-title]');
    if (heading && heading.textContent.trim()) return heading.textContent.trim().slice(0, 32);
    if (el.id) return el.id.replace(/^page[-_]?/i, '') || el.id;
    const p = el.getAttribute('data-page') || el.getAttribute('data-screen');
    if (p) return p;
    return '页面 ' + (index + 1);
  }

  function pageKey(el, index, used) {
    let base = '';
    if (el.id) base = 'id:' + el.id;
    else if (el.getAttribute('data-page')) base = 'data:' + el.getAttribute('data-page');
    else if (el.getAttribute('data-screen')) base = 'data:' + el.getAttribute('data-screen');
    else if (PT.anchors) base = 'sel:' + PT.anchors.generateSelector(el);
    if (!base) base = 'page:' + index;
    let key = base;
    let n = 2;
    while (used.has(key)) key = base + ':' + n++;
    used.add(key);
    return key;
  }

  function isLikelyPage(el, allowAny) {
    if (!el || el.nodeType !== 1) return false;
    if (el === doc.body || el === doc.documentElement) return false;
    if (el.closest('[data-pt-ui]')) return false;
    const tag = el.tagName;
    if (INTERACTIVE_TAGS.has(tag) && !el.classList.contains('page')) return false;
    if (allowAny) return true;
    const convention = el.classList.contains('page') ||
      el.classList.contains('screen') ||
      el.hasAttribute('data-page') ||
      el.hasAttribute('data-screen') ||
      /^page[-_]/i.test(el.id || '');
    if (!convention) return false;
    return PAGE_TAGS.has(tag) || /page|screen|view/i.test((el.className || '') + ' ' + (el.id || ''));
  }

  function collectPages() {
    const selectors = AUTO_SELECTORS.concat(manualSelectors);
    const found = [];
    const seen = new Set();
    const manualSet = new Set(manualSelectors);
    selectors.forEach((selector) => {
      if (!selector) return;
      let nodes = [];
      try { nodes = Array.from(doc.querySelectorAll(selector)); } catch (e) { return; }
      const allowAny = manualSet.has(selector);
      nodes.forEach((el) => {
        if (!isLikelyPage(el, allowAny) || seen.has(el)) return;
        seen.add(el);
        found.push(el);
      });
    });
    found.sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & 4 ? -1 : 1;
    });
    return found.filter((el) => !found.some((other) => other !== el && other.contains(el)));
  }

  function pageIsVisible(el) {
    if (!el || !el.isConnected) return false;
    try {
      const cs = doc.defaultView.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    } catch (e) {
      return false;
    }
  }

  function findStateClass() {
    const preferred = ['active', 'is-active', 'current', 'is-current', 'show', 'visible', 'is-visible', 'on', 'open'];
    const visible = pages.filter((p) => pageIsVisible(p.el));
    for (let i = 0; i < preferred.length; i++) {
      const cls = preferred[i];
      if (visible.some((p) => p.el.classList.contains(cls))) return cls;
    }
    return '';
  }

  function activateByClass(page, cls) {
    if (!page || !cls) return false;
    const snapshot = pages.map((p) => ({ el: p.el, had: p.el.classList.contains(cls) }));
    pages.forEach((p) => p.el.classList.remove(cls));
    page.el.classList.add(cls);
    if (pageIsVisible(page.el)) return true;
    snapshot.forEach((s) => {
      if (s.had) s.el.classList.add(cls);
      else s.el.classList.remove(cls);
    });
    return false;
  }

  function findVisiblePage() {
    const visible = pages.filter((p) => pageIsVisible(p.el));
    if (!visible.length) return null;
    return visible.find((p) => /(^|\s)(active|current|show|is-active|on)(\s|$)/i.test(p.el.className || '')) || visible[0];
  }

  function scan(opts) {
    const options = opts || {};
    if (!PT.stage || !PT.stage.isReady()) return;
    doc = PT.stage.getDoc();
    if (!doc) return;
    ensureViewportStyle();
    if (options.reset) {
      removeViewportStyle();
      ensureViewportStyle();
      manualSelectors = [];
      pageStates.clear();
      activeKey = '';
      lastActiveIndex = 0;
    }
    const found = collectPages();
    const used = new Set();
    pages = found.map((el, index) => ({
      el,
      key: pageKey(el, index, used),
      index,
      id: el.id || '',
      dataPage: el.getAttribute('data-page') || '',
      dataScreen: el.getAttribute('data-screen') || '',
      label: pageLabel(el, index),
      selector: PT.anchors ? PT.anchors.generateSelector(el) : ''
    }));

    let next = activeKey ? pages.find((p) => p.key === activeKey) : null;
    if (!next && lastActiveIndex < pages.length && pageIsVisible(pages[lastActiveIndex].el)) {
      next = pages[lastActiveIndex];
    }
    if (!next) next = findVisiblePage();
    if (!next) next = pages[0] || null;

    active = next;
    activeKey = active ? active.key : '';
    lastActiveIndex = active ? active.index : 0;
    updateUI();
    Core.emit('pages:change', {
      active: active ? publicPage(active) : null,
      pages: pages.map(publicPage)
    });
  }

  function publicPage(p) {
    return { key: p.key, label: p.label, index: p.index, id: p.id, dataPage: p.dataPage, dataScreen: p.dataScreen };
  }

  function resolvePage(value) {
    if (!value) return null;
    if (value.el && value.key) return value.el.isConnected ? value : null;
    const key = typeof value === 'string' ? value : value.key;
    if (!key) return null;
    return pages.find((p) => p.key === key) || findPage(key);
  }

  function pageForElement(el) {
    if (!el) return null;
    return pages.find((p) => p.el === el || p.el.contains(el)) || null;
  }

  function syncSelectValue() {
    if (selectEl && active && selectEl.value !== active.key) selectEl.value = active.key;
  }

  function savePageState(page) {
    if (!page) return;
    let selection = null;
    try { selection = PT.history ? PT.history.getSelection() : null; } catch (e) { selection = null; }
    pageStates.set(page.key, {
      selection,
      scroll: PT.stage ? PT.stage.getScroll() : { x: 0, y: 0 }
    });
  }

  function restorePageState(page) {
    const st = pageStates.get(page.key);
    if (!st) {
      if (PT.selection) PT.selection.clear({ silent: true });
      if (PT.stage) PT.stage.setScroll(0, 0);
      return;
    }
    // Page switching should never inherit a horizontal scroll offset from the
    // previous page. A stale scrollLeft is what makes centered content look
    // shifted left/right when entering a page from the top selector.
    if (PT.stage) PT.stage.setScroll(0, st.scroll ? st.scroll.y : 0);
    const ref = st.selection;
    let el = null;
    if (ref && ref.aid && PT.anchors) el = PT.anchors.queryByAid(ref.aid);
    if (!el && ref && ref.selector) el = PT.stage.resolve(ref.selector);
    if (el && (page.el === el || page.el.contains(el)) && PT.selection) {
      PT.selection.select(el, { silent: true });
    } else if (PT.selection) {
      PT.selection.clear({ silent: true });
    }
  }

  function commitEditing() {
    if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
    if (PT.drag) PT.drag.cancel();
    if (PT.resize) PT.resize.cancel();
    if (PT.table && PT.table.cancelSize) PT.table.cancelSize();
    if (PT.ops) PT.ops.end();
    if (PT.inspector) PT.inspector.commitActive();
  }

  function isInteractive(el) {
    if (!el) return false;
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'link' || role === 'tab') return true;
    if (el.hasAttribute('data-go') || el.hasAttribute('data-href') || el.hasAttribute('onclick')) return true;
    if (el.hasAttribute('data-page') || el.hasAttribute('data-screen')) {
      return !pages.some((p) => p.el === el);
    }
    return false;
  }

  function navTarget(trigger) {
    if (!trigger || !isInteractive(trigger)) return '';
    const attrs = ['data-go', 'data-href', 'data-screen', 'data-page'];
    for (let i = 0; i < attrs.length; i++) {
      const value = trigger.getAttribute(attrs[i]);
      if (value) return value;
    }
    const href = trigger.getAttribute('href') || '';
    if (href.charAt(0) === '#') return href;
    const onclick = trigger.getAttribute('onclick') || '';
    if (onclick) {
      const hits = pages.filter((p) => {
        const tokens = [p.id, p.dataPage, p.dataScreen, p.key, p.label]
          .concat(p.id ? [p.id.replace(/[-_]/g, ''), 'page-' + (p.index + 1), 'page' + (p.index + 1)] : [])
          .filter((t) => t && String(t).length >= 2)
          .map((t) => String(t).toLowerCase());
        return tokens.some((t) => onclick.toLowerCase().indexOf(t) !== -1);
      });
      if (hits.length === 1) return hits[0].key;
    }
    return '';
  }

  function findPage(raw) {
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value || /^(https?:|mailto:|tel:|javascript:)/i.test(value)) return null;
    const n = normalize(value);
    if (/^[#.[]/.test(value) && doc) {
      try {
        const el = doc.querySelector(value);
        const bySelector = pages.find((p) => p.el === el);
        if (bySelector) return bySelector;
      } catch (e) { /* ignore */ }
    }
    return pages.find((p) => {
      if (p.key === value || p.id === value || p.dataPage === value || p.dataScreen === value) return true;
      return n && [p.id, p.dataPage, p.dataScreen, p.label, p.key].some((v) => normalize(v) === n);
    }) || null;
  }

  function findTrigger(page) {
    if (!page || !doc) return null;
    const nodes = Array.from(doc.querySelectorAll('a[href], button, [role="button"], [role="link"], [data-go], [data-href], [data-screen], [data-page]'));
    const hits = [];
    nodes.forEach((node) => {
      if (!isInteractive(node)) return;
      if (node.disabled || node.getAttribute('aria-disabled') === 'true') return;
      const raw = navTarget(node);
      if (!raw) return;
      if (findPage(raw) === page) hits.push(node);
    });
    if (!hits.length) return null;
    return hits.find((node) => pageIsVisible(node)) || hits[0];
  }

  function isHashLink(trigger) {
    return trigger && trigger.tagName === 'A' && (trigger.getAttribute('href') || '').charAt(0) === '#';
  }

  function routeHash(hash) {
    if (!doc || !doc.defaultView || !hash || hash.charAt(0) !== '#') return false;
    const win = doc.defaultView;
    const before = win.location.href;
    const changed = win.location.hash !== hash;
    try {
      win.location.hash = hash;
    } catch (e) {
      return false;
    }
    // Anchor/hash navigation can scroll horizontally to the target page.
    // Keep the page's horizontal origin at 0; vertical scroll is restored by
    // the page state after the route settles.
    try { win.scrollTo(0, win.scrollY); } catch (e) { /* ignore */ }
    try {
      win.requestAnimationFrame(() => {
        try { win.scrollTo(0, win.scrollY); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
    // Setting the hash in a srcdoc document does not reload it. If the hash
    // was already set but the page state is stale, emit hashchange manually.
    if (!changed) {
      const after = win.location.href;
      try {
        win.dispatchEvent(new win.HashChangeEvent('hashchange', { oldURL: before, newURL: after }));
      } catch (e) {
        try { win.dispatchEvent(new win.Event('hashchange')); } catch (err) { /* ignore */ }
      }
    }
    scheduleSync();
    return true;
  }

  function onCaptureClick(e) {
    if (!loaded() || !doc) return;
    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    let trigger = target.closest('a[href], button, [role="button"], [role="link"], [data-go], [data-href]');
    if (!trigger) trigger = target.closest('[data-screen], [data-page]');
    if (!trigger || !isInteractive(trigger)) return;

    // Hash routers are common in single-file prototypes. Do not let the
    // srcdoc iframe follow the hash as a navigation (which can reload the
    // document); update history and emit hashchange instead.
    if (isHashLink(trigger)) {
      const href = trigger.getAttribute('href') || '';
      if (findPage(href)) {
        if (mode() !== 'preview') commitEditing();
        e.preventDefault();
        routeHash(href);
        return;
      }
    }

    if (switching) {
      if (trigger.tagName === 'A') e.preventDefault();
      return;
    }
    if (mode() !== 'preview') {
      const raw = navTarget(trigger);
      if (isHashLink(trigger) && !findPage(trigger.getAttribute('href') || '')) {
        commitEditing();
        return;
      }
      if (raw || trigger.tagName === 'A') {
        // Commit editor state before the prototype's own navigation handler
        // changes the visible page. Do not stop propagation: the page's JS
        // interaction must still run in edit mode.
        commitEditing();
        e.preventDefault();
      }
    }
  }

  function showPage(page, opts) {
    page = resolvePage(page);
    if (!page || !page.el || !page.el.isConnected) return;
    if (page === active && !(opts && opts.force)) {
      updateUI();
      return;
    }
    commitEditing();
    const previous = active;
    if (previous) savePageState(previous);
    if (PT.annotationUI) PT.annotationUI.closeCard({ removeIfEmpty: false });
    if (PT.selection) PT.selection.clear({ silent: true });

    let activated = false;
    const trigger = findTrigger(page);
    if (trigger) {
      switching = true;
      try {
        trigger.click();
      } catch (e) { /* ignore */ }
      switching = false;
      if (isHashLink(trigger)) {
        const href = trigger.getAttribute('href') || '';
        if (doc.defaultView && doc.defaultView.location.hash !== href) routeHash(href);
      }
      activated = pageIsVisible(page.el);
      // A trigger exists: trust the prototype's navigation. Do not force
      // display here; hash routers and async handlers may settle on the next
      // frame, and a CSS override would deform the page and break its state.
    } else {
      const stateClass = findStateClass();
      if (stateClass && activateByClass(page, stateClass)) {
        activated = pageIsVisible(page.el);
      } else {
        // Never force a page's display from the editor: that is what causes
        // flex/grid pages to deform. If the prototype has no trigger and no
        // detectable active class, leave the current page untouched.
        if (previous && mode() !== 'preview') restorePageState(previous);
        updateUI();
        Core.toast('该页面没有可用的原型跳转触发器，请使用页面内导航进入', 'info', 3200);
        return;
      }
    }

    if (!activated) {
      // Let the prototype/router finish. syncFromDom() will activate and
      // restore the page when it becomes visible. The previous page is still
      // visible, so restore its editor state in the meantime.
      if (previous && mode() !== 'preview') restorePageState(previous);
      if (PT.stage) PT.stage.scheduleLayout();
      return;
    }

    active = page;
    activeKey = page.key;
    lastActiveIndex = page.index;
    updateUI();
    if (PT.stage) PT.stage.scheduleLayout();
    if (PT.annotations) PT.annotations.refreshAnchors('page');
    if (mode() !== 'preview') restorePageState(page);
    else if (PT.selection) PT.selection.clear({ silent: true });
    if (PT.annotationUI) {
      PT.annotationUI.renderPins();
      PT.annotationUI.renderList();
    }
    if (PT.table) PT.table.updateUI();
    if (PT.resize) PT.resize.refresh();
    if (PT.inspector) PT.inspector.sync();
    Core.emit('pages:switch', { active: publicPage(page), previous: previous ? publicPage(previous) : null });
    Core.emit('pages:change', { active: publicPage(page), pages: pages.map(publicPage) });
  }

  function scheduleSync() {
    if (syncPending || switching) return;
    syncPending = true;
    requestAnimationFrame(() => {
      syncPending = false;
      syncFromDom();
    });
  }

  function syncFromDom() {
    if (!doc || !pages.length || switching) return;
    const visible = findVisiblePage();
    if (!visible || visible === active) {
      syncSelectValue();
      return;
    }
    const previous = active;
    if (previous) savePageState(previous);
    active = visible;
    activeKey = visible.key;
    lastActiveIndex = visible.index;
    if (PT.selection) {
      const selected = PT.selection.getSelected();
      if (selected && !(visible.el === selected || visible.el.contains(selected))) {
        PT.selection.clear({ silent: true });
      }
    }
    if (PT.annotationUI) PT.annotationUI.closeCard({ removeIfEmpty: false });
    if (PT.annotations) PT.annotations.refreshAnchors('page');
    if (mode() !== 'preview') restorePageState(visible);
    else if (PT.selection) PT.selection.clear({ silent: true });
    if (PT.annotationUI) {
      PT.annotationUI.renderPins();
      PT.annotationUI.renderList();
    }
    if (PT.table) PT.table.updateUI();
    if (PT.resize) PT.resize.refresh();
    if (PT.inspector) PT.inspector.sync();
    updateUI();
    Core.emit('pages:switch', { active: publicPage(visible), previous: previous ? publicPage(previous) : null });
    Core.emit('pages:change', { active: publicPage(visible), pages: pages.map(publicPage) });
  }

  function focusAnnotationPage(e) {
    if (!e || !e.id) return;
    const ann = PT.annotations ? PT.annotations.get(e.id) : null;
    const el = ann && ann._el;
    const page = pageForElement(el);
    if (!page || page === active) return;
    showPage(page);
    if (el && el.isConnected && PT.selection) PT.selection.select(el, { silent: true });
  }

  function addManualPage() {
    if (!doc || !loaded()) return;
    const value = window.prompt('输入页面容器的 CSS 选择器（例如 .screen、[data-view]）', '');
    if (!value) return;
    const selector = value.trim();
    let nodes = [];
    try { nodes = Array.from(doc.querySelectorAll(selector)); } catch (e) {
      Core.toast('选择器格式不正确', 'error');
      return;
    }
    if (!nodes.length) {
      Core.toast('没有找到匹配的页面容器', 'info');
      return;
    }
    if (manualSelectors.indexOf(selector) === -1) manualSelectors.push(selector);
    scan({ preserve: true });
    if (!pages.length) Core.toast('匹配元素不像页面容器，请换一个选择器', 'info');
    else Core.toast('已添加页面选择器：' + selector, 'success', 2200);
  }

  function updateUI() {
    if (!switcher) return;
    const on = loaded();
    switcher.hidden = !on;
    if (!on) return;
    switcher.classList.toggle('no-pages', !pages.length);
    if (!selectEl) return;
    const previous = selectEl.value;
    selectEl.innerHTML = '';
    if (!pages.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '未识别页面';
      selectEl.appendChild(opt);
      selectEl.disabled = true;
    } else {
      selectEl.disabled = false;
      pages.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.key;
        opt.textContent = p.label;
        selectEl.appendChild(opt);
      });
      const target = active && pages.some((p) => p.key === active.key)
        ? active.key
        : (pages.some((p) => p.key === previous) ? previous : pages[0].key);
      selectEl.value = target;
    }
    if (addBtn) addBtn.disabled = false;
    if (rescanBtn) rescanBtn.disabled = false;
  }

  function clear() {
    removeViewportStyle();
    doc = null;
    pages = [];
    active = null;
    activeKey = '';
    lastActiveIndex = 0;
    manualSelectors = [];
    pageStates.clear();
    switching = false;
    if (switcher) switcher.hidden = true;
  }

  function getActive() {
    return active ? publicPage(active) : null;
  }

  PT.pages = {
    init,
    scan,
    clear,
    showPage,
    show: (key) => showPage(key),
    getActive,
    getPages: () => pages.map(publicPage),
    refresh: () => scan({ preserve: true }),
    isSwitching: () => switching,
    addSelector: (selector) => {
      if (selector && manualSelectors.indexOf(selector) === -1) manualSelectors.push(selector);
      scan({ preserve: true });
    }
  };
})();
