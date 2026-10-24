/* ProtoTweak — version baselines */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let modal = null;
  let listEl = null;
  let lastHash = '';
  let saving = false;

  const autoSave = Core.debounce(() => { saveCurrent('auto', '自动快照'); }, 1800);

  function init() {
    modal = document.getElementById('versions-modal');
    listEl = document.getElementById('version-list');
    document.getElementById('version-close').addEventListener('click', closePanel);
    document.getElementById('version-save').addEventListener('click', saveManual);
    modal.addEventListener('click', (e) => { if (e.target === modal) closePanel(); });
    Core.on('history:commit', () => {
      if (PT.app && PT.app.isLoaded() && !PT.app.isLoading()) autoSave();
    });
    Core.on('stage:ready', () => { lastHash = ''; });
    Core.on('mode:change', () => { if (modal && !modal.hidden) closePanel(); });
  }

  async function saveCurrent(kind, label) {
    if (!PT.app || !PT.app.isLoaded() || !PT.stage.isReady()) return null;
    if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
    if (PT.inspector) PT.inspector.commitActive();
    if (saving) return null;
    saving = true;
    try {
      const html = PT.stage.serialize({ keepAid: false });
      const annData = PT.annotations.serializeData();
      const hash = Core.hashString(html + JSON.stringify(annData));
      if (kind === 'auto' && hash === lastHash) return null;
      lastHash = hash;
      const version = {
        id: Core.uid('ver'),
        docId: PT.app.getDocId(),
        fileName: PT.app.getFileName(),
        label: label || '快照',
        kind: kind || 'auto',
        createdAt: Core.nowIso(),
        html,
        annotations: annData,
        annotationCount: (annData.annotations || []).length,
        size: html.length
      };
      const saved = await PT.storage.saveVersion(version);
      if (saved) Core.emit('versions:change', { version: saved });
      return saved;
    } finally {
      saving = false;
    }
  }

  async function saveManual() {
    if (!PT.app || !PT.app.isLoaded()) {
      Core.toast('还没有打开文档', 'info');
      return;
    }
    const saved = await saveCurrent('manual', '手动基线');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const html = PT.stage.serialize({ keepAid: false });
    Core.download(PT.app.getFileName().replace(/\.html?$/i, '') + '.baseline-' + stamp + '.html', html, 'text/html;charset=utf-8');
    Core.toast(saved ? '已保存版本并下载基线' : '已下载基线（版本存储不可用）', saved ? 'success' : 'info');
  }

  async function openPanel() {
    if (!PT.app || !PT.app.isLoaded()) {
      Core.toast('还没有打开文档', 'info');
      return;
    }
    modal.hidden = false;
    await renderList();
  }

  function closePanel() {
    if (modal) modal.hidden = true;
  }

  async function renderList() {
    if (!listEl) return;
    const versions = await PT.storage.listVersions(PT.app.getDocId());
    listEl.innerHTML = '';
    if (!versions.length) {
      const empty = document.createElement('div');
      empty.className = 'version-empty';
      empty.textContent = '还没有版本快照。每次修改后会自动保存，最多保留 30 个。';
      listEl.appendChild(empty);
      return;
    }
    versions.forEach((v) => {
      const item = document.createElement('div');
      item.className = 'version-item';
      const size = Math.max(1, Math.round((v.size || 0) / 1024));
      item.innerHTML =
        '<div class="version-main">' +
        '  <div class="version-title">' + Core.escapeHtml(v.label || '快照') + ' <span class="version-kind">' + Core.escapeHtml(v.kind === 'manual' ? '手动' : (v.kind === 'export' ? '导出' : '自动')) + '</span></div>' +
        '  <div class="version-meta">' + Core.formatTime(v.createdAt, true) + ' · ' + size + ' KB · ' + (v.annotationCount || 0) + ' 条批注</div>' +
        '</div>' +
        '<div class="version-actions">' +
        '  <button class="btn small" data-action="restore">恢复</button>' +
        '  <button class="btn small" data-action="download">下载</button>' +
        '  <button class="btn small danger" data-action="delete">删除</button>' +
        '</div>';
      item.querySelector('[data-action="restore"]').addEventListener('click', () => restore(v));
      item.querySelector('[data-action="download"]').addEventListener('click', () => {
        Core.download(PT.app.getFileName().replace(/\.html?$/i, '') + '.version.html', v.html, 'text/html;charset=utf-8');
      });
      item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!window.confirm('删除这个版本快照？')) return;
        await PT.storage.deleteVersion(v.id);
        await renderList();
      });
      listEl.appendChild(item);
    });
  }

  async function restore(version) {
    if (!version) return;
    if (!window.confirm('恢复版本「' + (version.label || '快照') + '」？当前编辑内容会替换，但会自动保存为会话草稿。')) return;
    closePanel();
    await PT.app.loadDocument(version.html, {
      fileName: version.fileName || PT.app.getFileName(),
      docId: PT.app.getDocId(),
      sourceHash: PT.app.getSourceHash(),
      annotationsData: version.annotations,
      forceAnnotations: true,
      restoreVersion: true,
      skipVersion: true
    });
    Core.toast('版本已恢复', 'success');
  }

  PT.versions = {
    init,
    saveCurrent,
    saveManual,
    openPanel,
    closePanel,
    renderList,
    restore
  };
})();
