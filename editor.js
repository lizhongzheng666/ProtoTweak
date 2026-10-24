/* ProtoTweak — application boot */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const state = {
    loaded: false,
    loading: false,
    mode: 'edit',
    fileName: null,
    fileHandle: null,
    sourceHash: '',
    docId: null,
    startedAt: null,
    lastSaveAt: null
  };

  const SAMPLE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>示例 PRD — 开发者选项面板</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 820px; margin: 32px auto; padding: 0 28px 60px; color: #1f2937; position: relative; min-height: 600px; line-height: 1.7; }
  h1 { font-size: 26px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; letter-spacing: -.4px; }
  h2 { font-size: 18px; margin-top: 30px; color: #1d4ed8; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th, td { border: 1px solid #e5e7eb; padding: 9px 12px; text-align: left; font-size: 13px; }
  th { background: #f8fafc; font-weight: 600; }
  ul { padding-left: 22px; }
  li { margin: 5px 0; }
  .tag { display: inline-block; padding: 2px 8px; background: #eff6ff; color: #2563eb; border-radius: 4px; font-size: 12px; }
  .floating-note { position: absolute; top: 96px; right: -26px; width: 168px; padding: 12px; background: #fffbeb; border: 1px solid #f59e0b; border-radius: 9px; font-size: 12px; color: #92400e; box-shadow: 0 3px 10px rgba(0,0,0,.08); }
  .actions-row { display: flex; gap: 10px; align-items: center; margin: 18px 0; }
  .btn-primary { padding: 9px 20px; background: #2563eb; color: #fff; border: 0; border-radius: 8px; font-size: 14px; cursor: pointer; }
  select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; font-size: 13px; }
</style>
</head>
<body>
  <h1>需求文档：开发者选项面板</h1>
  <p>试着点击任何元素，在右侧修改样式。双击文字直接编辑，拖拽可以直接移动。</p>
  <div class="floating-note">试试拖拽我<br>我是绝对定位元素，可以自由移动。</div>

  <h2>1. 背景</h2>
  <p>性能分析平台需要一个开发者选项面板，让高级用户开启实验性功能、查看调试信息、配置数据采集参数。</p>

  <div class="actions-row">
    <button class="btn-primary">保存设置</button>
    <select>
      <option>基础版</option>
      <option selected>专业版</option>
      <option>企业版</option>
    </select>
  </div>

  <h2>2. 功能模块</h2>
  <table>
    <thead><tr><th>模块</th><th>说明</th><th>优先级</th></tr></thead>
    <tbody>
      <tr><td>实验功能开关</td><td>开关列表，每项一行</td><td><span class="tag">P0</span></td></tr>
      <tr><td>调试日志</td><td>实时日志流，可过滤</td><td><span class="tag">P0</span></td></tr>
      <tr><td>采集参数配置</td><td>采样率、上报频率等</td><td><span class="tag">P1</span></td></tr>
    </tbody>
  </table>

  <h2>3. 边界情况</h2>
  <ul>
    <li>无权限用户访问该页面：跳转 403</li>
    <li>实验功能开关切换失败：toast 提示原因</li>
    <li>调试日志超过 10000 条：自动清理最早记录</li>
  </ul>
</body>
</html>`;

  let booted = false;
  function init() {
    if (booted) return;
    booted = true;
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
      ['confirm', initConfirm],
      ['versions', () => PT.versions.init()],
      ['changelog', () => PT.changelog.init()],
      ['export', () => PT.export.init()],
      ['stage-events', bindStageEvents],
      ['topbar', bindTopbar],
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

    restoreSession().then((restored) => {
      if (!restored) showEmpty();
    }).catch(() => showEmpty());
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

    doc.addEventListener('submit', (e) => {
      // Edit mode must not navigate the iframe; preview must let the
      // prototype's own submit handlers run.
      if (state.mode !== 'preview') e.preventDefault();
    }, true);
    doc.addEventListener('click', onDocumentClick, true);
    doc.addEventListener('keydown', handleKey, false);
    doc.addEventListener('dragstart', (e) => {
      if (state.mode === 'edit' && !PT.annotations.isMode()) e.preventDefault();
    }, true);
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

  // ---------- Document loading ----------
  async function loadDocument(rawHtml, opts) {
    const options = opts || {};
    if (state.loading) return;
    const html = String(rawHtml == null ? '' : rawHtml);
    if (!html.trim()) {
      Core.toast('HTML 内容为空', 'error');
      return;
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
    } catch (err) {
      state.loading = false;
      console.error(err);
      Core.toast('HTML 载入失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    } finally {
      document.body.classList.remove('loading-doc');
    }
  }

  async function loadFile(file, handle) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type && !/html/i.test(file.type)) {
      Core.toast('请选择 .html 或 .htm 文件', 'error');
      return;
    }
    try {
      const raw = await Core.readFileAsText(file);
      await loadDocument(raw, {
        fileName: file.name,
        sourceHash: Core.hashString(raw),
        fileHandle: handle || null
      });
    } catch (err) {
      Core.toast('文件读取失败', 'error');
    }
  }

  async function pickFile() {
    if (!window.showOpenFilePicker) {
      document.getElementById('file-input').click();
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'HTML',
          accept: { 'text/html': ['.html', '.htm'] }
        }]
      });
      const handle = handles && handles[0];
      if (!handle) return;
      const file = await handle.getFile();
      await loadFile(file, handle);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      document.getElementById('file-input').click();
    }
  }

  async function restoreSession() {
    try {
      const session = await PT.storage.loadLastSession();
      if (!session || !session.html) return false;
      await loadDocument(session.html, {
        fileName: session.fileName || 'prototype.html',
        sourceHash: session.sourceHash || '',
        docId: session.docId,
        fallbackAnnotations: session.annotations || null,
        restoreSession: true,
        skipSave: true,
        skipVersion: true
      });
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
    document.getElementById('status-mode').textContent = isPreview ? '预览模式' : (PT.annotations.isMode() ? '批注模式' : '编辑模式');
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
    if (PT.resize) PT.resize.refresh();
    PT.inspector.sync();
    PT.table.updateUI();
    PT.annotationUI.renderAll();
    updateUndoRedo();
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
    document.getElementById('status-mode').textContent = state.mode === 'preview' ? '预览模式' : (PT.annotations.isMode() ? '批注模式' : '编辑模式');
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
    document.getElementById('status-mode').textContent = mode === 'preview' ? '预览模式' : '编辑模式';
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
    document.getElementById('btn-import').addEventListener('click', () => openImportModal('file'));
    document.getElementById('btn-import-2').addEventListener('click', () => openImportModal('file'));
    document.getElementById('file-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) loadFile(file, null);
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

  function loadSample() {
    closeAllModals();
    loadDocument(SAMPLE_HTML, { fileName: 'sample.html', sourceHash: Core.hashString(SAMPLE_HTML) });
  }

  // ---------- Import ----------
  let importTab = 'file';
  function bindImport() {
    const modal = document.getElementById('import-modal');
    document.querySelectorAll('[data-import-tab]').forEach((b) => {
      b.addEventListener('click', () => switchImportTab(b.dataset.importTab));
    });
    document.getElementById('dz-pick').addEventListener('click', pickFile);
    document.getElementById('import-cancel').addEventListener('click', closeImportModal);
    document.getElementById('paste-ok').addEventListener('click', () => {
      const value = document.getElementById('paste-area').value.trim();
      if (!value) return;
      const html = /<html[\s>]/i.test(value)
        ? value
        : '<!doctype html><html><head><meta charset="utf-8"></head><body>' + value + '</body></html>';
      closeImportModal();
      loadDocument(html, { fileName: 'pasted.html', sourceHash: Core.hashString(html) });
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeImportModal(); });
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeImportModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && importTab === 'paste') {
        e.preventDefault();
        document.getElementById('paste-ok').click();
      }
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
    window.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (e.target && e.target.closest && e.target.closest('#dropzone')) return;
      e.preventDefault();
      loadFile(file, null);
    });
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') !== -1) e.preventDefault();
    });
  }

  function openImportModal(tab) {
    document.getElementById('import-modal').hidden = false;
    switchImportTab(tab || 'file');
  }

  function switchImportTab(tab) {
    importTab = tab === 'paste' ? 'paste' : 'file';
    document.querySelectorAll('[data-import-tab]').forEach((b) => b.classList.toggle('on', b.dataset.importTab === importTab));
    document.querySelectorAll('[data-import-pane]').forEach((p) => { p.hidden = p.dataset.importPane !== importTab; });
    document.getElementById('paste-ok').hidden = importTab !== 'paste';
    if (importTab === 'paste') setTimeout(() => document.getElementById('paste-area').focus(), 0);
  }

  function closeImportModal() {
    document.getElementById('import-modal').hidden = true;
    document.getElementById('paste-area').value = '';
  }

  // ---------- Modals ----------
  function bindModals() {
    document.getElementById('help-close').addEventListener('click', () => { document.getElementById('help-modal').hidden = true; });
    document.getElementById('help-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('help-modal')) document.getElementById('help-modal').hidden = true;
    });
  }

  function closeAllModals() {
    if (PT.selectEditor && PT.selectEditor.isOpen()) PT.selectEditor.cancel();
    ['import-modal', 'select-modal', 'table-modal', 'versions-modal', 'help-modal'].forEach((id) => {
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
  }

  async function closeDocument() {
    if (!state.loaded) return;
    if (!window.confirm('关闭当前文件？批注会保留在浏览器中；下次需要重新导入文件，或用版本历史恢复。')) return;
    PT.inspector.commitActive();
    if (PT.drag) PT.drag.cancel();
    if (PT.resize) PT.resize.cancel();
    if (PT.table && PT.table.cancelSize) PT.table.cancelSize();
    if (PT.ops) PT.ops.end();
    PT.annotations.flush();
    await saveSessionNow();
    await PT.storage.clearLastSession();
    PT.annotations.unload();
    PT.history.clear();
    PT.selection.clear({ silent: true });
    if (PT.pages) PT.pages.clear();
    state.loaded = false;
    state.fileName = null;
    state.fileHandle = null;
    state.docId = null;
    state.sourceHash = '';
    state.mode = 'edit';
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
    const ids = ['help-modal', 'versions-modal', 'table-modal', 'select-modal', 'import-modal'];
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
    window.addEventListener('beforeunload', () => {
      PT.annotations.flush();
      saveSessionNow();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        PT.annotations.flush();
        saveSessionNow();
      }
    });
    window.addEventListener('resize', () => {
      if (PT.stage) PT.stage.scheduleLayout();
      PT.annotationUI.positionCard();
    });
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
    loadFile,
    pickFile,
    saveDocument,
    setMode,
    toggleAnnotation,
    exitAnnotation,
    updateStatus,
    updateFileChip,
    scheduleSessionSave,
    confirm: confirmAction
  };

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') {
    setTimeout(init, 0);
  }
})();
