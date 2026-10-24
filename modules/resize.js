/* ProtoTweak — eight-handle resize for elements and whole tables */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const MIN_SIZE = 12;
  const REPLACED = new Set(['IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG']);

  let layer = null;
  let handles = {};
  let state = null;
  let resizeRaf = 0;

  function init() {
    layer = document.getElementById('resize-layer');
    if (!layer) return;

    DIRS.forEach((dir) => {
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.dataset.dir = dir;
      handle.hidden = true;
      layer.appendChild(handle);
      handles[dir] = handle;
    });

    // One delegated listener for all handles.
    layer.addEventListener('pointerdown', onPointerDown, true);
    layer.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.resize-handle')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Bound once; pointer capture routes moves here even outside the iframe.
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);

    Core.on('selection:change', refresh);
    Core.on('layout', position);
    Core.on('mode:change', refresh);
    Core.on('annotations:mode', refresh);
    Core.on('ops:change', refresh);
    Core.on('history:restore', refresh);
    Core.on('text:start', refresh);
    Core.on('text:finish', refresh);
    Core.on('stage:ready', ({ doc }) => {
      if (!doc) return;
      doc.addEventListener('pointermove', onPointerMove, true);
      doc.addEventListener('pointerup', onPointerUp, true);
      doc.addEventListener('pointercancel', onPointerUp, true);
    });

    refresh();
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

  function eligible() {
    if (!PT.stage || !PT.stage.isReady() || mode() !== 'edit' || annotationMode()) return null;
    if (PT.textEdit && PT.textEdit.isEditing()) return null;
    const sel = PT.selection ? PT.selection.get() : null;
    if (!sel || !sel.element) return null;
    if (sel.kind !== 'element' && sel.kind !== 'table') return null;
    if (sel.kind === 'table' && sel.element.tagName !== 'TABLE') return null;
    if (PT.ops && PT.ops.isBusy()) return null;
    return sel;
  }

  function hideAll() {
    DIRS.forEach((dir) => { if (handles[dir]) handles[dir].hidden = true; });
  }

  function unionRect(el) {
    if (!el) return null;
    try {
      const rects = Array.from(el.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
      if (!rects.length) return el.getBoundingClientRect();
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      rects.forEach((r) => {
        left = Math.min(left, r.left);
        top = Math.min(top, r.top);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      });
      return { left, top, width: right - left, height: bottom - top, right, bottom };
    } catch (e) {
      return el.getBoundingClientRect();
    }
  }

  function place(rect, kind) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return hideAll();
    // Keep the whole-table 8-way handles just outside the table border so
    // the row/column handles on the border remain hittable.
    const outset = kind === 'table' ? 11 : 0;
    DIRS.forEach((dir) => {
      const handle = handles[dir];
      if (!handle) return;
      const horizontal = dir.indexOf('e') !== -1 ? 1 : (dir.indexOf('w') !== -1 ? -1 : 0);
      const vertical = dir.indexOf('s') !== -1 ? 1 : (dir.indexOf('n') !== -1 ? -1 : 0);
      handle.hidden = false;
      handle.style.left = (rect.left + rect.width / 2 + horizontal * (rect.width / 2 + outset)) + 'px';
      handle.style.top = (rect.top + rect.height / 2 + vertical * (rect.height / 2 + outset)) + 'px';
    });
  }

  function refresh() {
    if (state) {
      place(state.currentCanvas, state.kind);
      return;
    }
    if (busy()) return hideAll();
    const sel = eligible();
    if (!sel) return hideAll();
    const rect = unionRect(sel.element);
    if (!rect) return hideAll();
    const canvas = PT.stage.toCanvas(rect);
    place(canvas, sel.kind);
  }

  function position() {
    if (state) {
      place(state.currentCanvas, state.kind);
      return;
    }
    if (busy()) return hideAll();
    const sel = PT.selection ? PT.selection.get() : null;
    if (!sel || (sel.kind !== 'element' && sel.kind !== 'table') || !sel.element) return hideAll();
    const rect = unionRect(sel.element);
    if (!rect) return hideAll();
    place(PT.stage.toCanvas(rect), sel.kind);
  }

  function cursorFor(dir) {
    if (dir === 'nw' || dir === 'se') return 'nwse-resize';
    if (dir === 'ne' || dir === 'sw') return 'nesw-resize';
    if (dir === 'e' || dir === 'w') return 'ew-resize';
    return 'ns-resize';
  }

  function onPointerDown(e) {
    const handle = e.target && e.target.closest ? e.target.closest('.resize-handle') : null;
    if (!handle) return;
    if (busy()) return;
    const sel = eligible();
    if (!sel) return;

    e.preventDefault();
    e.stopPropagation();

    if (PT.inspector) PT.inspector.commitActive();

    const el = sel.element;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const borderX = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
    const borderY = (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const startCanvas = PT.stage.toCanvas(rect);
    const dir = handle.dataset.dir;
    const point = eventPoint(e);

    state = {
      el,
      kind: sel.kind,
      dir,
      pointerId: e.pointerId,
      handle,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      shift: !!e.shiftKey,
      startRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
      startOffset: PT.move.getOffset(el),
      boxSizing: cs.boxSizing,
      padX,
      padY,
      borderX,
      borderY,
      canvasOffsetX: startCanvas.left - rect.left,
      canvasOffsetY: startCanvas.top - rect.top,
      currentCanvas: startCanvas,
      needInlineBlock: cs.display === 'inline' && !REPLACED.has(el.tagName),
      moved: false,
      historyStarted: false,
      setW: dir.indexOf('e') !== -1 || dir.indexOf('w') !== -1,
      setH: dir.indexOf('n') !== -1 || dir.indexOf('s') !== -1
    };

    if (!PT.ops.start('resize')) {
      state = null;
      return;
    }
    try {
      if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
    } catch (err) { /* synthetic or unsupported pointer */ }
    PT.stage.setInteractionStyle(true, cursorFor(dir));
    place(state.currentCanvas, state.kind);
  }

  function onPointerMove(e) {
    if (!state || e.pointerId !== state.pointerId) return;
    e.preventDefault();
    const point = eventPoint(e);
    state.lastX = point.x;
    state.lastY = point.y;
    state.shift = !!e.shiftKey;
    if (!state.moved) {
      const dx = Math.abs(state.lastX - state.startX);
      const dy = Math.abs(state.lastY - state.startY);
      if (dx < 2 && dy < 2) return;
      state.moved = true;
    }
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(applyResize);
  }

  function applyResize() {
    resizeRaf = 0;
    if (!state || !state.el || !state.el.isConnected) return;
    const s = state;
    const dx = s.lastX - s.startX;
    const dy = s.lastY - s.startY;
    const sr = s.startRect;

    let left = sr.left;
    let top = sr.top;
    let right = sr.right;
    let bottom = sr.bottom;
    if (s.dir.indexOf('e') !== -1) right += dx;
    if (s.dir.indexOf('w') !== -1) left += dx;
    if (s.dir.indexOf('s') !== -1) bottom += dy;
    if (s.dir.indexOf('n') !== -1) top += dy;

    let w = right - left;
    let h = bottom - top;
    let setW = s.setW;
    let setH = s.setH;
    const ratio = sr.width / Math.max(1, sr.height);

    if (s.shift) {
      if (setW && setH) {
        const sw = w / Math.max(1, sr.width);
        const sh = h / Math.max(1, sr.height);
        const scale = Math.abs(sw - 1) >= Math.abs(sh - 1) ? sw : sh;
        w = sr.width * scale;
        h = sr.height * scale;
      } else if (setW) {
        h = w / ratio;
        setH = true;
      } else if (setH) {
        w = h * ratio;
        setW = true;
      }
      if (setW && setH) {
        if (s.dir.indexOf('e') !== -1) right = left + w;
        else if (s.dir.indexOf('w') !== -1) left = right - w;
        else {
          left = sr.left + (sr.width - w) / 2;
          right = left + w;
        }
        if (s.dir.indexOf('n') !== -1) top = bottom - h;
        else if (s.dir.indexOf('s') !== -1) bottom = top + h;
        else top = sr.top + (sr.height - h) / 2;
      }
    }

    if (w < MIN_SIZE) {
      if (s.dir.indexOf('w') !== -1) left = right - MIN_SIZE;
      else right = left + MIN_SIZE;
      w = MIN_SIZE;
    }
    if (h < MIN_SIZE) {
      if (s.dir.indexOf('n') !== -1) top = bottom - MIN_SIZE;
      else bottom = top + MIN_SIZE;
      h = MIN_SIZE;
    }

    if (!s.historyStarted) {
      if (PT.history) {
        s.historyStarted = PT.history.begin(s.kind === 'table' ? '缩放表格' : '缩放元素', {
          kind: 'resize',
          target: PT.anchors ? PT.anchors.elementLabel(s.el) : s.el.tagName.toLowerCase(),
          dir: s.dir,
          width: Math.round(w),
          height: Math.round(h)
        });
      }
      if (s.needInlineBlock) s.el.style.display = 'inline-block';
    }

    if (setW) {
      const cssW = s.boxSizing === 'border-box' ? w : Math.max(1, w - s.padX - s.borderX);
      s.el.style.width = Math.max(1, cssW) + 'px';
    }
    if (setH) {
      const cssH = s.boxSizing === 'border-box' ? h : Math.max(1, h - s.padY - s.borderY);
      s.el.style.height = Math.max(1, cssH) + 'px';
    }

    const offsetX = left - sr.left;
    const offsetY = top - sr.top;
    if (offsetX || offsetY) {
      PT.move.setOffset(s.el, s.startOffset.x + offsetX, s.startOffset.y + offsetY);
    }

    s.currentCanvas = {
      left: left + s.canvasOffsetX,
      top: top + s.canvasOffsetY,
      width: w,
      height: h,
      right: left + s.canvasOffsetX + w,
      bottom: top + s.canvasOffsetY + h
    };
    try {
      const live = s.el.getBoundingClientRect();
      s.currentCanvas = {
        left: live.left + s.canvasOffsetX,
        top: live.top + s.canvasOffsetY,
        width: live.width,
        height: live.height,
        right: live.right + s.canvasOffsetX,
        bottom: live.bottom + s.canvasOffsetY
      };
    } catch (err) { /* keep target rect */ }
    place(s.currentCanvas, s.kind);

    if (PT.history) PT.history.updateMeta({ width: Math.round(w), height: Math.round(h) });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function onPointerUp(e) {
    if (!state || e.pointerId !== state.pointerId) return;
    const s = state;
    if (resizeRaf) {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = 0;
      applyResize();
    }
    state = null;
    try {
      if (s.handle.releasePointerCapture && s.handle.hasPointerCapture && s.handle.hasPointerCapture(e.pointerId)) {
        s.handle.releasePointerCapture(e.pointerId);
      }
    } catch (err) { /* ignore */ }

    if (PT.history) {
      if (s.historyStarted) PT.history.end(true);
      else PT.history.cancel();
    }
    PT.ops.end('resize');
    PT.stage.setInteractionStyle(false);
    if (PT.annotations) PT.annotations.refreshAnchors('resize');
    if (PT.inspector) PT.inspector.sync();
    if (PT.table) PT.table.refreshHandles();
    if (PT.stage) PT.stage.scheduleLayout();
    refresh();
  }

  function cancel() {
    if (!state) return;
    const s = state;
    state = null;
    if (resizeRaf) {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = 0;
    }
    try {
      if (s.handle.releasePointerCapture && s.handle.hasPointerCapture && s.handle.hasPointerCapture(s.pointerId)) {
        s.handle.releasePointerCapture(s.pointerId);
      }
    } catch (err) { /* ignore */ }
    if (PT.history) {
      if (s.historyStarted) PT.history.end(true);
      else PT.history.cancel();
    }
    PT.ops.end('resize');
    if (PT.stage) PT.stage.setInteractionStyle(false);
    refresh();
  }

  PT.resize = {
    init,
    refresh,
    position,
    cancel,
    isResizing: () => !!state
  };
})();
