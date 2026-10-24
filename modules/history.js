/* ProtoTweak — snapshot history with transactions */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let stack = [];
  let index = -1;
  let tx = null;
  let restoring = false;
  const MAX_STEPS = 60;
  const MAX_CHARS = 12000000;

  function ready() {
    return PT.stage && PT.stage.isReady();
  }

  function snapshot() {
    return ready() ? PT.stage.snapshotBody() : '';
  }

  function selectedRef() {
    if (!PT.selection) return null;
    const sel = PT.selection.get();
    if (!sel || !sel.element) return null;
    const el = sel.element;
    let selector = '';
    if (PT.anchors) selector = PT.anchors.generateSelector(el);
    const aid = el.getAttribute && el.getAttribute('data-pt-aid');
    return {
      selector,
      aid: aid || '',
      kind: sel.kind,
      label: PT.anchors ? PT.anchors.elementLabel(el) : el.tagName.toLowerCase(),
      cellSelector: sel.cell && PT.anchors ? PT.anchors.generateSelector(sel.cell) : '',
      tableSelector: sel.table && PT.anchors ? PT.anchors.generateSelector(sel.table) : ''
    };
  }

  function scrollRef() {
    return ready() ? PT.stage.getScroll() : { x: 0, y: 0 };
  }

  function emitChange() {
    Core.emit('history:change', {
      canUndo: History.canUndo(),
      canRedo: History.canRedo(),
      length: stack.length,
      index
    });
  }

  function enforceLimits() {
    while (stack.length > MAX_STEPS && stack.length > 1) {
      stack.shift();
      index--;
    }
    let total = 0;
    for (let i = 0; i < stack.length; i++) total += stack[i].html.length;
    while (total > MAX_CHARS && stack.length > 1) {
      total -= stack[0].html.length;
      stack.shift();
      index--;
    }
    if (index < 0) index = 0;
    if (index >= stack.length) index = stack.length - 1;
  }

  function makeEntry(html, label, meta, opts) {
    return {
      html,
      label: label || '编辑',
      meta: Object.assign({ kind: 'edit' }, meta || {}),
      selection: (opts && opts.selection) || selectedRef(),
      scroll: (opts && opts.scroll) || scrollRef(),
      at: Core.nowIso()
    };
  }

  const History = {
    init() {},

    reset() {
      tx = null;
      if (!ready()) {
        stack = [];
        index = -1;
        emitChange();
        return;
      }
      stack = [makeEntry(snapshot(), '打开文件', { kind: 'load' })];
      index = 0;
      emitChange();
    },

    clear() {
      stack = [];
      index = -1;
      tx = null;
      emitChange();
    },

    canUndo() { return index > 0; },
    canRedo() { return index >= 0 && index < stack.length - 1; },

    current() { return index >= 0 ? stack[index] : null; },

    begin(label, meta) {
      if (tx || !ready()) return false;
      tx = {
        label: label || '编辑',
        meta: Object.assign({ kind: 'edit' }, meta || {}),
        before: snapshot(),
        selection: selectedRef(),
        scroll: scrollRef(),
        startedAt: Core.nowIso()
      };
      return true;
    },

    updateMeta(patch) {
      if (!tx || !patch) return;
      Object.assign(tx.meta, patch);
    },

    cancel() {
      tx = null;
    },

    end(commit) {
      if (!tx) return false;
      const currentTx = tx;
      tx = null;
      if (commit === false) return false;
      if (!ready()) return false;
      const after = snapshot();
      if (after === currentTx.before) return false;
      // If an older external change moved the stack base, still keep relative entry.
      const entry = makeEntry(after, currentTx.label, currentTx.meta, {
        selection: selectedRef(),
        scroll: scrollRef()
      });
      stack = stack.slice(0, index + 1);
      stack.push(entry);
      index = stack.length - 1;
      enforceLimits();
      emitChange();
      Core.emit('history:commit', entry);
      return true;
    },

    commit(label, meta) {
      if (!ready()) return false;
      const after = snapshot();
      if (index >= 0 && stack[index] && stack[index].html === after) return false;
      const entry = makeEntry(after, label || '编辑', meta, {
        selection: selectedRef(),
        scroll: scrollRef()
      });
      stack = stack.slice(0, index + 1);
      stack.push(entry);
      index = stack.length - 1;
      enforceLimits();
      emitChange();
      Core.emit('history:commit', entry);
      return true;
    },

    undo() {
      if (tx) tx = null;
      if (!History.canUndo()) return false;
      if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: false });
      const current = stack[index];
      index--;
      restore(stack[index], current, 'undo');
      return true;
    },

    redo() {
      if (tx) tx = null;
      if (!History.canRedo()) return false;
      if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: false });
      const current = stack[index];
      index++;
      restore(stack[index], current, 'redo');
      return true;
    },

    getSelection() { return selectedRef(); },
    getEntries() { return stack.slice(); },
    getIndex() { return index; },
    hasTransaction() { return !!tx; }
  };

  function restore(entry, fromEntry, direction) {
    if (!entry || !ready()) return;
    restoring = true;
    try {
      if (PT.selection) PT.selection.clear({ silent: true });
      PT.stage.replaceBody(entry.html, entry.scroll);
      if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: false });
      if (entry.selection && PT.selection) {
        const ref = entry.selection;
        if (ref.kind === 'cell') {
          let cell = null;
          if (ref.aid) cell = PT.anchors.queryByAid(ref.aid);
          if (!cell && (ref.cellSelector || ref.selector)) {
            cell = PT.stage.resolve(ref.cellSelector || ref.selector);
          }
          if (cell && (cell.tagName === 'TD' || cell.tagName === 'TH')) {
            PT.selection.selectCell(cell, { silent: true });
          } else if (cell && cell.closest && cell.closest('td,th')) {
            PT.selection.selectCell(cell.closest('td,th'), { silent: true });
          }
        } else if (ref.kind === 'table') {
          let table = null;
          if (ref.aid) table = PT.anchors.queryByAid(ref.aid);
          if (!table && (ref.tableSelector || ref.selector)) {
            table = PT.stage.resolve(ref.tableSelector || ref.selector);
          }
          if (table && table.tagName === 'TABLE') {
            const cell = ref.cellSelector ? PT.stage.resolve(ref.cellSelector) : null;
            PT.selection.selectTable(table, cell, { silent: true });
          }
        } else {
          if (ref.aid) PT.selection.selectByAid(ref.aid, { silent: true });
          if (!PT.selection.get().element && ref.selector) {
            PT.selection.selectBySelector(ref.selector, { silent: true });
          }
        }
      }
      if (PT.annotations) PT.annotations.refreshAnchors('undo');
      if (PT.annotationUI) PT.annotationUI.closeCard({ removeIfEmpty: false });
      PT.stage.scheduleLayout();
      Core.emit('history:restore', { entry, from: fromEntry, direction });
    } finally {
      restoring = false;
      emitChange();
    }
  }

  PT.history = History;
})();
