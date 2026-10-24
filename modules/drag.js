/* ProtoTweak — pointer-based move with rAF and pointer capture */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const DRAG_THRESHOLD = 4;
  const REPLACED = new Set(['IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG']);

  let pending = null;
  let moveRaf = 0;
  let suppressClick = false;
  let boundDocs = new WeakSet();

  function mode() { return PT.app ? PT.app.getMode() : 'edit'; }
  function annotationMode() { return PT.annotations && PT.annotations.isMode(); }
  function ready() { return PT.stage && PT.stage.isReady(); }

  function eventPoint(e, offset) {
    const iframe = PT.stage ? PT.stage.getIframe() : null;
    if (!iframe) return { x: e.clientX, y: e.clientY };
    const win = iframe.contentWindow;
    const fromIframe = !!(e.view && win && e.view === win);
    let ox = 0;
    let oy = 0;
    if (fromIframe) {
      if (offset) {
        ox = offset.x;
        oy = offset.y;
      } else {
        const ir = iframe.getBoundingClientRect();
        ox = ir.left;
        oy = ir.top;
      }
    }
    return { x: e.clientX + ox, y: e.clientY + oy };
  }

  function supportsTranslate() {
    try { return !!(window.CSS && CSS.supports && CSS.supports('translate', '1px 1px')); } catch (e) { return false; }
  }

  function modeFor(el) {
    const win = el.ownerDocument.defaultView;
    const cs = win.getComputedStyle(el);
    if (cs.position === 'absolute' || cs.position === 'fixed') return 'absolute';
    if (cs.display === 'inline' && !REPLACED.has(el.tagName)) return 'relative';
    // Use transform: translate() for in-flow elements so dragging never
    // changes document flow.
    return 'transform';
  }

  function parseTranslate(cs) {
    const raw = cs.translate;
    if (!raw || raw === 'none') return { x: 0, y: 0 };
    const parts = raw.trim().split(/\s+/);
    return { x: parseFloat(parts[0]) || 0, y: parseFloat(parts[1] || parts[0]) || 0 };
  }

  function getOffset(el) {
    if (!el) return { x: 0, y: 0, mode: 'transform' };
    const win = el.ownerDocument.defaultView;
    const cs = win.getComputedStyle(el);
    const m = modeFor(el);
    if (m === 'absolute' || m === 'relative') {
      return {
        x: parseFloat(cs.left) || 0,
        y: parseFloat(cs.top) || 0,
        mode: m
      };
    }
    if (m === 'translate') {
      const t = parseTranslate(cs);
      return { x: t.x, y: t.y, mode: m };
    }
    const transform = el.style.transform || '';
    const match = transform.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
    return { x: match ? parseFloat(match[1]) : 0, y: match ? parseFloat(match[2]) : 0, mode: m };
  }

  function setOffset(el, x, y) {
    if (!el) return;
    const m = modeFor(el);
    if (m === 'absolute' || m === 'relative') {
      if (m === 'relative') {
        const cs = el.ownerDocument.defaultView.getComputedStyle(el);
        if (cs.position === 'static') el.style.position = 'relative';
      }
      el.style.left = (Number(x) || 0) + 'px';
      el.style.top = (Number(y) || 0) + 'px';
      return;
    }
    if (m === 'translate') {
      if (!x && !y) el.style.removeProperty('translate');
      else el.style.translate = (Number(x) || 0) + 'px ' + (Number(y) || 0) + 'px';
      return;
    }
    const base = (el.style.transform || '').replace(/translate\([^)]*\)\s*/g, '').trim();
    const tr = 'translate(' + (Number(x) || 0) + 'px, ' + (Number(y) || 0) + 'px)';
    el.style.transform = base ? tr + ' ' + base : tr;
  }

  function beginMove(el) {
    const m = modeFor(el);
    const win = el.ownerDocument.defaultView;
    const cs = win.getComputedStyle(el);
    const state = {
      el,
      mode: m,
      originalStyle: el.getAttribute('style'),
      base: null
    };
    if (m === 'absolute' || m === 'relative') {
      state.base = { left: parseFloat(cs.left) || 0, top: parseFloat(cs.top) || 0 };
      if (m === 'relative' && cs.position === 'static') el.style.position = 'relative';
    } else if (m === 'translate') {
      state.base = parseTranslate(cs);
    } else {
      const tr = el.style.transform || '';
      const match = tr.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
      state.base = {
        transform: tr,
        x: match ? parseFloat(match[1]) || 0 : 0,
        y: match ? parseFloat(match[2]) || 0 : 0
      };
    }
    return state;
  }

  function applyMove(state, dx, dy) {
    if (!state || !state.el || !state.el.isConnected) return;
    const el = state.el;
    if (state.mode === 'absolute' || state.mode === 'relative') {
      el.style.left = (state.base.left + dx) + 'px';
      el.style.top = (state.base.top + dy) + 'px';
      return;
    }
    if (state.mode === 'translate') {
      const x = state.base.x + dx;
      const y = state.base.y + dy;
      if (!x && !y) el.style.removeProperty('translate');
      else el.style.translate = x + 'px ' + y + 'px';
      return;
    }
    const base = (state.base.transform || '').replace(/translate\([^)]*\)\s*/g, '').trim();
    const tr = 'translate(' + (state.base.x + dx) + 'px, ' + (state.base.y + dy) + 'px)';
    el.style.transform = base ? tr + ' ' + base : tr;
  }

  function init() {
    // Parent listeners are bound once. With pointer capture on the iframe-side
    // drag target, iframe-document listeners receive moves outside the iframe.
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
  }

  function bind(doc) {
    if (!doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('pointermove', onPointerMove, true);
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('pointercancel', onPointerUp, true);
  }

  function onPointerDown(e) {
    if (!ready() || mode() !== 'edit' || annotationMode()) return;
    if (PT.ops && PT.ops.isBusy()) return;
    if (PT.textEdit && PT.textEdit.isEditing()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    const sel = PT.selection ? PT.selection.get() : null;
    const targetTable = target.closest ? target.closest('table') : null;
    let dragEl = null;
    let tableDrag = false;

    if (target.closest('[contenteditable="true"]')) return;

    if (PT.core.isEditableTarget(target)) {
      // Form controls keep native behavior until explicitly selected with
      // Ctrl/Cmd. Once selected they can be dragged from the canvas.
      const selectedControl = sel && sel.kind === 'element' && sel.element &&
        (target === sel.element || sel.element.contains(target));
      if (!selectedControl) return;
    }

    if (sel && sel.kind === 'cell') return;

    if (sel && sel.kind === 'table') {
      // Whole-table drag is only allowed while the table itself is selected.
      if (targetTable && targetTable === sel.element) {
        dragEl = sel.element;
        tableDrag = true;
      } else {
        return;
      }
    } else if (sel && sel.kind === 'element' && sel.element) {
      // Native interactions stay available unless the user explicitly selected
      // this element (Ctrl/Cmd click). Dragging is limited to the selection.
      if (target === sel.element || sel.element.contains(target)) dragEl = sel.element;
      else return;
    } else if (targetTable) {
      // A click on a table first selects the whole table. Do not start a drag
      // before that state exists; this avoids fighting cell selection.
      return;
    } else {
      return;
    }

    if (!dragEl || dragEl.nodeType !== 1) return;
    if (dragEl === dragEl.ownerDocument.body || dragEl === dragEl.ownerDocument.documentElement) return;
    if (['THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'COLGROUP', 'COL'].indexOf(dragEl.tagName) !== -1) return;
    if (dragEl.tagName === 'TABLE' && !tableDrag) return;

    const start = eventPoint(e);
    pending = {
      el: dragEl,
      tableDrag,
      pointerId: e.pointerId,
      startX: start.x,
      startY: start.y,
      lastX: start.x,
      lastY: start.y,
      offsetX: start.x - e.clientX,
      offsetY: start.y - e.clientY,
      started: false,
      state: null,
      historyStarted: false
    };

    // Do not capture the pointer on pointerdown. Capturing a table on a
    // simple click retargets the subsequent click to the table itself, which
    // prevents drilling into a cell or double-clicking cell text. Capture is
    // acquired only after the movement threshold is crossed.
    void sel;
  }

  function onPointerMove(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    const point = eventPoint(e, { x: pending.offsetX, y: pending.offsetY });
    pending.lastX = point.x;
    pending.lastY = point.y;
    const dx = point.x - pending.startX;
    const dy = point.y - pending.startY;

    if (!pending.started) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      if (PT.ops && !PT.ops.start('move')) {
        cancelPending();
        return;
      }
      if (pending.tableDrag) {
        const sel = PT.selection.get();
        PT.selection.selectTable(pending.el, sel.cell || PT.selection.firstCell(pending.el));
      } else if (PT.selection) {
        PT.selection.select(pending.el);
      }
      if (PT.history) {
        pending.historyStarted = PT.history.begin('移动元素', {
          kind: 'move',
          target: PT.anchors ? PT.anchors.elementLabel(pending.el) : pending.el.tagName.toLowerCase(),
          dx: 0,
          dy: 0
        });
      }
      pending.state = beginMove(pending.el);
      pending.started = true;
      try {
        if (pending.el.setPointerCapture) {
          pending.el.setPointerCapture(pending.pointerId);
        }
      } catch (err) { /* synthetic or unsupported pointer */ }
      if (PT.stage) PT.stage.setInteractionStyle(true, 'grabbing');
    }

    e.preventDefault();
    if (moveRaf) return;
    moveRaf = requestAnimationFrame(applyMoveFrame);
  }

  function applyMoveFrame() {
    moveRaf = 0;
    if (!pending || !pending.started) return;
    const dx = pending.lastX - pending.startX;
    const dy = pending.lastY - pending.startY;
    applyMove(pending.state, dx, dy);
    if (PT.history && pending.historyStarted) {
      PT.history.updateMeta({ dx: Math.round(dx), dy: Math.round(dy) });
    }
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function onPointerUp(e) {
    if (!pending || e.pointerId !== pending.pointerId) return;
    const p = pending;
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
      applyMoveFrame();
    }
    pending = null;
    releaseCapture(p.el, e.pointerId);

    if (p.started && p.state) {
      const dx = p.lastX - p.startX;
      const dy = p.lastY - p.startY;
      applyMove(p.state, dx, dy);
      if (PT.history && p.historyStarted) {
        PT.history.updateMeta({ dx: Math.round(dx), dy: Math.round(dy) });
        PT.history.end(true);
      }
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 350);
      if (PT.annotations) PT.annotations.refreshAnchors('move');
      if (PT.inspector) PT.inspector.sync();
      if (PT.stage) PT.stage.scheduleLayout();
    } else if (p.historyStarted && PT.history) {
      PT.history.cancel();
    }

    if (PT.ops) PT.ops.end('move');
    if (PT.stage) PT.stage.setInteractionStyle(false);
  }

  function cancelPending(release) {
    if (!pending) return;
    const p = pending;
    pending = null;
    if (moveRaf) {
      cancelAnimationFrame(moveRaf);
      moveRaf = 0;
    }
    if (release !== false) releaseCapture(p.el, p.pointerId);
    if (PT.history) {
      if (p.historyStarted) PT.history.end(true);
      else PT.history.cancel();
    }
    if (PT.ops) PT.ops.end('move');
    if (PT.stage) PT.stage.setInteractionStyle(false);
  }

  function releaseCapture(el, pointerId) {
    try {
      if (el && el.releasePointerCapture && el.hasPointerCapture && el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch (err) { /* ignore */ }
  }

  function consumeClickSuppression() {
    if (!suppressClick) return false;
    suppressClick = false;
    return true;
  }

  function isDragging() {
    return !!(pending && pending.started);
  }

  PT.move = {
    getOffset,
    setOffset,
    modeFor
  };

  PT.drag = {
    init,
    bind,
    cancel: cancelPending,
    consumeClickSuppression,
    isDragging,
    DRAG_THRESHOLD
  };
})();
