/* ProtoTweak — table cell mode, row/column operations, row/column sizing */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const MIN_COL = 32;
  const MIN_ROW = 24;

  let layer = null;
  let contextBar = null;
  let handleMeta = null;
  let sizeDrag = null;
  let sizeRaf = 0;

  function init() {
    layer = document.getElementById('table-layer');
    contextBar = document.getElementById('table-context');

    Core.$$('[data-table-op]').forEach((btn) => {
      btn.addEventListener('click', () => applyOperation(btn.dataset.tableOp));
    });

    createHandles();

    Core.on('selection:change', () => { updateUI(); refreshHandles(); });
    Core.on('layout', positionHandles);
    Core.on('mode:change', () => { updateUI(); refreshHandles(); });
    Core.on('annotations:mode', () => { updateUI(); refreshHandles(); });
    Core.on('ops:change', () => { updateUI(); refreshHandles(); });
    Core.on('history:restore', () => { updateUI(); refreshHandles(); });
    Core.on('text:start', () => hideHandles());
    Core.on('text:finish', () => refreshHandles());
    Core.on('stage:ready', ({ doc }) => {
      if (!doc) return;
      doc.addEventListener('pointermove', onHandlePointerMove, true);
      doc.addEventListener('pointerup', onHandlePointerUp, true);
      doc.addEventListener('pointercancel', onHandlePointerUp, true);
    });
    window.addEventListener('resize', refreshHandles);

    updateUI();
  }

  function mode() { return PT.app ? PT.app.getMode() : 'edit'; }
  function annotationMode() { return PT.annotations && PT.annotations.isMode(); }
  function busy() { return PT.ops && PT.ops.isBusy(); }

  function eventPoint(e) {
    const iframe = PT.stage ? PT.stage.getIframe() : null;
    if (!iframe) return { x: e.clientX, y: e.clientY };
    const fromIframe = !!(e.view && iframe.contentWindow && e.view === iframe.contentWindow);
    const r = fromIframe ? iframe.getBoundingClientRect() : null;
    return {
      x: e.clientX + (r ? r.left : 0),
      y: e.clientY + (r ? r.top : 0)
    };
  }

  function currentTable() {
    const sel = PT.selection ? PT.selection.get() : null;
    if (!sel || (sel.kind !== 'table' && sel.kind !== 'cell')) return null;
    return sel.table || (sel.element && sel.element.tagName === 'TABLE' ? sel.element : null);
  }

  function currentCell() {
    const sel = PT.selection ? PT.selection.get() : null;
    if (!sel) return null;
    if (sel.kind === 'cell' && sel.element) return sel.element;
    if (sel.kind === 'table') {
      const table = sel.table || sel.element;
      const cell = sel.cell;
      return cell && table && table.contains(cell) ? cell : firstCell(table);
    }
    return null;
  }

  function firstCell(table) {
    return table ? table.querySelector('td, th') : null;
  }

  // Screen rect / untransformed CSS rect. If the table itself has a CSS
  // transform: scale(), pointer deltas and handle positions must be converted.
  function tableScale(table) {
    const rect = table.getBoundingClientRect();
    const w = table.offsetWidth || rect.width || 1;
    const h = table.offsetHeight || rect.height || 1;
    return {
      x: rect.width > 0 ? rect.width / w : 1,
      y: rect.height > 0 ? rect.height / h : 1
    };
  }

  function updateUI() {
    const table = currentTable();
    const sel = PT.selection ? PT.selection.get() : null;
    const visible = !!(table && mode() === 'edit' && !annotationMode());
    if (contextBar) {
      contextBar.hidden = !visible;
      if (visible) {
        const grid = buildGrid(table);
        document.getElementById('table-context-label').textContent = grid.rowCount + ' 行 × ' + grid.colCount + ' 列';
        const cell = currentCell();
        const pos = PT.selection.cellPosition(cell);
        document.getElementById('table-cell-label').textContent = pos ? 'R' + pos.row + 'C' + pos.col : '—';
        const hint = document.getElementById('table-context-hint');
        if (hint) {
          hint.textContent = sel.kind === 'table'
            ? '整表：拖动/8向缩放 · 单击单元格进入 · 双击单元格编辑'
            : '单元格：双击编辑 · Esc/右侧「选择整表」返回整表';
        }
      }
    }
    if (!visible || !sel || (busy() && !sizeDrag)) hideHandles();
  }

  // ---------- Grid ----------
  function buildGrid(table) {
    const rows = table ? Array.from(table.rows) : [];
    const occupancy = rows.map(() => []);
    const entries = [];
    let colCount = 0;
    rows.forEach((tr, r) => {
      let c = 0;
      Array.from(tr.cells).forEach((cell) => {
        while (occupancy[r][c]) c++;
        const rowSpan = Math.max(1, cell.rowSpan || 1);
        const colSpan = Math.max(1, cell.colSpan || 1);
        for (let rr = r; rr < r + rowSpan && rr < rows.length; rr++) {
          for (let cc = c; cc < c + colSpan; cc++) occupancy[rr][cc] = cell;
        }
        entries.push({ cell, row: r, col: c, rowSpan, colSpan });
        c += colSpan;
        colCount = Math.max(colCount, c);
      });
    });
    for (let r = 0; r < rows.length; r++) colCount = Math.max(colCount, occupancy[r].length);
    return { rows, occupancy, entries, rowCount: rows.length, colCount };
  }

  function entryForCell(grid, cell) {
    return grid.entries.find((e) => e.cell === cell) || null;
  }

  function cellForColumnInRow(grid, rowIndex, col) {
    return grid.occupancy[rowIndex] && grid.occupancy[rowIndex][col] ? grid.occupancy[rowIndex][col] : null;
  }

  function copyCellStyle(from, to) {
    if (!from || !to) return;
    try {
      to.className = from.className || '';
      const style = from.getAttribute('style');
      if (style) to.setAttribute('style', style);
      ['scope', 'align', 'valign', 'headers'].forEach((attr) => {
        if (from.hasAttribute(attr)) to.setAttribute(attr, from.getAttribute(attr));
      });
    } catch (e) { /* ignore */ }
  }

  function makeCell(tag, from) {
    const cell = PT.stage.getDoc().createElement(tag);
    copyCellStyle(from, cell);
    return cell;
  }

  // ---------- Row / column operations ----------
  function applyOperation(op) {
    const table = currentTable();
    const cell = currentCell();
    if (!table || !cell) {
      Core.toast('请先选中表格或单元格', 'info');
      return;
    }
    if (mode() !== 'edit' || annotationMode() || busy()) return;
    const grid = buildGrid(table);
    const entry = entryForCell(grid, cell);
    if (!entry) return;
    if (PT.inspector) PT.inspector.commitActive();

    const wasCell = PT.selection.getKind() === 'cell';
    const labels = {
      'row-add': '插入行',
      'row-del': '删除行',
      'col-add': '插入列',
      'col-del': '删除列'
    };
    const label = labels[op] || '表格编辑';
    const run = () => {
      if (!table.isConnected || !cell.isConnected) return;
      if (PT.history) {
        PT.history.begin(label, {
          kind: 'table',
          op,
          cell: cellLabel(cell),
          table: grid.rowCount + '×' + grid.colCount
        });
      }
      if (op === 'row-add') addRow(table, cell, 'after', wasCell);
      else if (op === 'row-del') deleteRow(table, cell, wasCell);
      else if (op === 'col-add') addColumn(table, cell, 'after', wasCell);
      else if (op === 'col-del') deleteColumn(table, cell, wasCell);
    };
    if (op === 'row-del' || op === 'col-del') {
      PT.app.confirm('确认删除当前' + (op === 'row-del' ? '行' : '列') + '？此操作可用 Ctrl+Z 撤销。', {
        title: op === 'row-del' ? '删除行' : '删除列',
        confirmText: '删除'
      }).then((ok) => { if (ok) run(); });
      return;
    }
    run();
  }

  function addRow(table, cell, where, wasCell) {
    const doc = PT.stage.getDoc();
    const refTr = cell.parentElement;
    const section = refTr.parentElement;
    const refIndex = Array.from(table.rows).indexOf(refTr);
    const newIndex = where === 'before' ? refIndex : refIndex + 1;
    const grid = buildGrid(table);
    const covered = new Set();
    grid.entries.forEach((e) => {
      if (e.row < newIndex && e.row + e.rowSpan > newIndex) {
        e.cell.rowSpan = e.rowSpan + 1;
        for (let c = e.col; c < e.col + e.colSpan; c++) covered.add(c);
      }
    });
    const tr = doc.createElement('tr');
    for (let c = 0; c < grid.colCount; c++) {
      if (covered.has(c)) continue;
      const ref = cellForColumnInRow(grid, refIndex, c) || cell;
      const tag = section.tagName === 'THEAD' ? 'th' : 'td';
      const td = makeCell(tag, ref);
      td.textContent = '';
      tr.appendChild(td);
    }
    if (where === 'before') section.insertBefore(tr, refTr);
    else section.insertBefore(tr, refTr.nextSibling);

    const nextCell = tr.cells[0] || cell;
    afterStructureChange(table, nextCell, wasCell);
    Core.toast('已插入行', 'success');
  }

  function deleteRow(table, cell, wasCell) {
    if (table.rows.length <= 1) {
      if (PT.history) PT.history.cancel();
      Core.toast('无法删除最后一行', 'info');
      return;
    }
    const tr = cell.parentElement;
    const rowIndex = Array.from(table.rows).indexOf(tr);
    const grid = buildGrid(table);
    grid.entries.forEach((e) => {
      if (e.row < rowIndex && e.row + e.rowSpan > rowIndex) {
        e.cell.rowSpan = Math.max(1, e.rowSpan - 1);
      }
    });
    const next = tr.nextElementSibling || tr.previousElementSibling;
    tr.remove();
    const nextCell = next ? next.querySelector('td,th') : null;
    afterStructureChange(table, nextCell || firstCell(table), wasCell);
    Core.toast('已删除行', 'success');
  }

  function addColumn(table, cell, where, wasCell) {
    const doc = PT.stage.getDoc();
    const grid = buildGrid(table);
    const entry = entryForCell(grid, cell);
    if (!entry) return;
    const targetCol = where === 'before' ? entry.col : entry.col + entry.colSpan;

    const seen = new Set();
    grid.entries.forEach((e) => {
      if (e.col < targetCol && e.col + e.colSpan > targetCol) {
        if (!seen.has(e.cell)) {
          seen.add(e.cell);
          e.cell.colSpan = e.colSpan + 1;
        }
      }
    });

    let firstNew = null;
    Array.from(table.rows).forEach((tr, r) => {
      const covering = cellForColumnInRow(grid, r, targetCol);
      if (covering) {
        const coverEntry = entryForCell(grid, covering);
        if (coverEntry && coverEntry.col < targetCol) return;
      }
      const tag = tr.parentElement && tr.parentElement.tagName === 'THEAD' ? 'th' : 'td';
      const refEntry = grid.entries
        .filter((e) => e.row === r && e.col >= targetCol)
        .sort((a, b) => a.col - b.col)[0];
      const refCell = refEntry ? refEntry.cell : (tr.cells[tr.cells.length - 1] || cell);
      const td = makeCell(tag, refCell);
      td.textContent = '';
      if (refEntry) tr.insertBefore(td, refEntry.cell);
      else tr.appendChild(td);
      if (!firstNew) firstNew = td;
    });

    afterStructureChange(table, firstNew || cell, wasCell);
    Core.toast('已插入列', 'success');
  }

  function deleteColumn(table, cell, wasCell) {
    const grid = buildGrid(table);
    if (grid.colCount <= 1) {
      if (PT.history) PT.history.cancel();
      Core.toast('无法删除最后一列', 'info');
      return;
    }
    const entry = entryForCell(grid, cell);
    if (!entry) return;
    const targetCol = entry.col;
    const cells = new Set();
    grid.entries.forEach((e) => {
      if (e.col <= targetCol && e.col + e.colSpan > targetCol) cells.add(e.cell);
    });
    cells.forEach((c) => {
      if ((c.colSpan || 1) > 1) c.colSpan = (c.colSpan || 1) - 1;
      else if (c.parentNode) c.remove();
    });
    afterStructureChange(table, firstCell(table), wasCell);
    Core.toast('已删除列', 'success');
  }

  function afterStructureChange(table, cell, wasCell) {
    if (PT.annotations) PT.annotations.refreshAnchors('structure');
    if (PT.history) PT.history.end(true);
    if (wasCell && cell) PT.selection.selectCell(cell);
    else PT.selection.selectTable(table, cell || firstCell(table));
    PT.stage.scheduleLayout();
    updateUI();
    refreshHandles();
  }

  function cellLabel(cell) {
    const pos = PT.selection.cellPosition(cell);
    return pos ? 'R' + pos.row + 'C' + pos.col : '';
  }

  // ---------- Persistent row/column handles ----------
  // Every column/row gets a handle on selection changes. The handlers are
  // delegated from the layer, so rebuilding handle nodes never re-binds events.
  function createHandles() {
    if (!layer) return;
    layer.addEventListener('pointerdown', onHandleDown, true);
    layer.addEventListener('click', swallowHandleClick, true);
    window.addEventListener('pointermove', onHandlePointerMove, true);
    window.addEventListener('pointerup', onHandlePointerUp, true);
    window.addEventListener('pointercancel', onHandlePointerUp, true);
  }

  function swallowHandleClick(e) {
    const handle = e.target && e.target.closest ? e.target.closest('.table-handle') : null;
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function hideHandles() {
    if (layer) layer.innerHTML = '';
    handleMeta = null;
  }

  function refreshHandles() {
    if (sizeDrag) return;
    if (PT.textEdit && PT.textEdit.isEditing()) return hideHandles();
    const sel = PT.selection ? PT.selection.get() : null;
    const table = currentTable();
    if (!table || !sel || (sel.kind !== 'table' && sel.kind !== 'cell') ||
        mode() !== 'edit' || annotationMode() || busy()) {
      hideHandles();
      return;
    }
    if (!layer) return;

    const grid = buildGrid(table);
    const scale = tableScale(table);
    const tableRect = PT.stage.toCanvas(table.getBoundingClientRect());
    if (!tableRect || tableRect.width <= 0 || tableRect.height <= 0) return hideHandles();
    const widths = columnWidths(table, grid);

    layer.innerHTML = '';
    handleMeta = { table, tableRect, cols: [], rows: [] };

    let x = tableRect.left;
    for (let c = 0; c < widths.length; c++) {
      x += Math.max(1, widths[c]) * scale.x;
      const handle = document.createElement('div');
      handle.className = 'table-handle col-handle';
      handle.dataset.col = String(c);
      handle.title = '拖拽调整第 ' + (c + 1) + ' 列宽度';
      handle.style.left = (x - 4) + 'px';
      handle.style.top = tableRect.top + 'px';
      handle.style.height = tableRect.height + 'px';
      layer.appendChild(handle);
      handleMeta.cols.push({ el: handle, col: c, offsetX: x - tableRect.left });
    }

    Array.from(table.rows).forEach((tr, r) => {
      const rowRect = PT.stage.toCanvas(tr.getBoundingClientRect());
      if (!rowRect || rowRect.height <= 0) return;
      const y = rowRect.top + rowRect.height;
      const handle = document.createElement('div');
      handle.className = 'table-handle row-handle';
      handle.dataset.row = String(r);
      handle.title = '拖拽调整第 ' + (r + 1) + ' 行高度';
      handle.style.left = tableRect.left + 'px';
      handle.style.top = (y - 4) + 'px';
      handle.style.width = tableRect.width + 'px';
      layer.appendChild(handle);
      handleMeta.rows.push({ el: handle, row: r, offsetY: y - tableRect.top });
    });
  }

  function positionHandles() {
    if (!handleMeta || busy() || !currentTable()) return;
    const rect = PT.stage.toCanvas(handleMeta.table.getBoundingClientRect());
    if (Math.abs(rect.width - handleMeta.tableRect.width) > 1 ||
        Math.abs(rect.height - handleMeta.tableRect.height) > 1) {
      refreshHandles();
      return;
    }
    handleMeta.cols.forEach((h) => {
      h.el.style.left = (rect.left + h.offsetX - 4) + 'px';
      h.el.style.top = rect.top + 'px';
      h.el.style.height = rect.height + 'px';
    });
    handleMeta.rows.forEach((h) => {
      h.el.style.left = rect.left + 'px';
      h.el.style.top = (rect.top + h.offsetY - 4) + 'px';
      h.el.style.width = rect.width + 'px';
    });
  }

  function columnWidths(table, grid) {
    const widths = new Array(grid.colCount).fill(0);
    if (!table.rows[0]) return widths;
    const scale = tableScale(table);
    grid.entries.forEach((e) => {
      if (e.col >= widths.length) return;
      if (widths[e.col] === 0) {
        const w = e.cell.getBoundingClientRect().width / scale.x / Math.max(1, e.colSpan);
        for (let c = e.col; c < e.col + e.colSpan && c < widths.length; c++) {
          if (!widths[c]) widths[c] = w;
        }
      }
    });
    let total = 0;
    const actual = table.offsetWidth || table.getBoundingClientRect().width / scale.x;
    for (let c = 0; c < widths.length; c++) {
      if (!widths[c]) widths[c] = Math.max(MIN_COL, actual / Math.max(1, grid.colCount));
      total += widths[c];
    }
    if (total > 0 && Math.abs(total - actual) > 1) {
      const adjust = actual / total;
      for (let c = 0; c < widths.length; c++) widths[c] *= adjust;
    }
    return widths;
  }

  function ensureColgroup(table, widths) {
    const doc = PT.stage.getDoc();
    Array.from(table.children).forEach((child) => {
      if (child.tagName === 'COLGROUP') child.remove();
    });
    const colgroup = doc.createElement('colgroup');
    widths.forEach((w) => {
      const col = doc.createElement('col');
      col.style.width = w + 'px';
      colgroup.appendChild(col);
    });
    table.insertBefore(colgroup, table.firstChild);
    table.style.tableLayout = 'fixed';
    table.style.width = widths.reduce((a, b) => a + b, 0) + 'px';
  }

  // ---------- Column / row sizing (pointer + rAF, one history commit) ----------
  function onHandleDown(e) {
    const handle = e.target && e.target.closest ? e.target.closest('.table-handle') : null;
    if (!handle) return;
    if (mode() !== 'edit' || annotationMode() || busy()) return;
    e.preventDefault();
    e.stopPropagation();
    if (PT.inspector) PT.inspector.commitActive();
    if (handle.dataset.col !== undefined) {
      startColResize(parseInt(handle.dataset.col, 10), e, handle);
    } else if (handle.dataset.row !== undefined) {
      startRowResize(parseInt(handle.dataset.row, 10), e, handle);
    }
  }

  function startColResize(col, e, handle) {
    const table = currentTable();
    if (!table || !PT.ops) return;
    const grid = buildGrid(table);
    const widths = columnWidths(table, grid);
    if (!(col >= 0) || col >= widths.length) return;
    const point = eventPoint(e);
    const scale = tableScale(table);
    sizeDrag = {
      type: 'col',
      pointerId: e.pointerId,
      table,
      col,
      handle,
      startX: point.x,
      lastX: point.x,
      scaleX: scale.x || 1,
      startWidth: widths[col] || 60,
      startTotal: widths.reduce((a, b) => a + b, 0),
      widths,
      prepared: false,
      historyStarted: false
    };
    if (!PT.ops.start('col-resize')) {
      sizeDrag = null;
      return;
    }
    try {
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
    } catch (err) { /* synthetic or unsupported pointer */ }
    PT.stage.setInteractionStyle(true, 'col-resize');
  }

  function startRowResize(row, e, handle) {
    const table = currentTable();
    if (!table || !PT.ops) return;
    const tr = table.rows[row];
    if (!tr) return;
    const scale = tableScale(table);
    const rowRect = tr.getBoundingClientRect();
    const rowHeight = tr.offsetHeight || (rowRect.height / (scale.y || 1));
    const win = tr.ownerDocument.defaultView;
    let contentMin = MIN_ROW;
    Array.from(tr.cells).forEach((c) => {
      const cs = win.getComputedStyle(c);
      const line = parseFloat(cs.lineHeight) ||
        (parseFloat(cs.fontSize) || 14) * 1.4;
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const border = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      // Use the cell's intrinsic line box, not scrollHeight: scrollHeight grows
      // with the current inline height and made rows impossible to shrink.
      contentMin = Math.max(contentMin, Math.ceil(line + pad + border));
    });
    const point = eventPoint(e);
    sizeDrag = {
      type: 'row',
      pointerId: e.pointerId,
      table,
      row,
      handle,
      tr,
      cells: Array.from(tr.cells),
      startY: point.y,
      lastY: point.y,
      scaleY: scale.y || 1,
      startHeight: rowHeight,
      contentMin,
      prepared: false,
      historyStarted: false
    };
    if (!PT.ops.start('row-resize')) {
      sizeDrag = null;
      return;
    }
    try {
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
    } catch (err) { /* synthetic or unsupported pointer */ }
    PT.stage.setInteractionStyle(true, 'row-resize');
  }

  function onHandlePointerMove(e) {
    if (!sizeDrag || e.pointerId !== sizeDrag.pointerId) return;
    e.preventDefault();
    const point = eventPoint(e);
    if (sizeDrag.type === 'col') sizeDrag.lastX = point.x;
    else sizeDrag.lastY = point.y;
    if (sizeRaf) return;
    sizeRaf = requestAnimationFrame(applyHandleSize);
  }

  function applyHandleSize() {
    sizeRaf = 0;
    if (!sizeDrag) return;
    const drag = sizeDrag;
    if (!drag.prepared) {
      if (PT.history) {
        drag.historyStarted = PT.history.begin(drag.type === 'col' ? '调整列宽' : '调整行高', {
          kind: 'table-resize',
          axis: drag.type,
          col: drag.type === 'col' ? drag.col + 1 : undefined,
          row: drag.type === 'row' ? drag.row + 1 : undefined
        });
      }
      if (drag.type === 'col') {
        ensureColgroup(drag.table, drag.widths);
        drag.cols = Array.from(drag.table.querySelectorAll('colgroup > col'));
      }
      if (drag.type === 'row') {
        // Row height is applied to the row and every cell. Force border-box so
        // the assigned height includes padding/borders and can shrink instead
        // of growing by the cell's box model padding.
        drag.tr.style.boxSizing = 'border-box';
        drag.tr.style.minHeight = MIN_ROW + 'px';
        drag.cells.forEach((cell) => {
          cell.style.boxSizing = 'border-box';
          cell.style.minHeight = MIN_ROW + 'px';
        });
      }
      drag.prepared = true;
    }

    if (drag.type === 'col') {
      const dx = (drag.lastX - drag.startX) / (drag.scaleX || 1);
      const newWidth = Math.max(MIN_COL, drag.startWidth + dx);
      if (drag.cols && drag.cols[drag.col]) drag.cols[drag.col].style.width = newWidth + 'px';
      drag.table.style.width = (drag.startTotal + (newWidth - drag.startWidth)) + 'px';
      if (PT.history) PT.history.updateMeta({ width: Math.round(newWidth) });
    } else {
      const dy = (drag.lastY - drag.startY) / (drag.scaleY || 1);
      const h = Math.max(drag.contentMin, drag.startHeight + dy);
      drag.tr.style.height = h + 'px';
      drag.cells.forEach((cell) => { cell.style.height = h + 'px'; });
      if (PT.history) PT.history.updateMeta({ height: Math.round(h) });
    }

    // Table handles stay hidden while busy; the selection overlay and pins
    // still update once per animation frame.
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function onHandlePointerUp(e) {
    if (!sizeDrag || e.pointerId !== sizeDrag.pointerId) return;
    const drag = sizeDrag;
    if (sizeRaf) {
      cancelAnimationFrame(sizeRaf);
      sizeRaf = 0;
      applyHandleSize();
    }
    sizeDrag = null;
    try {
      if (drag.handle && drag.handle.releasePointerCapture && drag.handle.hasPointerCapture &&
          drag.handle.hasPointerCapture(e.pointerId)) {
        drag.handle.releasePointerCapture(e.pointerId);
      }
    } catch (err) { /* ignore */ }
    if (PT.history) {
      if (drag.historyStarted) PT.history.end(true);
      else PT.history.cancel();
    }
    PT.ops.end(drag.type === 'col' ? 'col-resize' : 'row-resize');
    PT.stage.setInteractionStyle(false);
    if (PT.annotations) PT.annotations.refreshAnchors('resize');
    if (PT.inspector) PT.inspector.sync();
    PT.stage.scheduleLayout();
    refreshHandles();
  }

  function selectWholeTable() {
    const table = currentTable();
    if (table) PT.selection.selectTable(table, currentCell());
  }

  function cancelSize() {
    if (!sizeDrag) return;
    const drag = sizeDrag;
    if (sizeRaf) {
      cancelAnimationFrame(sizeRaf);
      sizeRaf = 0;
    }
    sizeDrag = null;
    try {
      if (drag.handle && drag.handle.releasePointerCapture) {
        drag.handle.releasePointerCapture(drag.pointerId);
      }
    } catch (err) { /* ignore */ }
    if (PT.history) {
      if (drag.historyStarted) PT.history.end(true);
      else PT.history.cancel();
    }
    PT.ops.end(drag.type === 'col' ? 'col-resize' : 'row-resize');
    if (PT.stage) PT.stage.setInteractionStyle(false);
    refreshHandles();
  }

  PT.table = {
    init,
    applyOperation,
    updateUI,
    refreshHandles,
    renderHandles: refreshHandles,
    positionHandles,
    buildGrid,
    columnWidths,
    selectWholeTable,
    cancelSize,
    getTable: currentTable,
    getCell: currentCell
  };
})();
