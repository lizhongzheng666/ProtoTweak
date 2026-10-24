/* ProtoTweak — annotation model, anchors, local persistence */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  const TYPES = ['字段含义', '业务逻辑', '边界情况', '交互说明'];
  const TYPE_LABELS = {
    '字段含义': '字段含义',
    '业务逻辑': '业务逻辑',
    '边界情况': '边界情况',
    '交互说明': '交互说明'
  };
  const DEFAULT_TYPE = '字段含义';
  const FALLBACK_TYPE = '交互说明';
  const STATUS_LABELS = { open: '未解决', resolved: '已解决' };
  const SCHEMA = 'prototweak.annotations/v1';

  let annotations = [];
  let nextSeq = 1;
  let docId = null;
  let docMeta = { fileName: 'prototype', sourceHash: '', title: '' };
  let mode = false;
  let showInPreview = false;
  let reanchorId = null;
  let boundDocs = new WeakSet();
  let storageOk = true;
  let migratedTypeCount = 0;

  const saveSoon = Core.debounce(() => flush(), 180);

  function init() {
    const prefs = PT.storage.loadPrefs();
    showInPreview = !!prefs.showInPreview;
    Core.on('layout', verify);
  }

  function bind(doc) {
    if (!doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    doc.addEventListener('click', onClick, true);
  }

  function onClick(e) {
    if (PT.pages && PT.pages.isSwitching()) return;
    if (PT.app && PT.app.getMode() === 'preview') return;
    if (!mode && !reanchorId) return;
    if (PT.textEdit && PT.textEdit.isEditing()) return;
    const target = e.target;
    if (!target || target.nodeType !== 1) return;
    const doc = PT.stage.getDoc();
    if (target === doc.documentElement) return;

    if (reanchorId) {
      e.preventDefault();
      e.stopImmediatePropagation();
      completeReanchor(target);
      return;
    }

    if (!mode) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (target === doc.body) {
      Core.toast('请点击页面里的具体元素，不要点空白处', 'info');
      return;
    }
    const ann = add(target);
    if (ann) {
      Core.emit('annotations:add', { id: ann.id });
      if (PT.annotationUI) PT.annotationUI.openCard(ann.id, { isNew: true });
    }
  }

  function setDocument(opts) {
    docId = opts.docId || null;
    docMeta = {
      fileName: opts.fileName || 'prototype',
      sourceHash: opts.sourceHash || '',
      title: opts.title || (PT.stage.getDoc() ? PT.stage.getDoc().title : '')
    };
    reanchorId = null;
    annotations = [];
    nextSeq = 1;
    const stored = docId ? PT.storage.loadAnnotations(docId) : null;
    if (stored && Array.isArray(stored.annotations)) {
      hydrate(stored);
    } else if (opts.fallbackData && Array.isArray(opts.fallbackData.annotations)) {
      hydrate(opts.fallbackData);
      saveNow();
    }
    refreshAnchors('load');
    Core.emit('annotations:change', { source: 'load' });
  }

  function hydrate(data) {
    migratedTypeCount = 0;
    annotations = (data.annotations || []).map((a, i) => normalize(a, i)).filter(Boolean);
    resequence();
    annotations.forEach((a) => {
      a._el = null;
      a._orphan = false;
    });
    if (migratedTypeCount > 0) {
      saveSoon();
      const count = migratedTypeCount;
      setTimeout(() => {
        Core.toast(count + ' 条批注的类型不在新分类中，已迁移为「' + FALLBACK_TYPE + '」', 'info', 4600);
      }, 0);
    }
  }

  // seq is a display rank, not a stable identity: sort by creation time and
  // renumber from 1 after every add/remove/import. Deleting #2 therefore makes
  // the next annotation #2 instead of leaving a gap.
  function resequence() {
    annotations.sort((a, b) => {
      const ta = Date.parse(a.createdAt);
      const tb = Date.parse(b.createdAt);
      const va = Number.isFinite(ta) ? ta : 0;
      const vb = Number.isFinite(tb) ? tb : 0;
      if (va !== vb) return va - vb;
      return (a._sortOrder || 0) - (b._sortOrder || 0);
    });
    annotations.forEach((a, i) => { a.seq = i + 1; });
    nextSeq = annotations.length + 1;
  }

  function normalize(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const now = Core.nowIso();
    const anchor = raw.anchor && typeof raw.anchor === 'object' ? Object.assign({}, raw.anchor) : {};
    const validType = TYPES.indexOf(raw.type) !== -1;
    if (!validType) migratedTypeCount++;
    const type = validType ? raw.type : FALLBACK_TYPE;
    const status = raw.status === 'resolved' ? 'resolved' : 'open';
    const seq = Number.isFinite(Number(raw.seq)) && Number(raw.seq) > 0 ? Number(raw.seq) : index + 1;
    return {
      id: raw.id || Core.uid('ann'),
      seq,
      _sortOrder: index,
      selector: String(raw.selector || anchor.selector || ''),
      textSnapshot: String(raw.textSnapshot || anchor.text || ''),
      content: String(raw.content || ''),
      type,
      status,
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || raw.createdAt || now,
      prdRef: String(raw.prdRef || ''),
      replies: Array.isArray(raw.replies) ? raw.replies.filter((r) => r && typeof r === 'object').map((r) => ({
        id: r.id || Core.uid('reply'),
        content: String(r.content || ''),
        createdAt: r.createdAt || now
      })) : [],
      anchor: {
        aid: String(anchor.aid || raw.aid || ''),
        tag: String(anchor.tag || ''),
        id: String(anchor.id || ''),
        classes: Array.isArray(anchor.classes) ? anchor.classes.slice(0, 8) : [],
        text: String(anchor.text || raw.textSnapshot || ''),
        ancestorTrail: Array.isArray(anchor.ancestorTrail) ? anchor.ancestorTrail.slice(0, 8) : [],
        index: Number(anchor.index) || 0,
        rect: anchor.rect && typeof anchor.rect === 'object' ? {
          x: Number(anchor.rect.x) || 0,
          y: Number(anchor.rect.y) || 0,
          w: Number(anchor.rect.w) || 0,
          h: Number(anchor.rect.h) || 0
        } : null
      },
      lastRect: raw.lastRect && typeof raw.lastRect === 'object' ? {
        x: Number(raw.lastRect.x) || 0,
        y: Number(raw.lastRect.y) || 0,
        w: Number(raw.lastRect.w) || 0,
        h: Number(raw.lastRect.h) || 0
      } : null
    };
  }

  function add(el) {
    if (!el || !el.isConnected || !PT.anchors) return null;
    const aid = PT.anchors.ensureAid(el);
    const fp = PT.anchors.fingerprint(el);
    const anchor = Object.assign({}, fp, { aid: aid });
    const sortOrder = annotations.reduce((m, a) => Math.max(m, a._sortOrder || 0), 0) + 1;
    const ann = {
      id: Core.uid('ann'),
      seq: 0,
      _sortOrder: sortOrder,
      selector: PT.anchors.generateSelector(el),
      textSnapshot: PT.anchors.textSnapshot(el),
      content: '',
      type: DEFAULT_TYPE,
      status: 'open',
      createdAt: Core.nowIso(),
      updatedAt: Core.nowIso(),
      prdRef: '',
      replies: [],
      anchor,
      lastRect: fp.rect || null,
      _el: el,
      _orphan: false
    };
    annotations.push(ann);
    resequence();
    saveSoon();
    Core.emit('annotations:change', { source: 'add', id: ann.id });
    Core.emit('annotations:event', { action: 'add', id: ann.id, seq: ann.seq });
    return ann;
  }

  function update(id, patch, opts) {
    const ann = get(id);
    if (!ann || !patch) return null;
    ['content', 'type', 'status', 'prdRef', 'replies', 'selector', 'textSnapshot', 'anchor', 'lastRect'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) ann[key] = patch[key];
    });
    if (patch.type && TYPES.indexOf(patch.type) === -1) ann.type = FALLBACK_TYPE;
    if (patch.status && patch.status !== 'resolved') ann.status = 'open';
    ann.updatedAt = Core.nowIso();
    saveSoon();
    Core.emit('annotations:change', { source: (opts && opts.source) || 'update', id });
    if (!opts || !opts.silentEvent) Core.emit('annotations:event', { action: 'update', id, seq: ann.seq });
    return ann;
  }

  function setStatus(id, status) {
    return update(id, { status: status === 'resolved' ? 'resolved' : 'open' }, { source: 'status' });
  }

  function remove(id, opts) {
    const index = annotations.findIndex((a) => a.id === id);
    if (index === -1) return false;
    const [ann] = annotations.splice(index, 1);
    resequence();
    saveSoon();
    Core.emit('annotations:change', { source: 'remove', id });
    if (!opts || !opts.silentEvent) Core.emit('annotations:event', { action: 'remove', id, seq: ann.seq });
    return true;
  }

  function refreshAnchors(reason) {
    if (!PT.stage || !PT.stage.isReady()) return;
    let changed = false;
    annotations.forEach((a) => {
      const aidElement = a.anchor && a.anchor.aid ? PT.anchors.queryByAid(a.anchor.aid) : null;
      const aidLive = !!(aidElement && aidElement.isConnected);
      // During in-session structural edits we never replace live nodes, so a
      // missing aid means the annotated element was deleted. Do not let a
      // nth-of-type selector silently attach to a shifted sibling.
      const el = (reason === 'structure' && a.anchor && a.anchor.aid && !aidLive)
        ? null
        : PT.anchors.resolve(a);
      if (el && el.isConnected) {
        a._el = el;
        a._orphan = false;
        const aid = PT.anchors.ensureAid(el);
        if (!a.anchor) a.anchor = {};
        if (a.anchor.aid !== aid) {
          a.anchor.aid = aid;
          changed = true;
        }
        const structure = ['load', 'import', 'structure', 'undo', 'reanchor'].indexOf(reason) !== -1;
        if (structure || !a.selector) {
          const sel = PT.anchors.generateSelector(el);
          if (sel && sel !== a.selector) {
            a.selector = sel;
            changed = true;
          }
        }
        if (structure || reason === 'text' || !a.textSnapshot) {
          const text = PT.anchors.textSnapshot(el);
          if (text !== a.textSnapshot) {
            a.textSnapshot = text;
            changed = true;
          }
        }
        const fp = PT.anchors.fingerprint(el);
        if (fp.rect) {
          a.lastRect = fp.rect;
          if (!a.anchor.rect || reason !== 'move') a.anchor.rect = fp.rect;
        }
        a.anchor.tag = fp.tag;
        a.anchor.id = fp.id;
        a.anchor.classes = fp.classes;
        a.anchor.text = fp.text;
        a.anchor.ancestorTrail = fp.ancestorTrail;
        a.anchor.index = fp.index;
      } else {
        a._el = null;
        a._orphan = true;
        if (!a.lastRect && a.anchor && a.anchor.rect) a.lastRect = Object.assign({}, a.anchor.rect);
        changed = true;
      }
    });
    if (changed) saveSoon();
    Core.emit('annotations:change', { source: 'anchors', reason });
  }

  function verify() {
    if (!PT.stage || !PT.stage.isReady()) return;
    let broken = false;
    annotations.forEach((a) => {
      if (a._el && !a._el.isConnected) broken = true;
    });
    if (broken) refreshAnchors('verify');
  }

  function resolveAll() {
    refreshAnchors('load');
  }

  function get(id) {
    return annotations.find((a) => a.id === id) || null;
  }

  function list() {
    return annotations.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  }
  function counts() {
    const total = annotations.length;
    const open = annotations.filter((a) => a.status === 'open').length;
    const resolved = annotations.filter((a) => a.status === 'resolved').length;
    const orphan = annotations.filter((a) => a._orphan).length;
    return { total, open, resolved, orphan };
  }

  function isMode() { return mode; }

  function setMode(value) {
    const next = !!value;
    if (next === mode) return;
    mode = next;
    if (next) {
      reanchorId = null;
    }
    if (PT.stage && PT.stage.isReady()) PT.stage.setAnnotationCursor(next);
    Core.emit('annotations:mode', { mode });
  }

  function setShowInPreview(value) {
    showInPreview = !!value;
    PT.storage.savePrefs({ showInPreview });
    Core.emit('annotations:change', { source: 'prefs' });
  }

  function getShowInPreview() { return showInPreview; }

  function focus(id) {
    const ann = get(id);
    if (!ann) return;
    const el = PT.anchors.resolve(ann);
    if (el) {
      ann._el = el;
      ann._orphan = false;
      PT.stage.scrollTo(el);
      if (PT.app && PT.app.getMode() === 'edit') {
        if (el.tagName === 'TABLE') {
          PT.selection.selectTable(el, PT.selection.firstCell(el));
        } else if (el.tagName === 'TD' || el.tagName === 'TH') {
          PT.selection.selectCell(el);
        } else if (el.closest && el.closest('table')) {
          const cell = el.closest('td,th');
          if (cell) PT.selection.selectCell(cell);
          else PT.selection.selectTable(el.closest('table'), PT.selection.firstCell(el.closest('table')));
        } else {
          PT.selection.select(el);
        }
      }
    } else {
      refreshAnchors('focus');
    }
    Core.emit('annotations:focus', { id });
  }

  function startReanchor(id) {
    const ann = get(id);
    if (!ann) return;
    const wasMode = mode;
    reanchorId = id;
    mode = false;
    if (PT.stage) PT.stage.setAnnotationCursor(true);
    if (wasMode) Core.emit('annotations:mode', { mode: false });
    Core.emit('annotations:reanchor', { id, active: true });
    Core.toast('请点击新的锚点元素；Esc 取消', 'info', 3200);
  }

  function cancelReanchor() {
    if (!reanchorId) return;
    reanchorId = null;
    if (PT.stage) PT.stage.setAnnotationCursor(mode);
    Core.emit('annotations:reanchor', { id: null, active: false });
  }

  function completeReanchor(el) {
    const ann = get(reanchorId);
    if (!ann || !el) {
      cancelReanchor();
      return;
    }
    if (el === PT.stage.getDoc().body || el === PT.stage.getDoc().documentElement) {
      Core.toast('不能锚定到页面空白，请点击具体元素', 'info');
      return;
    }
    const aid = PT.anchors.ensureAid(el);
    ann.anchor = Object.assign({}, PT.anchors.fingerprint(el), { aid });
    ann.selector = PT.anchors.generateSelector(el);
    ann.textSnapshot = PT.anchors.textSnapshot(el);
    ann.lastRect = ann.anchor.rect;
    ann._el = el;
    ann._orphan = false;
    ann.updatedAt = Core.nowIso();
    reanchorId = null;
    if (PT.stage) PT.stage.setAnnotationCursor(mode);
    saveSoon();
    Core.emit('annotations:reanchor', { id: ann.id, active: false });
    Core.emit('annotations:change', { source: 'reanchor', id: ann.id });
    Core.emit('annotations:event', { action: 'reanchor', id: ann.id, seq: ann.seq });
    Core.toast('已重新锚定 #' + ann.seq, 'success');
    if (PT.annotationUI) PT.annotationUI.openCard(ann.id, { isNew: false });
  }

  function serializeData() {
    return {
      nextSeq,
      annotations: list().map((a) => ({
        id: a.id,
        seq: a.seq,
        selector: a.selector,
        textSnapshot: a.textSnapshot,
        content: a.content,
        type: a.type,
        status: a.status,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        prdRef: a.prdRef,
        replies: a.replies || [],
        anchor: Object.assign({}, a.anchor),
        lastRect: a.lastRect || null,
        orphan: !!a._orphan
      }))
    };
  }

  function serializeFile() {
    const d = PT.stage.getDoc();
    return {
      schema: SCHEMA,
      doc: {
        fileName: docMeta.fileName,
        title: d ? d.title || '' : '',
        sourceHash: docMeta.sourceHash,
        exportedAt: Core.nowIso()
      },
      nextSeq,
      annotations: serializeData().annotations
    };
  }

  function importFile(data) {
    let parsed = data;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch (e) {
        throw new Error('JSON 解析失败');
      }
    }
    if (Array.isArray(parsed)) parsed = { annotations: parsed, nextSeq: 1 };
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.annotations)) {
      throw new Error('不是有效的批注 JSON（缺少 annotations 数组）');
    }
    hydrate(parsed);
    saveNow();
    refreshAnchors('import');
    Core.emit('annotations:change', { source: 'import' });
    Core.emit('annotations:event', { action: 'import', count: annotations.length });
    return annotations.length;
  }

  function saveNow() {
    if (!docId) return false;
    storageOk = PT.storage.saveAnnotations(docId, serializeData());
    return storageOk;
  }

  function flush() {
    saveSoon.cancel();
    return saveNow();
  }

  function unload() {
    annotations = [];
    nextSeq = 1;
    docId = null;
    reanchorId = null;
    mode = false;
    if (PT.stage && PT.stage.isReady()) PT.stage.setAnnotationCursor(false);
    Core.emit('annotations:change', { source: 'unload' });
    Core.emit('annotations:mode', { mode: false });
  }

  function getDocId() { return docId; }
  function getDocMeta() { return Object.assign({}, docMeta); }
  function isStorageOk() { return storageOk; }
  function isReanchor() { return !!reanchorId; }

  PT.annotations = {
    init,
    bind,
    setDocument,
    add,
    update,
    setStatus,
    remove,
    refreshAnchors,
    resolveAll,
    verify,
    get,
    list,
    counts,
    isMode,
    setMode,
    setShowInPreview,
    getShowInPreview,
    focus,
    startReanchor,
    cancelReanchor,
    isReanchor,
    serializeData,
    serializeFile,
    importFile,
    saveNow,
    flush,
    unload,
    getDocId,
    getDocMeta,
    isStorageOk,
    TYPE_LABELS,
    STATUS_LABELS,
    TYPES
  };
})();
