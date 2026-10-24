/* ProtoTweak — annotation pins, card, right-side list */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let layer = null;
  let listEl = null;
  let card = null;
  let filter = 'all';
  let cardId = null;
  let cardIsNew = false;
  let pinEls = new Map();
  let boundDocUI = new WeakSet();
  let repositionPending = false;

  function init() {
    layer = document.getElementById('annotation-layer');
    listEl = document.getElementById('ann-list');
    card = document.getElementById('ann-card');

    Core.$$('[data-annot-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.annotFilter;
        Core.$$('[data-annot-filter]').forEach((b) => b.classList.toggle('on', b === btn));
        renderList();
      });
    });

    const previewToggle = document.getElementById('ann-preview-toggle');
    previewToggle.addEventListener('change', () => {
      PT.annotations.setShowInPreview(previewToggle.checked);
      if (!previewToggle.checked && PT.app && PT.app.getMode() === 'preview') {
        closeCard({ removeIfEmpty: true });
      }
      renderPins();
    });

    document.getElementById('annotation-banner-exit').addEventListener('click', () => {
      if (PT.app) PT.app.exitAnnotation();
    });

    document.getElementById('ann-card-close').addEventListener('click', () => closeCard({ removeIfEmpty: true }));
    document.getElementById('ann-card-save').addEventListener('click', () => closeCard({ removeIfEmpty: true }));
    document.getElementById('ann-card-delete').addEventListener('click', deleteCard);
    document.getElementById('ann-card-copy').addEventListener('click', () => {
      const ann = PT.annotations.get(cardId);
      if (!ann) return;
      Core.copyText(ann.selector || '').then(() => Core.toast('选择器已复制', 'success', 1400));
    });
    document.getElementById('ann-card-reanchor').addEventListener('click', () => {
      if (!cardId) return;
      const id = cardId;
      closeCard({ removeIfEmpty: false });
      PT.annotations.startReanchor(id);
      renderBanner();
    });

    document.getElementById('ann-card-content').addEventListener('input', onCardInput);
    document.getElementById('ann-card-prd').addEventListener('input', onCardInput);
    document.getElementById('ann-card-type').addEventListener('change', onCardInput);
    Core.$$('#ann-card .status-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!cardId || isReadonly()) return;
        PT.annotations.setStatus(cardId, btn.dataset.status);
        setCardStatus(btn.dataset.status);
        renderList();
        renderPins();
      });
    });

    document.addEventListener('click', onDocClick, true);
    Core.on('layout', scheduleReposition);
    Core.on('annotations:change', onAnnotationsChange);
    Core.on('annotations:focus', (e) => { if (e && e.id) openCard(e.id, { isNew: false }); });
    Core.on('annotations:add', () => closeCard({ removeIfEmpty: true }));
    Core.on('annotations:reanchor', () => { renderBanner(); renderPins(); });
    Core.on('annotations:mode', () => { renderBanner(); renderPins(); });
    Core.on('selection:change', (e) => {
      if (cardId && !(e && e.silent)) closeCard({ removeIfEmpty: true });
    });
    Core.on('mode:change', () => {
      if (PT.app && PT.app.getMode() === 'preview' && !PT.annotations.getShowInPreview()) closeCard({ removeIfEmpty: true });
      renderPins();
      renderBanner();
    });
    Core.on('stage:ready', (e) => bindDoc(e.doc));
    Core.on('history:restore', () => closeCard({ removeIfEmpty: false }));

    if (PT.stage && PT.stage.isReady()) bindDoc(PT.stage.getDoc());
    renderAll();
  }

  function bindDoc(doc) {
    if (!doc || boundDocUI.has(doc)) return;
    boundDocUI.add(doc);
    doc.addEventListener('click', () => {
      if (PT.app && PT.app.getMode() === 'preview' && cardId) closeCard({ removeIfEmpty: true });
    }, false);
  }

  function isReadonly() {
    return PT.app && PT.app.getMode() === 'preview';
  }

  function onDocClick(e) {
    if (!cardId) return;
    if (card.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.ann-pin')) return;
    if (e.target.closest && e.target.closest('#ann-list')) return;
    closeCard({ removeIfEmpty: true });
  }

  function onCardInput() {
    if (!cardId || isReadonly()) return;
    const ann = PT.annotations.get(cardId);
    if (!ann) return;
    const content = document.getElementById('ann-card-content').value;
    const prd = document.getElementById('ann-card-prd').value;
    const type = document.getElementById('ann-card-type').value;
    PT.annotations.update(cardId, { content, prdRef: prd, type }, { source: 'card', silentEvent: true });
    const updated = PT.annotations.get(cardId);
    if (updated) {
      document.getElementById('ann-card-time').textContent = '创建 ' + Core.formatDateShort(updated.createdAt) + ' · 更新 ' + Core.formatDateShort(updated.updatedAt);
    }
    renderList();
    // Do not re-open / re-focus the card; input is the source of truth.
    const item = Array.from(listEl.children).find((el) => el.dataset && el.dataset.annotId === cardId);
    if (item) item.classList.add('active');
  }

  function renderAll() {
    renderCounts();
    renderList();
    renderPins();
    renderBanner();
    const toggle = document.getElementById('ann-preview-toggle');
    if (toggle) toggle.checked = PT.annotations.getShowInPreview();
  }

  function renderCounts() {
    const c = PT.annotations.counts();
    const top = document.getElementById('annot-count');
    if (top) {
      top.textContent = String(c.total);
      top.classList.toggle('has-orphan', c.orphan > 0);
      top.title = c.open + ' 条未解决 · ' + c.resolved + ' 条已解决 · ' + c.orphan + ' 条孤立';
    }
    const tab = document.getElementById('annot-tab-count');
    if (tab) tab.textContent = String(c.total);
  }

  function renderList() {
    if (!listEl) return;
    const all = PT.annotations.list();
    const visible = all.filter((a) => {
      if (filter === 'open') return a.status === 'open' && !a._orphan;
      if (filter === 'resolved') return a.status === 'resolved' && !a._orphan;
      if (filter === 'orphan') return !!a._orphan;
      return true;
    });
    listEl.innerHTML = '';
    if (!all.length) {
      const empty = document.createElement('div');
      empty.className = 'ann-empty';
      empty.innerHTML = '<div class="ann-empty-icon">✏️</div><div class="ann-empty-title">还没有批注</div><div class="ann-empty-desc">进入批注模式，再点击页面元素即可打点。</div><button class="btn primary small" type="button">开始批注</button>';
      const start = empty.querySelector('button');
      if (start) start.addEventListener('click', () => { if (PT.app) PT.app.toggleAnnotation(); });
      listEl.appendChild(empty);
      return;
    }
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'ann-empty small';
      empty.textContent = '当前筛选下没有批注。';
      listEl.appendChild(empty);
      return;
    }
    visible.forEach((a) => listEl.appendChild(renderItem(a)));
  }

  function renderItem(a) {
    const item = document.createElement('div');
    item.className = 'ann-item' + (a._orphan ? ' orphan' : '') + (cardId === a.id ? ' active' : '') + ' status-' + a.status;
    item.dataset.annotId = a.id;
    item.innerHTML =
      '<div class="ann-item-top">' +
      '  <span class="ann-seq">' + a.seq + '</span>' +
      '  <span class="ann-type">' + Core.escapeHtml(PT.annotations.TYPE_LABELS[a.type] || a.type) + '</span>' +
      '  <span class="ann-status ' + (a._orphan ? 'orphan' : a.status) + '">' + (a._orphan ? '孤立' : (PT.annotations.STATUS_LABELS[a.status] || a.status)) + '</span>' +
      '  <span class="ann-item-time">' + Core.formatDateShort(a.updatedAt || a.createdAt) + '</span>' +
      '</div>' +
      '<div class="ann-item-content">' + Core.escapeHtml(a.content || '（空批注）') + '</div>' +
      '<div class="ann-item-meta">' +
      '  <span class="ann-item-el">' + Core.escapeHtml(a.anchor && a.anchor.tag ? a.anchor.tag : '元素') + '</span>' +
      (a.prdRef ? '  <span class="ann-prd">' + Core.escapeHtml(a.prdRef) + '</span>' : '') +
      '</div>';
    item.addEventListener('click', () => {
      PT.annotations.focus(a.id);
      openCard(a.id, { isNew: false });
    });
    return item;
  }

  function openCard(id, opts) {
    const ann = PT.annotations.get(id);
    if (!ann) return;
    if (cardId && cardId !== id) closeCard({ removeIfEmpty: true });
    cardId = id;
    cardIsNew = !!(opts && opts.isNew);
    document.getElementById('ann-card-seq').textContent = '#' + ann.seq;
    document.getElementById('ann-card-type').value = ann.type;
    document.getElementById('ann-card-content').value = ann.content || '';
    document.getElementById('ann-card-prd').value = ann.prdRef || '';
    document.getElementById('ann-card-selector').textContent = ann.selector || '（无选择器）';
    document.getElementById('ann-card-text').textContent = ann.textSnapshot || '';
    document.getElementById('ann-card-time').textContent = '创建 ' + Core.formatDateShort(ann.createdAt) + ' · 更新 ' + Core.formatDateShort(ann.updatedAt);
    const orphan = document.getElementById('ann-card-orphan');
    orphan.hidden = !ann._orphan;
    if (ann._orphan) {
      document.getElementById('ann-card-orphan-text').textContent = '元素已不存在。可重新锚定，或删除这条批注。';
    }
    setCardStatus(ann.status);
    const readonly = isReadonly();
    document.getElementById('ann-card-content').disabled = readonly;
    document.getElementById('ann-card-type').disabled = readonly;
    document.getElementById('ann-card-prd').disabled = readonly;
    Core.$$('#ann-card .status-btn').forEach((b) => { b.disabled = readonly; });
    document.getElementById('ann-card-delete').hidden = readonly;
    document.getElementById('ann-card-reanchor').hidden = readonly;
    document.getElementById('ann-card-save').hidden = readonly;
    document.getElementById('ann-card-copy').disabled = false;
    card.hidden = false;
    renderPins();
    positionCard();
    if (!readonly && cardIsNew) {
      setTimeout(() => document.getElementById('ann-card-content').focus(), 0);
    }
  }

  function setCardStatus(status) {
    Core.$$('#ann-card .status-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.status === status);
    });
  }

  function closeCard(opts) {
    if (!cardId) return;
    const id = cardId;
    const wasNew = cardIsNew;
    const ann = PT.annotations.get(id);
    cardId = null;
    cardIsNew = false;
    if (card) card.hidden = true;
    if (wasNew && ann && (!ann.content || !ann.content.trim()) && opts && opts.removeIfEmpty !== false) {
      PT.annotations.remove(id);
    }
    renderPins();
    renderList();
  }

  function deleteCard() {
    if (!cardId || isReadonly()) return;
    const ann = PT.annotations.get(cardId);
    if (!ann) return;
    PT.app.confirm('删除批注 #' + ann.seq + '？删除后后续批注会自动重排。', {
      title: '删除批注',
      confirmText: '删除'
    }).then((ok) => {
      if (!ok) return;
      PT.annotations.remove(cardId);
      closeCard({ removeIfEmpty: false });
      Core.toast('批注已删除', 'info');
    });
  }

  function renderPins() {
    if (!layer) return;
    const anns = PT.annotations.list();
    const readonlyPreview = PT.app && PT.app.getMode() === 'preview';
    const hide = readonlyPreview && !PT.annotations.getShowInPreview();
    if (!anns.length || hide) {
      layer.hidden = true;
      pinEls.forEach((el) => el.remove());
      pinEls.clear();
      return;
    }
    layer.hidden = false;
    const mapKeys = new Map();
    anns.forEach((a) => {
      let pin = pinEls.get(a.id);
      if (!pin) {
        pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'ann-pin';
        pin.dataset.id = a.id;
        pin.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (PT.app && PT.app.getMode() === 'edit') PT.annotations.focus(a.id);
          openCard(a.id, { isNew: false });
        });
        layer.appendChild(pin);
        pinEls.set(a.id, pin);
      }
      pin.textContent = String(a.seq);
      pin.title = '#' + a.seq + ' ' + (PT.annotations.TYPE_LABELS[a.type] || a.type) + ' · ' + (a.content || '（空批注）');
      pin.className = 'ann-pin status-' + a.status +
        (a._orphan ? ' orphan' : '') +
        (cardId === a.id ? ' active' : '');
    });
    // remove stale
    Array.from(pinEls.keys()).forEach((id) => {
      if (!anns.some((a) => a.id === id)) {
        const el = pinEls.get(id);
        if (el) el.remove();
        pinEls.delete(id);
      }
    });
    positionPins(mapKeys);
  }

  function positionPins(stackMap) {
    if (!layer || layer.hidden) return;
    const anns = PT.annotations.list();
    const viewport = PT.stage.viewportSize();
    const canvas = PT.stage.getCanvas();
    const canvasW = canvas ? canvas.clientWidth : window.innerWidth;
    const canvasH = canvas ? canvas.clientHeight : window.innerHeight;
    const stacks = new Map();
    anns.forEach((a) => {
      const key = a._el
        ? 'el:' + (a.anchor && a.anchor.aid ? a.anchor.aid : a.selector)
        : 'orphan:' + a.id;
      const idx = stacks.get(key) || 0;
      stacks.set(key, idx + 1);
      const pin = pinEls.get(a.id);
      if (!pin) return;
      const rect = getRect(a);
      if (!rect) {
        pin.hidden = true;
        return;
      }
      if (rect.bottom < 0 || rect.top > viewport.height || rect.right < 0 || rect.left > viewport.width) {
        pin.hidden = true;
        return;
      }
      pin.hidden = false;
      const canvasRect = PT.stage.toCanvas({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      });
      let left = canvasRect.left + rect.width - 10;
      let top = canvasRect.top - 10 + idx * 22;
      if (top < 2) top = Math.max(2, canvasRect.top + 4 + idx * 22);
      left = Core.clamp(left, 2, Math.max(2, canvasW - 24));
      top = Core.clamp(top, 2, Math.max(2, canvasH - 24));
      pin.style.left = left + 'px';
      pin.style.top = top + 'px';
    });
  }

  function getRect(a) {
    const doc = PT.stage.getDoc();
    if (!doc) return null;
    if (a._el && a._el.isConnected) {
      try {
        const rects = Array.from(a._el.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
        const r = rects.length ? unionRect(rects) : a._el.getBoundingClientRect();
        if (!r || (!r.width && !r.height)) return null;
        return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
      } catch (e) {
        return null;
      }
    }
    if (a.lastRect) {
      const scroll = PT.stage.getScroll();
      const r = {
        left: a.lastRect.x - scroll.x,
        top: a.lastRect.y - scroll.y,
        width: a.lastRect.w || 24,
        height: a.lastRect.h || 24
      };
      r.right = r.left + r.width;
      r.bottom = r.top + r.height;
      return r;
    }
    return null;
  }

  function unionRect(rects) {
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
  }

  function positionCard() {
    if (!card || card.hidden) return;
    const pin = cardId ? pinEls.get(cardId) : null;
    const cw = card.offsetWidth || 340;
    const ch = card.offsetHeight || 300;
    const rail = document.querySelector('.rail');
    const railLeft = rail && !document.body.classList.contains('no-doc') ? rail.getBoundingClientRect().left : window.innerWidth;
    const maxLeft = Math.max(12, railLeft - cw - 14);
    let left;
    let top;
    if (pin && !pin.hidden) {
      const pr = pin.getBoundingClientRect();
      left = pr.right + 12;
      if (left > maxLeft) left = pr.left - cw - 12;
      top = pr.top - 8;
    } else {
      left = maxLeft;
      top = 110;
    }
    left = Core.clamp(left, 12, maxLeft);
    const banner = document.getElementById('annotation-banner');
    const minTop = banner && !banner.hidden ? 104 : 64;
    top = Core.clamp(top, minTop, Math.max(minTop, window.innerHeight - ch - 12));
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function scheduleReposition() {
    if (repositionPending) return;
    repositionPending = true;
    requestAnimationFrame(() => {
      repositionPending = false;
      positionPins();
      positionCard();
    });
  }

  function renderBanner() {
    const banner = document.getElementById('annotation-banner');
    if (!banner) return;
    const reanchor = PT.annotations.isReanchor();
    const mode = PT.annotations.isMode();
    const text = document.getElementById('annotation-banner-text');
    if (reanchor) {
      banner.hidden = false;
      banner.classList.add('reanchor');
      text.textContent = '重新锚定：点击新的元素；Esc 取消';
    } else if (mode) {
      banner.hidden = false;
      banner.classList.remove('reanchor');
      text.textContent = '批注模式：点击页面元素添加批注，Esc 退出';
    } else {
      banner.hidden = true;
      banner.classList.remove('reanchor');
    }
  }

  function onAnnotationsChange(e) {
    renderCounts();
    renderList();
    renderPins();
    if (cardId) {
      const ann = PT.annotations.get(cardId);
      if (!ann) {
        closeCard({ removeIfEmpty: false });
      } else if (e && e.source === 'card') {
        // keep input focus
      } else {
        // keep card values in sync when anchors update / status changed elsewhere
        const content = document.getElementById('ann-card-content');
        if (content && document.activeElement !== content) content.value = ann.content || '';
        const prd = document.getElementById('ann-card-prd');
        if (prd && document.activeElement !== prd) prd.value = ann.prdRef || '';
        document.getElementById('ann-card-selector').textContent = ann.selector || '（无选择器）';
        document.getElementById('ann-card-text').textContent = ann.textSnapshot || '';
        document.getElementById('ann-card-seq').textContent = '#' + ann.seq;
        document.getElementById('ann-card-orphan').hidden = !ann._orphan;
        document.getElementById('ann-card-time').textContent = '创建 ' + Core.formatDateShort(ann.createdAt) + ' · 更新 ' + Core.formatDateShort(ann.updatedAt);
        setCardStatus(ann.status);
      }
    }
    const toggle = document.getElementById('ann-preview-toggle');
    if (toggle) toggle.checked = PT.annotations.getShowInPreview();
  }

  PT.annotationUI = {
    init,
    renderAll,
    renderList,
    renderPins,
    openCard,
    closeCard,
    positionCard,
    renderBanner
  };
})();
