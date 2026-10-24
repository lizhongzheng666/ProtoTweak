/* ProtoTweak — paste-code dialog with line numbers */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;
  const PLACEHOLDER = '在此粘贴完整 HTML 或代码片段…';

  let modal = null;
  let textarea = null;
  let lines = null;
  let badge = null;
  let lastActive = null;
  const boundDocs = new WeakSet();

  function init() {
    modal = document.getElementById('paste-code-modal');
    textarea = document.getElementById('code-input');
    lines = document.getElementById('code-lines');
    badge = document.getElementById('code-type-badge');
    if (!modal || !textarea || !lines || !badge) return;

    textarea.placeholder = PLACEHOLDER;
    document.getElementById('welcome-paste-code').addEventListener('click', () => open(''));
    document.getElementById('paste-code-close').addEventListener('click', close);
    document.getElementById('paste-code-cancel').addEventListener('click', close);
    document.getElementById('paste-code-confirm').addEventListener('click', confirmImport);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    textarea.addEventListener('input', update);
    textarea.addEventListener('scroll', () => { lines.scrollTop = textarea.scrollTop; });
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        confirmImport();
      }
    });

    bind(document);
  }

  function bind(doc) {
    if (!doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    doc.addEventListener('paste', onDocumentPaste, true);
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function hasImage(data) {
    if (!data || !data.items) return false;
    for (const item of data.items) {
      if (item.type && item.type.indexOf('image/') === 0) return true;
    }
    return false;
  }

  function onDocumentPaste(e) {
    if (!modal || !modal.hidden) return;
    if (isEditable(e.target)) return;
    if (e.defaultPrevented) return;
    if (hasImage(e.clipboardData)) return;

    // Preserve the existing "paste into selected element" behavior when the
    // canvas has a selection. Code pasting is for the editor shell/welcome.
    if (PT.selection && PT.selection.getSelected()) return;

    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    open(text);
  }

  function open(text) {
    if (!modal) init();
    if (!modal) return;
    lastActive = document.activeElement;
    textarea.value = text || '';
    update();
    modal.hidden = false;
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 0);
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    textarea.value = '';
    if (lastActive && lastActive.focus) {
      try { lastActive.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function update() {
    const value = textarea.value || '';
    const count = value ? value.split('\n').length : 1;
    const nums = [];
    for (let i = 1; i <= count; i++) nums.push(String(i));
    lines.textContent = nums.join('\n');
    lines.scrollTop = textarea.scrollTop;
    const htmlLike = /<(!doctype\s+html|html|head|body|div|section|main|span|style|script|table|button|input|textarea|select|form)\b/i.test(value);
    badge.textContent = htmlLike ? 'HTML' : '纯文本';
    badge.classList.toggle('is-html', htmlLike);
  }

  function confirmImport() {
    const raw = (textarea.value || '').trim();
    if (!raw) {
      Core.toast('请先粘贴或输入一些代码', 'info', 1800);
      textarea.focus();
      return;
    }
    const html = /<!doctype\s+html|<html[\s>]/i.test(raw)
      ? raw
      : '<!doctype html><html><head><meta charset="utf-8"></head><body>' + raw + '</body></html>';
    close();
    if (PT.tabs) {
      PT.tabs.openPasted(html);
      Core.toast('已从粘贴代码创建新标签', 'success', 1800);
    } else if (PT.app) {
      PT.app.loadDocument(html, { fileName: '粘贴的html1.html', sourceHash: Core.hashString(html) });
    }
  }

  PT.pasteCode = { init, open, close, bind };
})();
