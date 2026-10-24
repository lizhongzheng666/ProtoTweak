/* ProtoTweak — inline text editing */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const TEXT_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'S',
    'LI', 'TD', 'TH', 'LABEL', 'BUTTON', 'BLOCKQUOTE', 'FIGCAPTION', 'CITE', 'SMALL', 'SUB',
    'SUP', 'MARK', 'CODE', 'PRE', 'DIV'
  ]);
  const BLOCK_CHILDREN = new Set([
    'DIV', 'P', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV',
    'UL', 'OL', 'TABLE', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'
  ]);

  let editing = null;
  let originalHTML = '';
  let dirty = false;
  let boundDocs = new WeakSet();

  function mode() { return PT.app ? PT.app.getMode() : 'edit'; }
  function annotationMode() { return PT.annotations && PT.annotations.isMode(); }

  function init() {}

  function bind(doc) {
    if (!doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    doc.addEventListener('dblclick', onDoubleClick, true);
  }

  function onDoubleClick(e) {
    if (mode() !== 'edit' || annotationMode()) return;
    const target = e.target;
    if (!target || target.nodeType !== 1) return;

    if (target.tagName === 'SELECT') {
      e.preventDefault();
      e.stopPropagation();
      if (PT.selectEditor) PT.selectEditor.open(target);
      return;
    }

    if (!isEditable(target)) {
      if (PT.selection) PT.selection.select(target);
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    start(target);
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (!TEXT_TAGS.has(tag)) return false;
    if (tag === 'DIV') {
      const direct = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      const hasBlock = Array.from(el.children).some((c) => BLOCK_CHILDREN.has(c.tagName));
      if (hasBlock) return false;
      if (!direct && !el.children.length) return false;
    }
    if (tag === 'TD' || tag === 'TH') return true;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'LABEL') return true;
    return !!el.textContent.trim() || ['P', 'DIV', 'LI'].indexOf(tag) !== -1;
  }

  function start(el) {
    if (!el || !el.isConnected) return;
    if (editing === el) return;
    finish({ commit: true });
    editing = el;
    originalHTML = el.innerHTML;
    dirty = false;

    const cell = el.closest ? el.closest('td,th') : null;
    if (cell) {
      PT.selection.selectCell(cell);
    } else {
      PT.selection.select(el);
    }

    if (PT.history) {
      PT.history.begin('编辑文字', {
        kind: 'text',
        target: PT.anchors ? PT.anchors.elementLabel(el) : el.tagName.toLowerCase(),
        before: Core.truncate(Core.normalizeText(el.textContent), 80)
      });
    }

    el.setAttribute('data-pt-ce', '1');
    el.setAttribute('data-pt-editing', '1');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('input', onInput);
    el.addEventListener('blur', onBlur);
    try { el.focus(); } catch (e) { /* ignore */ }
    selectAll(el);
    if (PT.stage) PT.stage.scheduleLayout();
    Core.emit('text:start', { element: el });
  }

  function selectAll(el) {
    try {
      const doc = el.ownerDocument;
      const range = doc.createRange();
      range.selectNodeContents(el);
      const selection = doc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (e) { /* ignore */ }
  }

  function onKeyDown(e) {
    if (!editing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish({ commit: true });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      finish({ commit: true });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        insertBreak();
      } else {
        finish({ commit: true });
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      finish({ commit: true });
    }
  }

  function insertBreak() {
    try {
      const doc = editing.ownerDocument;
      const selection = doc.defaultView.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const br = doc.createElement('br');
      range.insertNode(br);
      const after = doc.createTextNode('\u200b');
      br.parentNode.insertBefore(after, br.nextSibling);
      range.setStart(after, 1);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      dirty = true;
    } catch (e) { /* ignore */ }
  }

  function onInput() {
    dirty = true;
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function onBlur() {
    if (editing) finish({ commit: true });
  }

  function finish(opts) {
    if (!editing) return;
    const el = editing;
    const chooseCommit = !opts || opts.commit !== false;
    editing = null;
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('input', onInput);
    el.removeEventListener('blur', onBlur);
    el.removeAttribute('data-pt-ce');
    el.removeAttribute('data-pt-editing');
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    const changed = dirty || el.innerHTML !== originalHTML;
    dirty = false;

    if (!el.isConnected) {
      if (PT.history) PT.history.cancel();
      if (PT.stage) PT.stage.scheduleLayout();
      Core.emit('text:finish', { element: el, changed: false });
      return;
    }

    if (changed && chooseCommit && PT.history) {
      PT.history.updateMeta({
        after: Core.truncate(Core.normalizeText(el.textContent), 80)
      });
      PT.history.end(true);
    } else if (PT.history) {
      PT.history.cancel();
    }

    if (changed && PT.annotations) PT.annotations.refreshAnchors('text');
    if (el.isConnected && PT.selection) {
      const cell = el.closest ? el.closest('td,th') : null;
      if (cell) PT.selection.selectCell(cell);
      else PT.selection.select(el);
    }
    if (PT.stage) PT.stage.scheduleLayout();
    Core.emit('text:finish', { element: el, changed });
  }

  function isEditing() {
    return !!editing;
  }

  function getEditing() {
    return editing;
  }

  PT.textEdit = {
    init,
    bind,
    start,
    finish,
    isEditing,
    getEditing,
    isEditable
  };
})();
