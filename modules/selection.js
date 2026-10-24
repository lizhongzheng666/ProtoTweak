/* ProtoTweak — selection, hover, table/cell state, blank click */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let selected = null;
  let kind = 'element'; // 'element' | 'table' | 'cell'
  let tableEl = null;
  let contextCell = null;
  let hovered = null;
  let boundDocs = new WeakSet();
  let layer = null;

  function mode() {
    return PT.app ? PT.app.getMode() : 'edit';
  }

  function annotationMode() {
    return PT.annotations && PT.annotations.isMode();
  }

  function ready() {
    return PT.stage && PT.stage.isReady();
  }

  function init() {
    layer = document.getElementById('selection-layer');
    Core.on('layout', render);
    Core.on('stage:body', () => { hovered = null; render(); });
    Core.on('mode:change', render);
    Core.on('annotations:mode', render);
  }

  function bind(doc) {
    if (!doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mouseover', onOver, true);
    doc.addEventListener('mouseleave', onLeave, true);
    doc.addEventListener('dragstart', onDragStart, true);
  }

  function onDragStart(e) {
    if (mode() !== 'preview' && !annotationMode()) e.preventDefault();
  }

  function onClick(e) {
    if (!ready()) return;
    if (mode() === 'preview' || annotationMode()) return;
    if (PT.pages && PT.pages.isSwitching()) return;
    if (PT.textEdit && PT.textEdit.isEditing()) return;
    if (PT.drag && PT.drag.consumeClickSuppression()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const target = e.target;
    if (!target || target.nodeType !== 1) {
      clear();
      return;
    }
    const doc = PT.stage.getDoc();
    if (target === doc.documentElement || target === doc.body) {
      clear();
      return;
    }

    // Keep the prototype's own click behavior. Only non-interactive canvas
    // clicks prevent text selection; links/buttons/inputs/selects/onclick
    // elements must still receive their native click and JS handlers.
    const interactive = target.closest
      ? target.closest('a, button, input, select, textarea, label, [contenteditable="true"], [role="button"], [role="link"], [onclick], [data-go], [data-href]')
      : null;
    if (!interactive) e.preventDefault();

    const table = target.closest ? target.closest('table') : null;
    if (table) {
      const cell = target.closest('td, th');
      // Whole table is the default click target. Alt+click (or a second
      // explicit cell action) opts into the cell/row-column size mode.
      if (e.altKey && cell) selectCell(cell);
      else selectTable(table, cell || contextCellIn(table) || firstCell(table));
      return;
    }
    select(target);
  }

  function onOver(e) {
    if (!ready()) return;
    if (mode() === 'preview') return;
    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    const doc = PT.stage.getDoc();
    if (target === doc.documentElement || target === doc.body) {
      hovered = null;
      render();
      return;
    }
    if (selected && (target === selected || selected.contains(target))) {
      hovered = null;
    } else {
      hovered = target;
    }
    render();
  }

  function onLeave() {
    hovered = null;
    render();
  }

  function firstCell(table) {
    if (!table) return null;
    return table.querySelector('td, th');
  }

  function contextCellIn(table) {
    return contextCell && table && table.contains(contextCell) ? contextCell : null;
  }

  function select(el, opts) {
    if (!el || !ready()) return;
    const doc = PT.stage.getDoc();
    if (el === doc.documentElement || el === doc.body) {
      clear();
      return;
    }
    if (el.tagName === 'TABLE') {
      selectTable(el, contextCellIn(el) || firstCell(el), opts);
      return;
    }
    if (el.tagName === 'TD' || el.tagName === 'TH') {
      selectCell(el, opts);
      return;
    }
    const table = el.closest ? el.closest('table') : null;
    if (table) {
      selectTable(table, el.closest('td, th') || firstCell(table), opts);
      return;
    }
    selected = el;
    kind = 'element';
    tableEl = null;
    contextCell = null;
    hovered = null;
    emitChange(opts);
    render();
  }

  function selectTable(table, cell, opts) {
    if (!table || table.tagName !== 'TABLE') return;
    selected = table;
    kind = 'table';
    tableEl = table;
    contextCell = cell && table.contains(cell) ? cell : firstCell(table);
    hovered = null;
    emitChange(opts);
    render();
  }

  function selectCell(cell, opts) {
    if (!cell || (cell.tagName !== 'TD' && cell.tagName !== 'TH')) return;
    const table = cell.closest('table');
    if (!table) return;
    selected = cell;
    kind = 'cell';
    tableEl = table;
    contextCell = cell;
    hovered = null;
    emitChange(opts);
    render();
  }

  function selectBySelector(selector, opts) {
    if (!selector || !ready()) return false;
    const el = PT.stage.resolve(selector);
    if (!el) return false;
    select(el, opts);
    return true;
  }

  function selectByAid(aid, opts) {
    if (!aid || !ready()) return false;
    const el = PT.anchors.queryByAid(aid);
    if (!el) return false;
    select(el, opts);
    return true;
  }

  function clear(opts) {
    selected = null;
    kind = 'element';
    tableEl = null;
    contextCell = null;
    hovered = null;
    if (!opts || !opts.silent) emitChange(opts);
    render();
  }

  function emitChange(opts) {
    Core.emit('selection:change', {
      element: selected,
      kind,
      cell: kind === 'cell' ? selected : contextCell,
      table: tableEl,
      silent: !!(opts && opts.silent)
    });
  }

  function get() {
    return {
      element: selected,
      kind,
      cell: kind === 'cell' ? selected : contextCell,
      table: tableEl
    };
  }

  function getSelected() { return selected; }
  function getActiveCell() { return kind === 'cell' ? selected : contextCell; }
  function getContextCell() { return contextCell; }
  function getTable() { return tableEl; }
  function getKind() { return kind; }
  function isTable() { return kind === 'table' && selected && selected.tagName === 'TABLE'; }
  function isCell() { return kind === 'cell'; }

  function cellPosition(cell) {
    if (!cell) return null;
    const table = cell.closest('table');
    if (!table) return null;
    const row = cell.parentElement;
    const rowIndex = Array.from(table.rows).indexOf(row);
    let col = 0;
    const cells = Array.from(row.cells);
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === cell) break;
      col += Math.max(1, cells[i].colSpan || 1);
    }
    return { row: rowIndex + 1, col: col + 1 };
  }

  function createBox(cls, rect, label) {
    const box = document.createElement('div');
    box.className = cls;
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = Math.max(1, rect.width) + 'px';
    box.style.height = Math.max(1, rect.height) + 'px';
    layer.appendChild(box);
    if (label) {
      const lab = document.createElement('div');
      lab.className = 'sel-label ' + (cls.indexOf('cell') !== -1 ? 'cell-label' : '');
      lab.textContent = label;
      lab.style.left = Math.max(0, rect.left) + 'px';
      lab.style.top = Math.max(0, rect.top - 20) + 'px';
      layer.appendChild(lab);
    }
  }

  function render() {
    if (!layer) return;
    layer.innerHTML = '';
    if (!ready() || mode() === 'preview' || annotationMode()) return;

    if (hovered && hovered !== selected && !(selected && selected.contains(hovered))) {
      try {
        PT.stage.elementRects(hovered).forEach((r) => {
          createBox('sel-box hover-box', PT.stage.toCanvas(r), '');
        });
      } catch (e) { /* ignore */ }
    }

    if (!selected) return;

    if (kind === 'cell') {
      // Draw the table as a light context frame, then the selected cell.
      if (tableEl) {
        try {
          PT.stage.elementRects(tableEl).forEach((r) => {
            createBox('sel-box table-context', PT.stage.toCanvas(r), '');
          });
        } catch (e) { /* ignore */ }
      }
      try {
        const boxes = PT.stage.elementRects(selected);
        boxes.forEach((r) => {
          createBox('sel-box cell-box', PT.stage.toCanvas(r), '');
        });
        const pos = cellPosition(selected);
        const rect = PT.stage.toCanvas(selected.getBoundingClientRect());
        const lab = document.createElement('div');
        lab.className = 'sel-label cell-label';
        lab.textContent = '单元格 ' + (pos ? 'R' + pos.row + 'C' + pos.col : '');
        lab.style.left = Math.max(0, rect.left) + 'px';
        lab.style.top = Math.max(0, rect.top - 20) + 'px';
        layer.appendChild(lab);
      } catch (e) { /* ignore */ }
      return;
    }

    try {
      const rects = PT.stage.elementRects(selected);
      const boxes = rects.length ? rects : [selected.getBoundingClientRect()];
      boxes.forEach((r) => {
        const label = boxes.length > 1 ? '' : (PT.anchors ? PT.anchors.elementLabel(selected) : selected.tagName.toLowerCase());
        createBox('sel-box', PT.stage.toCanvas(r), label);
      });
    } catch (e) { /* ignore */ }
  }

  PT.selection = {
    init,
    bind,
    select,
    selectTable,
    selectCell,
    selectBySelector,
    selectByAid,
    clear,
    get,
    getSelected,
    getActiveCell,
    getContextCell,
    getTable,
    getKind,
    isTable,
    isCell,
    firstCell,
    cellPosition,
    render
  };
})();
