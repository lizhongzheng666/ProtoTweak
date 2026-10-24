/* ProtoTweak — change summary in Markdown */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let entries = [];
  let startedAt = null;

  function init() {
    Core.on('history:commit', onHistoryCommit);
    Core.on('annotations:event', onAnnotationEvent);
  }

  function startSession() {
    entries = [];
    startedAt = Core.nowIso();
  }

  function onHistoryCommit(entry) {
    if (!entry) return;
    const meta = entry.meta || {};
    const parts = [];
    if (meta.property && meta.before !== undefined) parts.push(meta.property + '：' + String(meta.before || '默认') + ' → ' + String(meta.after || '默认'));
    if (meta.dx !== undefined || meta.dy !== undefined) parts.push('偏移 ' + (meta.dx || 0) + ', ' + (meta.dy || 0) + 'px');
    if (meta.kind === 'resize') parts.push('缩放 ' + (meta.dir || '') + ' → ' + (meta.width || 0) + '×' + (meta.height || 0));
    if (meta.op) parts.push(meta.op + (meta.cell ? ' @ ' + meta.cell : ''));
    if (meta.tags) parts.push(meta.tags);
    if (meta.count) parts.push(meta.count + ' 个节点');
    if (meta.fileName) parts.push(meta.fileName);
    entries.push({
      at: entry.at || Core.nowIso(),
      kind: meta.kind || 'edit',
      label: entry.label || '编辑',
      target: entry.selection ? (entry.selection.label || entry.selection.selector || '') : '',
      selector: entry.selection ? (entry.selection.selector || '') : '',
      detail: parts.join('；')
    });
  }

  function onAnnotationEvent(evt) {
    if (!evt) return;
    const labels = { add: '新增批注', update: '编辑批注', remove: '删除批注', reanchor: '重新锚定', import: '导入批注' };
    if (!labels[evt.action]) return;
    entries.push({
      at: Core.nowIso(),
      kind: 'annotation',
      label: labels[evt.action],
      target: evt.seq ? '#' + evt.seq : '',
      selector: '',
      detail: evt.count ? evt.count + ' 条' : ''
    });
  }

  function record(item) {
    if (item) entries.push(item);
  }

  function buildMarkdown() {
    const anns = PT.annotations.list();
    const counts = PT.annotations.counts();
    const file = PT.app && PT.app.isLoaded() ? PT.app.getFileName() : 'prototype';
    const doc = PT.stage.getDoc();
    const lines = [];
    lines.push('# 变更摘要 — ' + file);
    lines.push('');
    lines.push('- 文档标题：' + (doc ? doc.title || '（无标题）' : '（无）'));
    lines.push('- 导出时间：' + Core.formatTime(Core.nowIso(), true));
    lines.push('- 会话开始：' + (startedAt ? Core.formatTime(startedAt, true) : '—'));
    lines.push('- 修改记录：' + entries.filter((e) => e.kind !== 'annotation').length + ' 条');
    lines.push('- 批注：' + counts.total + ' 条（未解决 ' + counts.open + '，已解决 ' + counts.resolved + '，孤立 ' + counts.orphan + '）');
    lines.push('');
    lines.push('## 一、批注清单');
    lines.push('');
    if (!anns.length) {
      lines.push('_本次会话没有批注。_');
    } else {
      lines.push('| # | 类型 | 状态 | 元素 | 选择器 | 批注内容 | PRD 引用 |');
      lines.push('|---|---|---|---|---|---|---|');
      anns.forEach((a) => {
        const status = a._orphan ? '孤立' : (PT.annotations.STATUS_LABELS[a.status] || a.status);
        lines.push('| ' + a.seq + ' | ' + (PT.annotations.TYPE_LABELS[a.type] || a.type) + ' | ' + status + ' | ' +
          Core.mdCell(a.anchor && a.anchor.tag ? a.anchor.tag : '') + ' | ' +
          Core.mdCode(a.selector || '') + ' | ' +
          Core.mdCell(a.content || '') + ' | ' +
          Core.mdCell(a.prdRef || '') + ' |');
      });
    }
    lines.push('');

    const unresolved = anns.filter((a) => a.status === 'open' && !a._orphan);
    if (unresolved.length) {
      lines.push('## 二、给开发确认的未解决项');
      lines.push('');
      unresolved.forEach((a) => {
        lines.push('- **#' + a.seq + ' ' + (PT.annotations.TYPE_LABELS[a.type] || a.type) + '**：' + (a.content || '（空）') +
          (a.prdRef ? '（' + a.prdRef + '）' : '') + ' — ' + Core.mdCode(a.selector || ''));
      });
      lines.push('');
    }

    const orphan = anns.filter((a) => a._orphan);
    if (orphan.length) {
      lines.push('## 三、孤立批注');
      lines.push('');
      orphan.forEach((a) => {
        lines.push('- **#' + a.seq + '**：' + (a.content || '（空）') + ' — 原锚点 `' + (a.selector || '') + '` 已找不到，需要重新锚定或删除。');
      });
      lines.push('');
    }

    lines.push('## 四、本次修改清单');
    lines.push('');
    const changes = entries.filter((e) => e.kind !== 'annotation');
    if (!changes.length) {
      lines.push('_没有记录到修改。_');
    } else {
      lines.push('| 时间 | 类型 | 描述 | 目标 | 详情 |');
      lines.push('|---|---|---|---|---|');
      changes.forEach((e) => {
        lines.push('| ' + Core.formatTime(e.at, true) + ' | ' + Core.mdCell(e.kind) + ' | ' + Core.mdCell(e.label) +
          ' | ' + Core.mdCell(e.target) + ' | ' + Core.mdCell(e.detail) + ' |');
      });
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('_由 ProtoTweak 导出。选择器以页面 DOM 为准，可直接交给 AI 或开发定位元素。_');
    return lines.join('\n');
  }

  function download() {
    if (!PT.app || !PT.app.isLoaded()) {
      Core.toast('还没有打开文档', 'info');
      return;
    }
    if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
    if (PT.inspector) PT.inspector.commitActive();
    const name = Core.fileNameWithoutExt(PT.app.getFileName()) + '.change-summary.md';
    Core.download(name, buildMarkdown(), 'text/markdown;charset=utf-8');
    Core.toast('变更摘要已导出', 'success');
  }

  PT.changelog = {
    init,
    startSession,
    record,
    buildMarkdown,
    download
  };
})();
