/* ProtoTweak — application boot */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const state = {
    loaded: false,
    loading: false,
    mode: 'edit',
    fastInspect: false,
    fileName: null,
    fileHandle: null,
    sourceHash: '',
    docId: null,
    startedAt: null,
    lastSaveAt: null
  };

  const LAUNCH_KEY = 'prototweak_launch_v1';

  // A fresh tab/browser session always lands on the welcome page. Reloading
  // the same tab keeps sessionStorage, so an in-progress session can still
  // recover its tabs.
  function isFreshLaunch() {
    try {
      if (sessionStorage.getItem(LAUNCH_KEY)) return false;
      sessionStorage.setItem(LAUNCH_KEY, '1');
      return true;
    } catch (e) {
      return true;
    }
  }

  let booted = false;
  function init() {
    if (booted) return;
    booted = true;
    const freshLaunch = isFreshLaunch();
    const steps = [
      ['storage', () => PT.storage.init()],
      ['stage', () => PT.stage.init({
        iframe: document.getElementById('stage'),
        canvas: document.getElementById('canvas')
      })],
      ['history', () => PT.history.init()],
      ['selection', () => PT.selection.init()],
      ['text-edit', () => PT.textEdit.init()],
      ['select-editor', () => PT.selectEditor.init()],
      ['drag', () => PT.drag.init()],
      ['table', () => PT.table.init()],
      ['resize', () => PT.resize.init()],
      ['pages', () => PT.pages.init()],
      ['inspector', () => PT.inspector.init()],
      ['insert', () => PT.insert.init()],
      ['clipboard', () => PT.clipboard.init()],
      ['annotations', () => PT.annotations.init()],
      ['annotation-ui', () => PT.annotationUI.init()],
      ['context-menu', () => PT.contextMenu && PT.contextMenu.init()],
      ['tabs', () => PT.tabs && PT.tabs.init()],
      ['paste-code', () => PT.pasteCode && PT.pasteCode.init()],
      ['tour', () => PT.tour && PT.tour.init()],
      ['confirm', initConfirm],
      ['versions', () => PT.versions.init()],
      ['changelog', () => PT.changelog.init()],
      ['export', () => PT.export.init()],
      ['stage-events', bindStageEvents],
      ['topbar', bindTopbar],
      ['drop', bindDrop],
      ['menus', bindMenus],
      ['import', bindImport],
      ['modals', bindModals],
      ['annotation-io', bindAnnotationIO],
      ['keyboard', bindKeyboard],
      ['window-events', bindWindowEvents]
    ];
    for (const [name, fn] of steps) {
      try {
        fn();
      } catch (err) {
        console.error('[ProtoTweak] init failed at step:', name, err && err.stack ? err.stack : err);
        Core.toast('编辑器初始化失败：' + name, 'error', 6000);
        throw err;
      }
    }

    updateUndoRedo();
    updateStatus();
    updateFileChip();
    applyModeUI('edit');
    setRailTab('style');
    showEmpty();

    // New browser session/tab: never auto-open a previous prototype.
    if (freshLaunch) return;

    PT.tabs.restore().then((restored) => {
      if (restored) return;
      restoreSession().then((ok) => {
        if (!ok) showEmpty();
      }).catch(() => showEmpty());
    }).catch(() => {
      restoreSession().then((ok) => {
        if (!ok) showEmpty();
      }).catch(() => showEmpty());
    });
  }

  // ---------- Lifecycle ----------
  function bindStageEvents() {
    Core.on('stage:ready', ({ doc }) => {
      bindDocument(doc);
      if (state.loaded) PT.stage.ensureEditStyle();
    });
    Core.on('stage:body', () => {
      if (!state.loaded) return;
      PT.stage.scheduleLayout();
    });
    Core.on('history:change', updateUndoRedo);
    Core.on('history:commit', () => {
      scheduleSessionSave();
      updateStatus();
    });
    Core.on('history:restore', () => {
      updateUndoRedo();
      PT.inspector.sync();
      PT.table.updateUI();
      PT.annotationUI.renderAll();
      updateStatus();
      scheduleSessionSave();
    });
    Core.on('selection:change', () => {
      PT.inspector.commitActive();
      updateStatus();
      if (state.mode === 'edit' && !PT.annotations.isMode()) setRailTab('style');
    });
    Core.on('mode:change', updateModeUI);
    Core.on('annotations:mode', updateAnnotationModeUI);
    Core.on('annotations:change', () => {
      updateStatus();
      updateUndoRedo();
      scheduleSessionSave();
    });
    Core.on('annotations:add', () => {
      setRailTab('annot');
      scheduleSessionSave();
    });
    Core.on('annotations:focus', () => setRailTab('annot'));
    Core.on('annotations:event', () => scheduleSessionSave());
    Core.on('storage:warning', (e) => {
      if (e && e.message) Core.toast(e.message, 'error', 5200);
    });
  }

  function bindDocument(doc) {
    if (!doc) return;
    PT.annotations.bind(doc);
    PT.selection.bind(doc);
    PT.textEdit.bind(doc);
    PT.drag.bind(doc);
    PT.clipboard.bind(doc);
    if (PT.pasteCode) PT.pasteCode.bind(doc);

    doc.addEventListener('mousedown', onDocumentMouseDown, true);
    doc.addEventListener('keydown', onInspectKeyDown, true);
    doc.addEventListener('keyup', onInspectKeyUp, true);
    doc.addEventListener('keydown', handleKey, false);
    doc.addEventListener('dragstart', (e) => {
      if (state.mode === 'edit' && !PT.annotations.isMode()) e.preventDefault();
    }, true);
    doc.addEventListener('dragover', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      const overlay = document.getElementById('pt-drop-overlay');
      if (overlay) overlay.hidden = false;
    }, false);
    doc.addEventListener('dragleave', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      if (e.relatedTarget) return;
      const overlay = document.getElementById('pt-drop-overlay');
      if (overlay) overlay.hidden = true;
    }, false);
    doc.addEventListener('drop', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      const overlay = document.getElementById('pt-drop-overlay');
      if (overlay) overlay.hidden = true;
      importDataTransfer(e.dataTransfer);
    }, false);
  }

  function onDocumentClick(e) {
    if (state.mode !== 'preview') return;
    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    const link = target.closest && target.closest('a[href]');
    if (!link) return;
    if (link.target === '_blank') return;
    const href = link.getAttribute('href') || '';
    // Multi-page prototypes switch pages with hash/data attributes. Let the
    // page manager (and the prototype's own handler) handle those.
    if (href.charAt(0) === '#') return;
    if (link.hasAttribute('data-go') || link.hasAttribute('data-href') ||
        link.hasAttribute('data-screen') || link.hasAttribute('data-page')) return;
    if (/^(mailto:|tel:)/i.test(href)) return;
    e.preventDefault();
    if (/^https?:/i.test(link.href)) {
      try { window.open(link.href, '_blank', 'noopener'); } catch (err) { /* ignore */ }
    } else {
      Core.toast('预览模式不跳转外部文件；多页面请用 data-go 或 #页面锚点。', 'info', 3000);
    }
  }

  function onDocumentMouseDown(e) {
    if (!state.loaded) return;
    if (PT.annotations.isMode() || PT.textEdit.isEditing()) return;
    const inspect = state.fastInspect || e.ctrlKey || e.metaKey;
    if (!inspect) return;
    if (!state.fastInspect) setFastInspect(true);
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function isFastInspect() {
    return !!state.loaded && !!state.fastInspect;
  }

  function setFastInspect(on) {
    const next = !!on && state.loaded && !(PT.annotations && PT.annotations.isMode());
    if (state.fastInspect === next) return;
    state.fastInspect = next;
    document.body.classList.toggle('inspect-active', next);
    document.body.classList.toggle('preview-inspect', next && state.mode === 'preview');
    if (PT.stage && PT.stage.setInspectCursor) PT.stage.setInspectCursor(next);
    if (!next && PT.selection && PT.selection.clearHover) PT.selection.clearHover();
  }

  function exitFastInspect() {
    setFastInspect(false);
  }

  function onInspectKeyDown(e) {
    if (!state.loaded || (PT.annotations && PT.annotations.isMode())) return;
    if (e.key === 'Control' || e.key === 'Meta') {
      setFastInspect(true);
    }
  }

  function onInspectKeyUp(e) {
    if (e.key === 'Control' || e.key === 'Meta') {
      setFastInspect(false);
    }
  }

  // ---------- Document loading ----------
  async function loadDocument(rawHtml, opts) {
    const options = opts || {};
    if (state.loading) return false;
    const html = String(rawHtml == null ? '' : rawHtml);
    if (!html.trim()) {
      Core.toast('HTML 内容为空', 'error');
      return false;
    }
    state.loading = true;
    closeAllMenus();
    closeAllModals();
    if (PT.drag) PT.drag.cancel();
    if (PT.resize) PT.resize.cancel();
    if (PT.table && PT.table.cancelSize) PT.table.cancelSize();
    if (PT.ops) PT.ops.end();
    if (PT.pages) PT.pages.clear();
    PT.annotationUI.closeCard({ removeIfEmpty: false });
    if (PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
    if (PT.inspector) PT.inspector.commitActive();
    try {
      const fileName = options.fileName || state.fileName || 'prototype.html';
      const sourceHash = options.sourceHash || Core.hashString(html);
      const docId = options.docId || (sourceHash + ':' + fileName);
      state.fileName = fileName;
      state.fileHandle = options.fileHandle || null;
      state.sourceHash = sourceHash;
      state.docId = docId;

      document.body.classList.remove('no-doc');
      document.body.classList.add('loading-doc');
      document.getElementById('empty-state').hidden = true;
      const iframe = document.getElementById('stage');
      iframe.hidden = false;
      await PT.stage.load(html);
      state.loaded = true;
      state.startedAt = Core.nowIso();

      PT.annotations.setDocument({
        docId,
        fileName,
        sourceHash,
        fallbackData: options.fallbackAnnotations || null
      });
      if (options.forceAnnotations && options.annotationsData) {
        PT.annotations.importFile(options.annotationsData);
      }
      PT.annotations.setMode(false);
      PT.selection.clear({ silent: true });
      PT.history.reset();
      PT.changelog.startSession();
      PT.inspector.sync();
      PT.table.updateUI();
      PT.annotationUI.renderAll();
      PT.stage.ensureEditStyle();
      setMode('edit', { force: true, silent: true });
      if (PT.pages) PT.pages.scan({ reset: true });
      PT.annotationUI.renderBanner();
      updateUndoRedo();
      updateFileChip();
      updateStatus();
      const saveStatus = document.getElementById('status-save');
      if (saveStatus) saveStatus.textContent = '';
      setRailTab('style');
      PT.stage.scheduleLayout();
      state.loading = false;
      if (!options.skipVersion && !options.restoreSession) {
        PT.versions.saveCurrent('auto', '打开文件');
      }
      if (!options.skipSave) scheduleSessionSave();
      if (options.restoreSession) Core.toast('已恢复上次编辑会话', 'success', 1800);
      else Core.toast('已打开 ' + fileName, 'success', 1500);
      return true;
    } catch (err) {
      state.loading = false;
      console.error(err);
      Core.toast('HTML 载入失败：' + (err && err.message ? err.message : '未知错误'), 'error');
      return false;
    } finally {
      document.body.classList.remove('loading-doc');
    }
  }

  async function openTabDocument(tab, opts) {
    if (!tab) return false;
    const options = opts || {};
    const loadOpts = {
      fileName: tab.fileName,
      docId: tab.docId,
      sourceHash: tab.sourceHash,
      skipVersion: true,
      skipSave: true
    };
    if (tab.annotations) {
      loadOpts.forceAnnotations = true;
      loadOpts.annotationsData = tab.annotations;
    }
    const ok = await loadDocument(tab.htmlContent, loadOpts);
    if (!ok) return false;
    try {
      tab.htmlContent = PT.stage.serialize({ keepAid: true });
      tab.annotations = PT.annotations.serializeData();
      if (!tab.savedHash) tab.savedHash = Core.hashString(tab.htmlContent);
    } catch (e) { /* ignore */ }
    if (PT.tabs) {
      PT.tabs.render();
      PT.tabs.persist();
    }
    return true;
  }

  async function loadFile(file, handle) {
    if (!file) return null;
    if (!/\.html?$/i.test(file.name) && file.type && !/html/i.test(file.type)) {
      Core.toast('请选择 .html 或 .htm 文件', 'error');
      return null;
    }
    try {
      const raw = await Core.readFileAsText(file);
      if (!PT.tabs) return null;
      return await PT.tabs.openHtml({
        fileName: file.name,
        relativePath: file.name,
        htmlContent: raw,
        sourceHash: Core.hashString(raw),
        fileHandle: handle || null
      });
    } catch (err) {
      Core.toast('文件读取失败', 'error');
      return null;
    }
  }

  async function pickFile() {
    if (!window.showOpenFilePicker) {
      document.getElementById('file-input').click();
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: 'HTML',
          accept: { 'text/html': ['.html', '.htm'] }
        }]
      });
      if (!handles || !handles.length) return;
      let opened = 0;
      for (const handle of handles) {
        const file = await handle.getFile();
        const tab = await loadFile(file, handle);
        if (tab) opened++;
      }
      if (opened > 1) Core.toast('已打开 ' + opened + ' 个文件', 'success', 1800);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      document.getElementById('file-input').click();
    }
  }

  async function restoreSession() {
    try {
      const session = await PT.storage.loadLastSession();
      if (!session || !session.html) return false;
      if (!PT.tabs) return false;
      const tab = await PT.tabs.openHtml({
        fileName: session.fileName || 'prototype.html',
        relativePath: session.fileName || 'prototype.html',
        htmlContent: session.html,
        sourceHash: session.sourceHash || Core.hashString(session.html),
        docId: session.docId,
        annotations: session.annotations || null,
        fresh: true
      });
      if (!tab) return false;
      Core.toast('已恢复上次编辑会话', 'success', 1800);
      return true;
    } catch (err) {
      console.warn('[ProtoTweak] restore session failed', err);
      return false;
    }
  }

  // ---------- Session save ----------
  const scheduleSessionSave = Core.debounce(saveSessionNow, 750);

  async function saveSessionNow() {
    if (!state.loaded || state.loading || !PT.stage.isReady() || !state.docId) return;
    try {
      const html = PT.stage.serialize({ keepAid: true });
      const annotations = PT.annotations.serializeData();
      await PT.storage.saveSession({
        docId: state.docId,
        fileName: state.fileName,
        sourceHash: state.sourceHash,
        html,
        annotations,
        savedAt: Core.nowIso()
      });
      state.lastSaveAt = Core.nowIso();
      const status = document.getElementById('status-save');
      if (status) status.innerHTML = '<span class="status-save-dot"></span>已自动保存 ' + Core.formatTime(state.lastSaveAt);
    } catch (err) {
      console.warn('[ProtoTweak] session save failed', err);
    }
  }

  // ---------- Mode ----------
  function setMode(mode, opts) {
    const options = opts || {};
    if (!state.loaded) return;
    if (!options.force && state.mode === mode) return;
    if (PT.drag) PT.drag.cancel();
    if (PT.resize) PT.resize.cancel();
    if (PT.table && PT.table.cancelSize) PT.table.cancelSize();
    if (PT.ops) PT.ops.end();
    if (mode === 'preview') {
      if (PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
      PT.inspector.commitActive();
      PT.annotations.setMode(false);
      PT.selection.clear({ silent: true });
      PT.annotationUI.closeCard({ removeIfEmpty: true });
      PT.stage.removeEditStyle();
      PT.stage.setAnnotationCursor(false);
      document.body.classList.add('preview-mode');
      document.body.classList.remove('annotate-mode');
    } else {
      PT.stage.ensureEditStyle();
      document.body.classList.remove('preview-mode');
      if (PT.annotations.isMode()) document.body.classList.add('annotate-mode');
    }
    state.mode = mode;
    document.body.classList.toggle('preview-inspect', state.fastInspect && mode === 'preview');
    PT.inspector.setDisabled(mode !== 'edit' || PT.annotations.isMode());
    PT.table.updateUI();
    if (PT.resize) PT.resize.refresh();
    PT.annotationUI.renderPins();
    PT.annotationUI.renderBanner();
    if (!options.silent) Core.emit('mode:change', { mode });
    updateModeUI();
  }

  function updateModeUI() {
    const isPreview = state.mode === 'preview';
    document.querySelectorAll('.mode-btn[data-mode]').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === state.mode);
    });
    document.getElementById('status-mode').textContent = isPreview ? '预览模式 · Ctrl/Cmd 点击穿透' : (PT.annotations.isMode() ? '批注模式' : '编辑模式 · Ctrl/Cmd 点击选中');
    document.body.classList.toggle('preview-mode', isPreview);
    document.body.classList.toggle('annotate-mode', !isPreview && PT.annotations.isMode());
    document.getElementById('btn-annotate').classList.toggle('on', PT.annotations.isMode());
    PT.inspector.setDisabled(!canEdit());
    PT.table.updateUI();
    if (PT.resize) PT.resize.refresh();
    PT.annotationUI.renderPins();
  }

  function toggleAnnotation() {
    if (!state.loaded) {
      Core.toast('请先导入 HTML', 'info');
      return;
    }
    PT.inspector.commitActive();
    if (state.mode === 'preview') setMode('edit');
    if (PT.annotations.isReanchor()) {
      PT.annotations.cancelReanchor();
      PT.annotationUI.renderBanner();
      return;
    }
    const next = !PT.annotations.isMode();
    PT.annotations.setMode(next);
    if (next) {
      PT.selection.clear({ silent: true });
      PT.annotationUI.closeCard({ removeIfEmpty: true });
      setRailTab('annot');
      document.body.classList.add('annotate-mode');
      Core.toast('批注模式：点击页面元素添加批注，Esc 退出', 'info', 2600);
    } else {
      document.body.classList.remove('annotate-mode');
    }
    PT.inspector.setDisabled(!canEdit());
    PT.table.updateUI();
    if (PT.resize) PT.resize.refresh();
    PT.annotationUI.renderBanner();
    updateModeUI();
  }

  function updateAnnotationModeUI() {
    const on = PT.annotations.isMode();
    document.getElementById('btn-annotate').classList.toggle('on', on);
    document.body.classList.toggle('annotate-mode', on && state.mode !== 'preview');
    PT.inspector.setDisabled(!canEdit());
    PT.table.updateUI();
    PT.annotationUI.renderBanner();
    updateModeUI();
  }

  function exitAnnotation() {
    if (PT.annotations.isReanchor()) {
      PT.annotations.cancelReanchor();
      PT.annotationUI.renderBanner();
      return;
    }
    if (PT.annotations.isMode()) {
      PT.annotations.setMode(false);
      document.body.classList.remove('annotate-mode');
      PT.inspector.setDisabled(!canEdit());
      PT.table.updateUI();
      PT.annotationUI.renderBanner();
      updateModeUI();
    }
  }

  function canEdit() {
    return state.loaded && state.mode === 'edit' && !PT.annotations.isMode();
  }

  // ---------- UI state ----------
  function showEmpty() {
    state.loaded = false;
    state.mode = 'edit';
    state.fileName = null;
    state.docId = null;
    state.sourceHash = '';
    state.fileHandle = null;
    if (PT.tour) PT.tour.stop();
    document.body.classList.add('no-doc');
    document.body.classList.remove('preview-mode', 'annotate-mode');
    document.getElementById('empty-state').hidden = false;
    const iframe = document.getElementById('stage');
    iframe.hidden = true;
    document.getElementById('file-chip').textContent = '未打开文件';
    document.getElementById('status-file').textContent = '未打开文件';
    document.getElementById('status-selection').textContent = '';
    document.getElementById('status-annot').textContent = '';
    document.getElementById('status-save').textContent = '';
    document.getElementById('status-mode').textContent = '编辑模式';
    document.getElementById('annotation-banner').hidden = true;
    PT.selection.clear({ silent: true });
    if (PT.pages) PT.pages.clear();
    if (PT.history) PT.history.reset();
    if (PT.annotations) PT.annotations.unload();
    if (PT.resize) PT.resize.refresh();
    PT.inspector.sync();
    PT.table.updateUI();
    PT.annotationUI.renderAll();
    if (PT.tabs) PT.tabs.render();
    const drop = document.getElementById('pt-drop-overlay');
    if (drop) drop.hidden = true;
    updateUndoRedo();
  }

  function showWelcome() {
    showEmpty();
  }

  function updateFileChip() {
    const label = state.fileName || '未打开文件';
    document.getElementById('file-chip').textContent = label;
    document.getElementById('file-chip').title = state.fileName || '';
  }

  function updateStatus() {
    if (!state.loaded) return;
    document.getElementById('status-file').textContent = state.fileName || '未命名';
    const sel = PT.selection.getSelected();
    document.getElementById('status-selection').textContent = sel ? (PT.anchors ? PT.anchors.elementPath(sel) : sel.tagName.toLowerCase()) : '';
    const c = PT.annotations.counts();
    document.getElementById('status-annot').textContent = c.total ? ('批注 ' + c.total + ' · 未解决 ' + c.open + (c.orphan ? ' · 孤立 ' + c.orphan : '')) : '';
    document.getElementById('status-mode').textContent = state.mode === 'preview' ? '预览模式 · Ctrl/Cmd 点击穿透' : (PT.annotations.isMode() ? '批注模式' : '编辑模式 · Ctrl/Cmd 点击选中');
    document.getElementById('annot-count').textContent = String(c.total);
    document.getElementById('annot-count').classList.toggle('has-orphan', c.orphan > 0);
    document.getElementById('annot-tab-count').textContent = String(c.total);
  }

  function updateUndoRedo() {
    const undo = document.getElementById('btn-undo');
    const redo = document.getElementById('btn-redo');
    if (undo) undo.disabled = !state.loaded || !PT.history.canUndo();
    if (redo) redo.disabled = !state.loaded || !PT.history.canRedo();
  }

  function setRailTab(tab) {
    document.querySelectorAll('.rail-tab').forEach((b) => b.classList.toggle('on', b.dataset.railTab === tab));
    document.getElementById('style-pane').hidden = tab !== 'style';
    document.getElementById('annot-pane').hidden = tab !== 'annot';
    if (tab === 'style') PT.inspector.sync();
    else PT.annotationUI.renderList();
  }

  function applyModeUI(mode) {
    document.querySelectorAll('.mode-btn[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    document.getElementById('status-mode').textContent = mode === 'preview' ? '预览模式 · Ctrl/Cmd 点击穿透' : '编辑模式 · Ctrl/Cmd 点击选中';
  }

  // ---------- Menus ----------
  function bindMenus() {
    document.getElementById('btn-insert').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu('insert-menu');
    });
    document.getElementById('btn-export').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu('export-menu');
    });
    document.getElementById('btn-more').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu('more-menu');
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.menu, .menu-wrap')) return;
      closeAllMenus();
    });
    document.querySelectorAll('[data-insert]').forEach((b) => {
      b.addEventListener('click', () => {
        closeAllMenus();
        PT.insert.insert(b.dataset.insert);
      });
    });
    document.querySelectorAll('[data-export]').forEach((b) => {
      b.addEventListener('click', () => {
        closeAllMenus();
        const type = b.dataset.export;
        if (type === 'clean') PT.export.exportClean();
        else if (type === 'review') PT.export.exportReview();
        else if (type === 'annotations') PT.export.exportAnnotations();
        else if (type === 'markdown') PT.export.exportMarkdown();
        else if (type === 'pdf') PT.export.exportPdf();
      });
    });
    document.getElementById('menu-baseline').addEventListener('click', () => {
      closeAllMenus();
      PT.versions.saveManual();
    });
    document.getElementById('menu-versions').addEventListener('click', () => {
      closeAllMenus();
      PT.versions.openPanel();
    });
    document.getElementById('menu-summary').addEventListener('click', () => {
      closeAllMenus();
      PT.changelog.download();
    });
    document.getElementById('menu-import-annotations').addEventListener('click', () => {
      closeAllMenus();
      document.getElementById('annotation-file-input').click();
    });
    document.getElementById('menu-close').addEventListener('click', () => {
      closeAllMenus();
      closeDocument();
    });
    document.getElementById('menu-help').addEventListener('click', () => {
      closeAllMenus();
      syncHelpTourPreference();
      document.getElementById('help-modal').hidden = false;
    });
  }

  function toggleMenu(id) {
    const target = document.getElementById(id);
    const willOpen = target.hidden;
    closeAllMenus();
    if (willOpen) target.hidden = false;
  }

  function closeAllMenus() {
    document.querySelectorAll('.menu').forEach((m) => { m.hidden = true; });
  }

  // ---------- Topbar ----------
  function bindTopbar() {
    const home = document.getElementById('btn-home');
    if (home) {
      home.addEventListener('click', async () => {
        if (PT.tabs && PT.tabs.hasTabs()) {
          if (!window.confirm('返回主页将关闭当前所有文件，确定吗？')) return;
        }
        if (PT.tabs && PT.tabs.resetHome) PT.tabs.resetHome();
        else showWelcome();
      });
    }
    const welcomeDrop = document.getElementById('welcome-dropzone');
    if (welcomeDrop) {
      welcomeDrop.addEventListener('click', pickFile);
      welcomeDrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pickFile();
        }
      });
      ['dragenter', 'dragover'].forEach((ev) => {
        welcomeDrop.addEventListener(ev, (e) => {
          if (!hasFileDrag(e.dataTransfer)) return;
          e.preventDefault();
          welcomeDrop.classList.add('drag-over');
        });
      });
      welcomeDrop.addEventListener('dragleave', (e) => {
        if (!hasFileDrag(e.dataTransfer)) return;
        welcomeDrop.classList.remove('drag-over');
      });
      welcomeDrop.addEventListener('drop', () => {
        welcomeDrop.classList.remove('drag-over');
      });
    }
    document.getElementById('file-input').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const file of files) await loadFile(file, null);
    });
    document.getElementById('btn-sample-2').addEventListener('click', loadSample);
    document.getElementById('btn-undo').addEventListener('click', () => PT.history.undo());
    document.getElementById('btn-redo').addEventListener('click', () => PT.history.redo());
    document.querySelectorAll('.mode-btn[data-mode]').forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
    });
    document.getElementById('btn-annotate').addEventListener('click', toggleAnnotation);
    document.getElementById('btn-save').addEventListener('click', () => saveDocument(false));
    document.querySelectorAll('.rail-tab').forEach((b) => {
      b.addEventListener('click', () => setRailTab(b.dataset.railTab));
    });
    document.getElementById('ann-export-btn').addEventListener('click', () => PT.export.exportAnnotations());
    document.getElementById('ann-import-btn').addEventListener('click', () => document.getElementById('annotation-file-input').click());
  }

  async function loadSample(opts) {
    const options = opts || {};
    closeAllModals();
    if (!PT.tabs || !PT.sample) return;
    const existingSample = PT.tabs.getAll().find((t) => t.sample);
    const staleSample = existingSample && !String(existingSample.htmlContent || '').includes('data-page="page-home"');
    if ((options.reload || staleSample) && existingSample) {
      await PT.tabs.close(existingSample.id, { force: true });
      if (PT.tabs.getAll().some((t) => t.sample)) return;
    }
    if (PT.tour) PT.tour.stop();
    // Normal sample entry respects the "不再提示" preference. Only the Help
    // page's explicit "重新载入示例并开始引导" resets and forces the tour.
    if (options.forceTour && PT.storage && PT.storage.resetTour) {
      PT.storage.resetTour();
    }
    const tab = await PT.tabs.openHtml({
      fileName: PT.sample.fileName,
      relativePath: PT.sample.fileName,
      fileKey: PT.sample.fileKey,
      htmlContent: PT.sample.html,
      sourceHash: Core.hashString(PT.sample.html),
      docId: 'sample:' + Core.hashString(PT.sample.html),
      sample: true,
      fresh: true
    }, { silent: true });
    if (!tab) return;
    if (PT.pages) {
      const first = PT.pages.getPages()[0];
      if (first) PT.pages.show(first.key);
    }
    // Give the onboarding a real annotation pin to point at.
    try {
      if (!PT.annotations.list().length) {
        const doc = PT.stage.getDoc();
        const target = doc && (doc.querySelector('h1') || doc.body);
        if (target) {
          const ann = PT.annotations.add(target);
          if (ann) {
            PT.annotations.update(ann.id, {
              content: '这是一条示例批注，点击小点可以查看或标记为已解决。',
              type: '交互说明'
            }, { source: 'sample' });
            // The auto-created demo aid is part of the sample baseline, not an
            // unsaved user edit.
            if (PT.tabs) {
              PT.tabs.snapshotActive();
              PT.tabs.markSaved();
            }
          }
        }
      }
    } catch (e) { /* sample annotation is optional */ }
    if (PT.tour) {
      const forced = !!options.forceTour;
      if (forced) {
        setTimeout(() => PT.tour.start({ force: true }), 320);
      } else if (!PT.tour.isDismissed()) {
        setTimeout(() => PT.tour.start(), 320);
      }
    }
  }

  // ---------- Drag / folder import ----------
  function hasFileDrag(dt) {
    if (!dt) return false;
    try {
      if (dt.files && dt.files.length) return true;
      if (dt.items) {
        for (const item of Array.from(dt.items)) {
          if (item && item.kind === 'file') return true;
        }
      }
      return Array.from(dt.types || []).indexOf('Files') !== -1;
    } catch (e) {
      return false;
    }
  }

  function entryFile(entry) {
    return new Promise((resolve, reject) => entry.file(resolve, reject));
  }

  function readEntries(reader) {
    return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  }

  async function walkEntry(entry, out) {
    if (!entry) return;
    const name = entry.name || '';
    if (entry.isFile) {
      try {
        const file = await entryFile(entry);
        out.push({ file, path: String(entry.fullPath || name).replace(/^\/+/, '') });
      } catch (e) { /* skip unreadable entry */ }
      return;
    }
    if (entry.isDirectory) {
      if (name === 'node_modules' || name === '.git' || name.charAt(0) === '.') return;
      const reader = entry.createReader();
      while (true) {
        let batch = [];
        try { batch = await readEntries(reader); } catch (e) { break; }
        if (!batch || !batch.length) break;
        for (const child of batch) await walkEntry(child, out);
      }
    }
  }

  async function walkHandle(handle, out, prefix) {
    if (!handle) return;
    const base = prefix || '';
    if (handle.kind === 'file') {
      try {
        const file = await handle.getFile();
        out.push({ file, path: base + file.name });
      } catch (e) { /* skip unreadable handle */ }
      return;
    }
    if (handle.kind === 'directory' && handle.entries) {
      const name = handle.name || '';
      if (name === 'node_modules' || name === '.git' || name.charAt(0) === '.') return;
      try {
        for await (const [, child] of handle.entries()) {
          await walkHandle(child, out, base + name + '/');
        }
      } catch (e) { /* skip unreadable directory */ }
    }
  }

  async function importDataTransfer(dt) {
    if (!dt || !PT.tabs) return;

    // Snapshot the native FileList synchronously. Chrome clears DataTransfer
    // contents once the drop handler returns; reading it after an await loses
    // the dropped file.
    const flatFiles = Array.from(dt.files || []);
    const items = Array.from(dt.items || []);
    const entries = [];
    const handlePromises = [];
    items.forEach((item) => {
      try {
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (entry) entries.push(entry);
      } catch (e) { /* ignore */ }
      try {
        // Modern Chromium fallback for directories whose Entry reader is
        // unavailable. Start the promise synchronously, before the drop event
        // loses its DataTransfer contents.
        const handle = item.getAsFileSystemHandle && item.getAsFileSystemHandle();
        if (handle) handlePromises.push(handle);
      } catch (e) { /* ignore */ }
    });

    let records = flatFiles.map((file) => ({
      file,
      path: file.webkitRelativePath || file.name
    }));

    // Files are already available from dataTransfer.files. Only fall back to
    // recursive entry walking for a directory drop (folder drag) or when the
    // flat list is unexpectedly empty.
    const hasDirectory = entries.some((entry) => entry && entry.isDirectory);
    if (entries.length && (hasDirectory || !flatFiles.length)) {
      const entryRecords = [];
      for (const entry of entries) await walkEntry(entry, entryRecords);
      const known = new Set(records.map((record) => record.path || (record.file && record.file.name)));
      entryRecords.forEach((record) => {
        if (!record || !record.file) return;
        const path = record.path || record.file.name;
        if (!known.has(path)) {
          records.push({ file: record.file, path });
          known.add(path);
        }
      });
    }

    // If Entry recursion did not yield an HTML file, fall back to the modern
    // File System Access handles (directory handles can survive the drop event
    // where Entry readers sometimes cannot).
    const hasHtml = () => records.some((record) => record.file && /\.html?$/i.test(record.file.name || ''));
    if (!hasHtml() && handlePromises.length) {
      const settled = await Promise.allSettled(handlePromises);
      const handleRecords = [];
      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value) {
          await walkHandle(result.value, handleRecords, '');
        }
      }
      const known = new Set(records.map((record) => record.path || (record.file && record.file.name)));
      handleRecords.forEach((record) => {
        if (!record || !record.file) return;
        const path = record.path || record.file.name;
        if (!known.has(path)) {
          records.push({ file: record.file, path });
          known.add(path);
        }
      });
    }

    records = records.filter((record) => record && record.file);
    records.sort((a, b) => String(a.path || '').localeCompare(String(b.path || ''), 'zh-CN'));
    const htmlRecords = records
      .filter((record) => record.file && /\.html?$/i.test(record.file.name || ''))
      .slice(0, 24);
    records = records.slice(0, 500);
    if (!htmlRecords.length) {
      Core.toast('没有找到可导入的 HTML 文件', 'info', 2400);
      return;
    }

    let opened = 0;
    let skipped = 0;
    const seen = new Set();
    const hasAssets = records.some((record) => record.file && !/\.html?$/i.test(record.file.name));
    for (const record of htmlRecords) {
      const file = record.file;
      if (!file || file.size > 4 * 1024 * 1024) {
        skipped++;
        continue;
      }
      try {
        const raw = await Core.readFileAsText(file);
        const sourceHash = Core.hashString(raw);
        const relativePath = record.path || file.name;
        const key = sourceHash + '|' + relativePath;
        if (seen.has(key)) continue;
        seen.add(key);
        let htmlContent = raw;
        if (PT.bundler && hasAssets) {
          try {
            htmlContent = await PT.bundler.bundle(raw, relativePath, records);
          } catch (e) {
            htmlContent = raw;
          }
        }
        const before = PT.tabs.getAll().length;
        const tab = await PT.tabs.openHtml({
          fileName: file.name,
          relativePath,
          htmlContent,
          sourceHash,
          fresh: true
        }, { silent: true });
        if (tab && PT.tabs.getAll().length > before) opened++;
        else if (tab) skipped++;
      } catch (e) {
        skipped++;
      }
    }
    if (opened) Core.toast('已打开 ' + opened + ' 个文件' + (skipped ? '，跳过 ' + skipped + ' 个' : ''), 'success', 2600);
    else Core.toast(skipped ? '没有新增文件，已跳过 ' + skipped + ' 个' : '没有新增文件', 'info', 2400);
  }

  function bindDrop() {
    const canvas = document.getElementById('canvas');
    const overlay = document.getElementById('pt-drop-overlay');
    if (!canvas || !overlay) return;
    let depth = 0;
    const show = () => {
      overlay.hidden = false;
      canvas.classList.add('drag-over');
    };
    const hide = () => {
      depth = 0;
      overlay.hidden = true;
      canvas.classList.remove('drag-over');
    };
    canvas.addEventListener('dragenter', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      depth++;
      show();
    });
    canvas.addEventListener('dragover', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      show();
    });
    canvas.addEventListener('dragleave', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) hide();
    });
    canvas.addEventListener('drop', async (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      hide();
      await importDataTransfer(e.dataTransfer);
    });
    // Capture-phase fallback: a drop on a welcome child, text node, or browser
    // chrome should still be handled even if a descendant stops bubbling.
    document.addEventListener('dragover', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
    }, true);
    document.addEventListener('drop', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      if (e.target && e.target.closest && e.target.closest('.modal')) return;
      e.preventDefault();
      e.stopPropagation();
      hide();
      importDataTransfer(e.dataTransfer);
    }, true);
    window.addEventListener('dragover', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      if (canvas.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('#dropzone, .modal')) return;
      e.preventDefault();
      hide();
      importDataTransfer(e.dataTransfer);
    });
  }

  // ---------- Import ----------
  function bindImport() {
    const modal = document.getElementById('import-modal');
    document.getElementById('dz-pick').addEventListener('click', pickFile);
    document.getElementById('import-cancel').addEventListener('click', closeImportModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeImportModal(); });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeImportModal();
    });
    const dz = document.getElementById('dropzone');
    ['dragenter', 'dragover'].forEach((ev) => {
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ev === 'dragleave' && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('dragover');
      });
    });
    dz.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        closeImportModal();
        loadFile(file, null);
      }
    });
  }

  function openImportModal(tab) {
    document.getElementById('import-modal').hidden = false;
  }

  function closeImportModal() {
    document.getElementById('import-modal').hidden = true;
  }

  // ---------- Modals ----------
  function syncHelpTourPreference() {
    const checkbox = document.getElementById('help-tour-dismiss');
    if (!checkbox || !PT.storage || !PT.storage.loadTour) return;
    const tour = PT.storage.loadTour();
    checkbox.checked = !!(tour && tour.dismissed);
  }

  function bindModals() {
    document.getElementById('help-close').addEventListener('click', () => { document.getElementById('help-modal').hidden = true; });
    const tourDismiss = document.getElementById('help-tour-dismiss');
    if (tourDismiss) {
      tourDismiss.addEventListener('change', () => {
        if (tourDismiss.checked) {
          PT.storage.saveTour({ dismissed: true });
          Core.toast('已关闭自动新手引导', 'info', 1800);
        } else {
          PT.storage.resetTour();
          Core.toast('已恢复：加载示例时会显示新手引导', 'success', 2200);
        }
      });
    }
    syncHelpTourPreference();
    const tourReset = document.getElementById('help-tour-reset');
    if (tourReset) {
      tourReset.addEventListener('click', async () => {
        document.getElementById('help-modal').hidden = true;
        await loadSample({ reload: true, forceTour: true });
      });
    }
    document.getElementById('help-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('help-modal')) document.getElementById('help-modal').hidden = true;
    });
  }

  function closeAllModals() {
    if (PT.selectEditor && PT.selectEditor.isOpen()) PT.selectEditor.cancel();
    ['import-modal', 'paste-code-modal', 'select-modal', 'table-modal', 'versions-modal', 'help-modal'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
  }

  // ---------- Annotation JSON IO ----------
  function bindAnnotationIO() {
    const input = document.getElementById('annotation-file-input');
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      if (!state.loaded) {
        Core.toast('请先导入 HTML，再导入批注', 'info');
        return;
      }
      try {
        const text = await Core.readFileAsText(file);
        if (PT.annotations.list().length && !window.confirm('导入会替换当前批注，继续？')) return;
        const count = PT.annotations.importFile(text);
        PT.annotationUI.renderAll();
        scheduleSessionSave();
        Core.toast('已导入 ' + count + ' 条批注', 'success');
      } catch (err) {
        Core.toast('批注导入失败：' + (err && err.message ? err.message : '格式错误'), 'error');
      }
    });
  }

  // ---------- Save ----------
  async function saveDocument(saveAs) {
    if (!state.loaded) {
      Core.toast('还没有打开文档', 'info');
      return;
    }
    if (PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
    PT.inspector.commitActive();
    const clean = PT.export.cleanHtml();
    try {
      if (state.fileHandle && !saveAs) {
        await writeHandle(state.fileHandle, clean);
        await afterSave();
        Core.toast('已保存到 ' + state.fileName, 'success');
        return;
      }
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: state.fileName || 'prototype.html',
            types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }]
          });
          await writeHandle(handle, clean);
          state.fileHandle = handle;
          state.fileName = handle.name || state.fileName;
          updateFileChip();
          if (PT.tabs) PT.tabs.updateActiveFromApp(state.fileName, state.docId);
          await afterSave();
          Core.toast('已保存 ' + state.fileName, 'success');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      const name = Core.sanitizeFilename(state.fileName || 'prototype.html');
      Core.download(name, clean, 'text/html;charset=utf-8');
      await afterSave();
      Core.toast('已下载干净 HTML', 'success');
    } catch (err) {
      Core.toast('保存失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
  }

  async function writeHandle(handle, content) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async function afterSave() {
    await saveSessionNow();
    PT.versions.saveCurrent('export', '保存');
    if (PT.tabs) PT.tabs.markSaved();
  }

  async function closeDocument() {
    if (PT.tabs && PT.tabs.hasTabs()) {
      const active = PT.tabs.getActive();
      if (active) await PT.tabs.close(active.id);
      return;
    }
    showEmpty();
  }

  // ---------- Keyboard ----------
  function bindKeyboard() {
    document.addEventListener('keydown', handleKey, false);
  }

  function handleKey(e) {
    if (e.defaultPrevented) return;
    if (confirmPending) {
      if (e.key === 'Escape') {
        e.preventDefault();
        settleConfirm(false);
      }
      return;
    }
    const target = e.target;
    const editable = Core.isEditableTarget(target) || PT.textEdit.isEditing();
    const ctrl = e.ctrlKey || e.metaKey;

    if (e.key === 'Escape') {
      if (closeTopOverlay()) {
        e.preventDefault();
        return;
      }
      if (PT.annotations.isReanchor()) {
        PT.annotations.cancelReanchor();
        PT.annotationUI.renderBanner();
        e.preventDefault();
        return;
      }
      if (PT.annotations.isMode()) {
        exitAnnotation();
        e.preventDefault();
        return;
      }
      if (PT.textEdit.isEditing()) {
        PT.textEdit.finish({ commit: true });
        e.preventDefault();
        return;
      }
      if (PT.selection.getKind() === 'cell') {
        const table = PT.selection.getTable();
        if (table) {
          PT.selection.selectTable(table, PT.selection.getActiveCell());
          e.preventDefault();
          return;
        }
      }
      if (PT.selection.getSelected()) {
        PT.selection.clear();
        e.preventDefault();
        return;
      }
      closeAllMenus();
      return;
    }

    if (ctrl && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveDocument(!!e.shiftKey);
      return;
    }

    if (editable) return;

    if (ctrl && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) {
        e.preventDefault();
        PT.inspector.flushNudge();
        PT.history.redo();
        Core.toast('已重做', 'info', 1200);
      } else {
        e.preventDefault();
        PT.inspector.flushNudge();
        PT.history.undo();
        Core.toast('已撤销', 'info', 1200);
      }
      return;
    }
    if (ctrl && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      PT.inspector.flushNudge();
      PT.history.redo();
      Core.toast('已重做', 'info', 1200);
      return;
    }
    if (ctrl && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      PT.inspector.duplicate();
      return;
    }
    if (ctrl && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      setMode(state.mode === 'edit' ? 'preview' : 'edit');
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!state.loaded || state.mode !== 'edit' || PT.annotations.isMode()) return;
      if (PT.selection.getSelected()) {
        e.preventDefault();
        PT.inspector.deleteSelected();
      }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!state.loaded || state.mode !== 'edit' || PT.annotations.isMode()) return;
      const el = PT.selection.getSelected();
      if (!el || PT.selection.getKind() === 'cell') return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : (e.key === 'ArrowRight' ? step : 0);
      const dy = e.key === 'ArrowUp' ? -step : (e.key === 'ArrowDown' ? step : 0);
      PT.inspector.nudge(dx, dy);
    }
  }

  // ---------- Confirm dialog ----------
  let confirmPending = null;

  function initConfirm() {
    const modal = document.getElementById('pt-confirm');
    if (!modal) return;
    document.getElementById('pt-confirm-cancel').addEventListener('click', () => settleConfirm(false));
    document.getElementById('pt-confirm-ok').addEventListener('click', () => settleConfirm(true));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) settleConfirm(false);
    });
  }

  function confirmAction(message, options) {
    const opts = options || {};
    const modal = document.getElementById('pt-confirm');
    if (!modal) return Promise.resolve(window.confirm(message));
    if (PT.tour && PT.tour.isActive()) PT.tour.stop();
    if (confirmPending) settleConfirm(false);
    document.getElementById('pt-confirm-title').textContent = opts.title || '确认操作';
    document.getElementById('pt-confirm-message').textContent = message || '';
    document.getElementById('pt-confirm-ok').textContent = opts.confirmText || '确认';
    modal.hidden = false;
    const ok = document.getElementById('pt-confirm-ok');
    if (ok) setTimeout(() => ok.focus(), 0);
    return new Promise((resolve) => {
      confirmPending = { resolve, modal };
    });
  }

  function settleConfirm(result) {
    if (!confirmPending) return false;
    const pending = confirmPending;
    confirmPending = null;
    pending.modal.hidden = true;
    pending.resolve(!!result);
    return true;
  }

  function closeTopOverlay() {
    const confirmModal = document.getElementById('pt-confirm');
    if (confirmModal && !confirmModal.hidden) {
      settleConfirm(false);
      return true;
    }
    const ids = ['help-modal', 'versions-modal', 'table-modal', 'select-modal', 'import-modal', 'paste-code-modal'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && !el.hidden) {
        if (id === 'select-modal' && PT.selectEditor) PT.selectEditor.cancel();
        else el.hidden = true;
        return true;
      }
    }
    const card = document.getElementById('ann-card');
    if (card && !card.hidden) {
      PT.annotationUI.closeCard({ removeIfEmpty: true });
      return true;
    }
    const menus = Array.from(document.querySelectorAll('.menu')).some((m) => !m.hidden);
    if (menus) {
      closeAllMenus();
      return true;
    }
    return false;
  }

  // ---------- Window events ----------
  function bindWindowEvents() {
    window.addEventListener('beforeunload', (event) => {
      let message = '';
      const dirty = PT.tabs
        ? PT.tabs.getAll().filter((tab) => PT.tabs.isDirty(tab))
        : [];
      if (dirty.length) {
        message = dirty.length === 1
          ? '「' + (dirty[0].displayName || dirty[0].fileName || '当前文件') + '」有未保存的修改。是否保存此次更改？关闭前请确认。'
          : '有 ' + dirty.length + ' 个文件存在未保存的修改。是否保存此次更改？关闭前请确认。';
        // Modern browsers show their own translated confirmation. Setting
        // returnValue is what enables the native leave/cancel prompt.
        event.preventDefault();
        event.returnValue = message;
      }
      if (PT.tabs) {
        PT.tabs.snapshotActive();
        PT.tabs.persist();
      }
      PT.annotations.flush();
      saveSessionNow();
      return message || undefined;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (PT.tabs) {
          PT.tabs.snapshotActive();
          PT.tabs.persist();
        }
        PT.annotations.flush();
        saveSessionNow();
      }
    });
    window.addEventListener('resize', () => {
      if (PT.stage) PT.stage.scheduleLayout();
      PT.annotationUI.positionCard();
    });
    window.addEventListener('keydown', onInspectKeyDown, true);
    window.addEventListener('keyup', onInspectKeyUp, true);
    window.addEventListener('blur', () => setFastInspect(false));
  }

  // ---------- Public API ----------
  PT.app = {
    init,
    getMode: () => state.mode,
    isLoaded: () => state.loaded,
    isLoading: () => state.loading,
    canEdit,
    getFileName: () => state.fileName || 'prototype.html',
    getDocId: () => state.docId,
    getSourceHash: () => state.sourceHash,
    loadDocument,
    openTabDocument,
    loadFile,
    loadSample,
    pickFile,
    saveDocument,
    setMode,
    isFastInspect,
    setFastInspect,
    exitFastInspect,
    toggleAnnotation,
    exitAnnotation,
    updateStatus,
    updateFileChip,
    scheduleSessionSave,
    showWelcome,
    setRailTab,
    confirm: confirmAction
  };

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') {
    setTimeout(init, 0);
  }
})();
