/* ProtoTweak — multi-file tab manager */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;
  const SESSION_KEY = 'prototweak_tabs_v1';
  const MAX_TABS = 24;

  let tabs = [];
  let activeId = null;
  let switching = false;
  let persistTimer = null;
  let pasteSeq = 0;

  function init() {
    const add = document.getElementById('file-tab-add');
    if (add) add.addEventListener('click', () => toggleAddMenu(add));
    const fileItem = document.getElementById('tab-add-file');
    const pasteItem = document.getElementById('tab-add-paste');
    if (fileItem) fileItem.addEventListener('click', () => {
      closeAddMenu();
      if (PT.app) PT.app.pickFile();
    });
    if (pasteItem) pasteItem.addEventListener('click', () => {
      closeAddMenu();
      if (PT.pasteCode) PT.pasteCode.open('');
    });
    document.addEventListener('mousedown', (e) => {
      const menu = document.getElementById('tab-add-menu');
      const add = document.getElementById('file-tab-add');
      if (!menu || menu.hidden) return;
      if (menu.contains(e.target) || (add && add.contains(e.target))) return;
      closeAddMenu();
    }, true);
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('tab-add-menu');
      const add = document.getElementById('file-tab-add');
      if (!menu || menu.hidden) return;
      if (menu.contains(e.target) || (add && add.contains(e.target))) return;
      closeAddMenu();
    }, true);
    document.addEventListener('pointerdown', (e) => {
      const menu = document.getElementById('tab-add-menu');
      const add = document.getElementById('file-tab-add');
      if (!menu || menu.hidden) return;
      if (menu.contains(e.target) || (add && add.contains(e.target))) return;
      closeAddMenu();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAddMenu();
    });
    window.addEventListener('resize', closeAddMenu);
    window.addEventListener('scroll', closeAddMenu, true);
    document.addEventListener('keydown', (e) => {
      if (switching) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'w' || e.key === 'W') {
        if (!activeId) return;
        e.preventDefault();
        close(activeId);
      }
    });
    render();
  }

  function positionAddMenu() {
    const add = document.getElementById('file-tab-add');
    const menu = document.getElementById('tab-add-menu');
    if (!add || !menu) return;
    const r = add.getBoundingClientRect();
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';
    requestAnimationFrame(() => {
      const box = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.right - box.width, window.innerWidth - box.width - 8));
      const top = Math.min(r.bottom + 6, window.innerHeight - box.height - 8);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
    });
  }

  function toggleAddMenu() {
    const menu = document.getElementById('tab-add-menu');
    if (!menu) return;
    if (!menu.hidden) {
      closeAddMenu();
      return;
    }
    positionAddMenu();
  }

  function closeAddMenu() {
    const menu = document.getElementById('tab-add-menu');
    if (menu) menu.hidden = true;
  }

  function hash(value) {
    return Core.hashString(String(value || ''));
  }

  function fileNameOf(tab) {
    return tab.fileName || '未命名.html';
  }

  function displayName(tab) {
    if (!tab) return '未命名.html';
    if (tab.displayName) return tab.displayName;
    const same = tabs.filter((t) => t.fileName === tab.fileName);
    if (same.length > 1 && tab.relativePath && tab.relativePath !== tab.fileName) return tab.relativePath;
    return fileNameOf(tab);
  }

  function currentRailTab() {
    const el = document.querySelector('.rail-tab.on');
    return el ? el.dataset.railTab || 'style' : 'style';
  }

  function makeKey(meta) {
    return meta.fileKey || ((meta.sourceHash || hash(meta.htmlContent)) + '|' + (meta.relativePath || meta.fileName || 'untitled.html'));
  }

  function makeDocId(meta, key) {
    if (meta.docId) return meta.docId;
    if (meta.sample) return 'sample:' + (meta.sourceHash || hash(meta.htmlContent));
    return String(meta.sourceHash || hash(meta.htmlContent)) + ':' + (meta.relativePath || meta.fileName || 'untitled.html');
  }

  function get(id) {
    return tabs.find((t) => t.id === id) || null;
  }

  function getActive() {
    return get(activeId);
  }

  function getAll() {
    return tabs.slice();
  }

  function hasTabs() {
    return tabs.length > 0;
  }

  function isSwitching() {
    return switching;
  }

  function snapshotTab(tab) {
    if (!tab || !PT.app || !PT.app.isLoaded()) return;
    if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
    if (PT.inspector) PT.inspector.commitActive();
    if (PT.ops) PT.ops.end();
    try {
      tab.htmlContent = PT.stage.serialize({ keepAid: true });
      tab.annotations = PT.annotations.serializeData();
      tab.history = PT.history.exportState();
      tab.railTab = currentRailTab();
      PT.storage.saveAnnotations(tab.docId, tab.annotations);
      if (!tab.savedHash) tab.savedHash = hash(tab.htmlContent);
    } catch (e) {
      console.warn('[ProtoTweak] tab snapshot failed', e);
    }
  }

  function snapshotActive() {
    const tab = getActive();
    if (tab) snapshotTab(tab);
    return tab;
  }

  function currentHtml(tab) {
    if (tab && tab.id === activeId && PT.app && PT.app.isLoaded()) {
      try { return PT.stage.serialize({ keepAid: true }); } catch (e) { /* fall through */ }
    }
    return tab ? tab.htmlContent || '' : '';
  }

  function isDirty(tab) {
    if (!tab || !tab.savedHash) return false;
    return hash(currentHtml(tab)) !== tab.savedHash;
  }

  async function openHtml(meta, opts) {
    if (!meta || !String(meta.htmlContent || '').trim()) return null;
    const options = opts || {};
    const key = makeKey(meta);
    const existing = tabs.find((t) => t.fileKey === key);
    if (existing) {
      await activate(existing.id);
      if (!options.silent) Core.toast('文件已打开，已切换到对应标签', 'info', 1800);
      return existing;
    }
    if (tabs.length >= MAX_TABS) {
      Core.toast('最多同时打开 ' + MAX_TABS + ' 个文件', 'error', 2400);
      return null;
    }
    const tab = {
      id: 'tab_' + Core.shortId(),
      fileName: meta.fileName || '未命名.html',
      displayName: meta.displayName || '',
      pasteIndex: meta.pasteIndex || 0,
      relativePath: meta.relativePath || meta.fileName || '未命名.html',
      fileKey: key,
      htmlContent: String(meta.htmlContent),
      annotations: meta.annotations || null,
      history: meta.history || null,
      railTab: meta.railTab || 'style',
      docId: makeDocId(meta, key),
      sourceHash: meta.sourceHash || hash(meta.htmlContent),
      savedHash: meta.savedHash || '',
      createdAt: Core.nowIso(),
      fresh: meta.fresh !== false,
      sample: !!meta.sample
    };
    tabs.push(tab);
    const ok = await activate(tab.id, { fresh: true });
    if (!ok) {
      tabs = tabs.filter((t) => t.id !== tab.id);
      render();
    }
    return ok ? tab : null;
  }

  async function activate(id, opts) {
    if (!id || switching) return false;
    if (PT.app && PT.app.isLoading()) return false;
    const target = get(id);
    if (!target) return false;
    const options = opts || {};
    if (activeId === id && !options.force) {
      render();
      return true;
    }
    const previous = getActive();
    if (previous && previous.id !== id) snapshotTab(previous);
    if (previous && previous.id !== id && PT.tour) PT.tour.stop();
    switching = true;
    activeId = id;
    render();
    let ok = false;
    try {
      ok = await PT.app.openTabDocument(target, {
        fresh: !!options.fresh,
        restored: !!options.restored
      });
    } finally {
      switching = false;
    }
    if (!ok) {
      activeId = previous ? previous.id : null;
      render();
      return false;
    }
    if (!target.savedHash) {
      target.savedHash = hash(target.htmlContent);
    }
    if (target.history) {
      PT.history.importState(target.history);
    } else {
      PT.history.reset();
      target.history = PT.history.exportState();
    }
    if (PT.app && PT.app.setRailTab) PT.app.setRailTab(target.railTab || 'style');
    persist();
    return true;
  }

  function openPasted(html) {
    if (!html || !String(html).trim()) return null;
    pasteSeq += 1;
    const index = pasteSeq;
    const displayName = '粘贴的html' + index;
    return openHtml({
      fileName: displayName + '.html',
      displayName,
      pasteIndex: index,
      fileKey: 'paste:' + index,
      docId: 'paste:' + index,
      htmlContent: String(html),
      sourceHash: hash(html),
      fresh: true
    });
  }

  async function close(id, opts) {
    if (switching) return false;
    const tab = get(id);
    if (!tab) return false;
    const force = !!(opts && opts.force);
    const dirty = isDirty(tab);
    if (dirty && !force) {
      const ok = await PT.app.confirm('关闭「' + displayName(tab) + '」？未保存的修改会丢失。', {
        title: '关闭未保存文件',
        confirmText: '关闭'
      });
      if (!ok) return false;
    }
    const wasActive = activeId === id;
    const index = tabs.findIndex((t) => t.id === id);
    tabs.splice(index, 1);
    if (PT.storage && PT.storage.removeAnnotations) PT.storage.removeAnnotations(tab.docId);
    if (!tabs.length) {
      activeId = null;
      pasteSeq = 0;
      render();
      if (PT.tour) PT.tour.stop();
      clearSession();
      if (PT.storage && PT.storage.clearLastSession) PT.storage.clearLastSession();
      if (PT.app) PT.app.showWelcome();
      return true;
    }
    if (wasActive) {
      const next = tabs[Math.min(index, tabs.length - 1)];
      activeId = null;
      render();
      await activate(next.id, { force: true });
    } else {
      render();
      persist();
    }
    return true;
  }

  async function closeAll() {
    if (!tabs.length) return;
    const dirtyCount = tabs.filter(isDirty).length;
    if (dirtyCount) {
      const ok = await PT.app.confirm('有 ' + dirtyCount + ' 个文件存在未保存修改，关闭后修改会丢失。', {
        title: '关闭全部文件',
        confirmText: '全部关闭'
      });
      if (!ok) return;
    }
    resetHome();
  }

  function resetHome() {
    tabs.forEach((t) => {
      if (PT.storage && PT.storage.removeAnnotations) PT.storage.removeAnnotations(t.docId);
    });
    tabs = [];
    activeId = null;
    pasteSeq = 0;
    render();
    if (PT.tour) PT.tour.stop();
    clearSession();
    if (PT.storage && PT.storage.clearLastSession) PT.storage.clearLastSession();
    if (PT.app) PT.app.showWelcome();
    return true;
  }

  function markSaved(tab) {
    const target = tab || getActive();
    if (!target) return;
    if (target.id === activeId && PT.app && PT.app.isLoaded()) {
      try { target.htmlContent = PT.stage.serialize({ keepAid: true }); } catch (e) { /* ignore */ }
    }
    target.savedHash = hash(target.htmlContent);
    persist();
  }

  function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 600);
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  function persist() {
    try {
      if (!tabs.length) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      const payload = {
        activeId,
        pasteSeq,
        tabs: tabs.map((t) => ({
          id: t.id,
          fileName: t.fileName,
          displayName: t.displayName || '',
          pasteIndex: t.pasteIndex || 0,
          relativePath: t.relativePath,
          fileKey: t.fileKey,
          htmlContent: t.htmlContent,
          annotations: t.annotations || null,
          docId: t.docId,
          sourceHash: t.sourceHash,
          savedHash: t.savedHash,
          railTab: t.railTab || 'style',
          createdAt: t.createdAt
        }))
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (e) {
      try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* ignore */ }
      Core.toast('文件内容较大，浏览器存储空间不足，当前标签未能持久化', 'error', 3600);
    }
  }

  async function restore() {
    let payload = null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) payload = JSON.parse(raw);
    } catch (e) { payload = null; }
    if (!payload || !Array.isArray(payload.tabs) || !payload.tabs.length) return false;

    const seen = new Set();
    tabs = payload.tabs.filter((t) => {
      if (!t || !t.id || !t.htmlContent || !t.fileKey) return false;
      if (seen.has(t.fileKey)) return false;
      seen.add(t.fileKey);
      return true;
    });
    if (!tabs.length) return false;
    activeId = tabs.some((t) => t.id === payload.activeId) ? payload.activeId : tabs[0].id;
    tabs.forEach((t) => {
      t.annotations = t.annotations && Array.isArray(t.annotations.annotations) ? t.annotations : null;
      t.history = null;
      t.railTab = t.railTab || 'style';
      t.displayName = t.displayName || '';
      t.pasteIndex = Number(t.pasteIndex) || 0;
    });
    pasteSeq = Math.max(Number(payload.pasteSeq) || 0, ...tabs.map((t) => t.pasteIndex || 0));
    render();
    switching = true;
    let ok = false;
    try {
      ok = await PT.app.openTabDocument(getActive(), { fresh: true, restored: true });
    } finally {
      switching = false;
    }
    if (!ok) {
      tabs = [];
      activeId = null;
      pasteSeq = 0;
      render();
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
      return false;
    }
    persist();
    return true;
  }

  function render() {
    const bar = document.getElementById('file-tabs');
    const list = document.getElementById('file-tabs-list');
    if (!bar || !list) return;
    bar.hidden = tabs.length === 0;
    document.body.classList.toggle('has-file-tabs', tabs.length > 0);
    list.innerHTML = '';
    tabs.forEach((tab) => {
      const el = document.createElement('div');
      el.className = 'pt-file-tab' + (tab.id === activeId ? ' is-active' : '');
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', tab.id === activeId ? 'true' : 'false');
      el.dataset.tabId = tab.id;
      el.title = tab.relativePath || tab.fileName;
      const name = document.createElement('span');
      name.className = 'pt-file-tab-name';
      name.textContent = displayName(tab);
      const close = document.createElement('button');
      close.className = 'pt-file-tab-close';
      close.type = 'button';
      close.setAttribute('aria-label', '关闭 ' + tab.fileName);
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeTab(tab.id);
      });
      el.addEventListener('click', () => activate(tab.id));
      el.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(tab.id);
        }
      });
      el.appendChild(name);
      el.appendChild(close);
      list.appendChild(el);
    });
    const add = document.getElementById('file-tab-add');
    if (add) add.hidden = tabs.length === 0;
    if (!tabs.length) closeAddMenu();
  }

  function closeTab(id) {
    close(id);
  }

  function updateActiveFromApp(fileName, docId) {
    const tab = tabs.find((t) => t.docId === docId) || getActive();
    if (tab && fileName) {
      tab.fileName = fileName;
      render();
    }
  }

  PT.tabs = {
    init,
    openHtml,
    openPasted,
    activate,
    close,
    closeAll,
    resetHome,
    snapshotActive,
    snapshotTab,
    getActive,
    getAll,
    hasTabs,
    isSwitching,
    isDirty,
    markSaved,
    persist,
    persistSoon,
    restore,
    render,
    updateActiveFromApp
  };
})();
