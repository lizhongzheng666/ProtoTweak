/* ProtoTweak — copy / paste (element, image, HTML, text) */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;
  const CUSTOM_TYPE = 'application/x-pt-fragment';
  const LEGACY_CUSTOM_TYPE = 'application/x-wb-fragment';
  let boundDocs = new WeakSet();

  function mode() { return PT.app ? PT.app.getMode() : 'edit'; }
  function annotationMode() { return PT.annotations && PT.annotations.isMode(); }
  function canEdit() {
    return mode() === 'edit' && !annotationMode() && PT.app && PT.app.isLoaded();
  }

  function init() {
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('paste', onPaste, true);
  }

  function bind(doc) {
    if (!doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    doc.addEventListener('copy', onCopy, true);
    doc.addEventListener('cut', onCut, true);
    doc.addEventListener('paste', onPaste, true);
  }

  function selectionPayload() {
    const sel = PT.selection ? PT.selection.getSelected() : null;
    if (!sel) return null;
    try {
      const win = PT.stage.getDoc().defaultView;
      if (win && win.getSelection && String(win.getSelection()).trim()) return null;
    } catch (err) { /* ignore */ }
    return {
      sel,
      html: PT.stage.cleanElementHTML(sel),
      text: Core.normalizeText(sel.textContent || '')
    };
  }

  async function copySelection() {
    if (!canEdit()) return false;
    if (PT.textEdit && PT.textEdit.isEditing()) return false;
    const payload = selectionPayload();
    if (!payload) return false;
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new window.ClipboardItem({
          'text/html': new Blob([payload.html], { type: 'text/html' }),
          'text/plain': new Blob([payload.text], { type: 'text/plain' })
        })]);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload.text);
      } else {
        throw new Error('clipboard unavailable');
      }
      Core.toast('已复制元素', 'success', 1400);
      return true;
    } catch (err) {
      try {
        if (document.execCommand('copy')) return true;
      } catch (e2) { /* fall through */ }
      Core.toast('复制失败，请使用 Ctrl+C', 'error', 2200);
      return false;
    }
  }

  function onCopy(e) {
    if (!canEdit()) return;
    if (PT.textEdit && PT.textEdit.isEditing()) return;
    if (Core.isEditableTarget(document.activeElement)) return;
    const payload = selectionPayload();
    if (!payload) return;
    try {
      e.clipboardData.setData(CUSTOM_TYPE, payload.html);
      e.clipboardData.setData('text/html', payload.html);
      e.clipboardData.setData('text/plain', payload.text);
      e.preventDefault();
      Core.toast('已复制元素', 'success', 1400);
    } catch (err) {
      // Let the browser handle it if custom clipboard is unavailable.
    }
  }

  function onCut(e) {
    if (!canEdit()) return;
    if (PT.textEdit && PT.textEdit.isEditing()) return;
    if (Core.isEditableTarget(document.activeElement)) return;
    const payload = selectionPayload();
    if (!payload) return;
    try {
      e.clipboardData.setData(CUSTOM_TYPE, payload.html);
      e.clipboardData.setData('text/html', payload.html);
      e.clipboardData.setData('text/plain', payload.text);
      e.preventDefault();
      Core.toast('已剪切元素', 'success', 1400);
      PT.inspector.deleteSelected();
    } catch (err) {
      // Let the browser handle native cut if custom clipboard is unavailable.
    }
  }

  function onPaste(e) {
    if (!canEdit()) return;
    if (PT.textEdit && PT.textEdit.isEditing()) return;
    const active = document.activeElement;
    if (Core.isEditableTarget(active)) return;
    const data = e.clipboardData;
    if (!data) return;

    // Image first: paste from a screenshot tool often also carries HTML.
    if (data.items) {
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        if (item.kind === 'file' && item.type && item.type.indexOf('image/') === 0) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            insertImage(file);
            return;
          }
        }
      }
    }

    const custom = data.getData(CUSTOM_TYPE) || data.getData(LEGACY_CUSTOM_TYPE);
    const html = custom || data.getData('text/html');
    if (html && /<\/?[a-z][\s\S]*>/i.test(html)) {
      e.preventDefault();
      e.stopPropagation();
      insertHtml(html);
      return;
    }

    const text = data.getData('text/plain');
    if (text && text.trim()) {
      e.preventDefault();
      e.stopPropagation();
      insertText(text);
    }
  }

  function insertImage(file) {
    Core.readFileAsDataURL(file).then((src) => {
      if (!canEdit()) return;
      const doc = PT.stage.getDoc();
      const sel = PT.selection ? PT.selection.getSelected() : null;
      if (sel && sel.tagName === 'IMG' && sel.isConnected) {
        if (PT.history) PT.history.begin('粘贴图片', { kind: 'image-replace', target: 'img', fileName: file.name });
        sel.src = src;
        if (PT.history) PT.history.end(true);
        PT.selection.select(sel);
        PT.stage.scheduleLayout();
        Core.toast('图片已替换', 'success');
        return;
      }
      const img = doc.createElement('img');
      img.src = src;
      img.alt = file.name || '粘贴的图片';
      img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;display:block;margin:12px 0;';
      const target = getInsertTarget();
      if (target.cell && target.cell.isConnected) target.cell.appendChild(img);
      else if (target.after && target.after.parentNode) target.after.parentNode.insertBefore(img, target.after.nextSibling);
      else doc.body.appendChild(img);
      if (PT.history) PT.history.commit('粘贴图片', { kind: 'paste-image', fileName: file.name, size: file.size });
      PT.selection.select(img);
      PT.stage.scrollTo(img);
      PT.stage.scheduleLayout();
      Core.toast('图片已粘贴（已内嵌）', 'success');
    }).catch(() => Core.toast('图片读取失败', 'error'));
  }

  function insertHtml(raw) {
    const parsed = parseHtml(raw);
    if (!parsed.nodes.length) {
      Core.toast('没有可粘贴的 HTML 内容', 'info');
      return;
    }
    const doc = PT.stage.getDoc();
    const target = getInsertTarget();
    const inserted = [];
    const tableRow = parsed.nodes.find((n) => n.tagName === 'TR');
    const tableCell = parsed.nodes.find((n) => n.tagName === 'TD' || n.tagName === 'TH');

    try {
      if (target.cell && tableRow) {
        const tr = target.cell.parentElement;
        parsed.nodes.forEach((n) => {
          const node = doc.importNode(n, true);
          tr.parentNode.insertBefore(node, tr.nextSibling);
          inserted.push(node);
        });
      } else if (target.cell && tableCell) {
        parsed.nodes.forEach((n) => {
          const node = doc.importNode(n, true);
          target.cell.parentNode.insertBefore(node, target.cell.nextSibling);
          inserted.push(node);
        });
      } else if (target.cell) {
        parsed.nodes.forEach((n) => {
          const node = doc.importNode(n, true);
          target.cell.appendChild(node);
          inserted.push(node);
        });
      } else if (target.after && target.after.parentNode) {
        let ref = target.after.nextSibling;
        parsed.nodes.forEach((n) => {
          const node = doc.importNode(n, true);
          target.after.parentNode.insertBefore(node, ref);
          inserted.push(node);
        });
      } else {
        parsed.nodes.forEach((n) => {
          const node = doc.importNode(n, true);
          doc.body.appendChild(node);
          inserted.push(node);
        });
      }
    } catch (err) {
      Core.toast('粘贴 HTML 失败', 'error');
      return;
    }

    if (!inserted.length) return;
    dedupeIds(inserted);
    if (PT.history) {
      PT.history.commit('粘贴 HTML', {
        kind: 'paste-html',
        count: inserted.length,
        styles: parsed.styles.length,
        tags: inserted.map((n) => n.tagName.toLowerCase()).slice(0, 5).join(', ')
      });
    }
    const firstEl = inserted.find((n) => n.nodeType === 1 && n.tagName !== 'STYLE') || inserted[0];
    if (firstEl && firstEl.nodeType === 1) {
      PT.selection.select(firstEl);
      PT.stage.scrollTo(firstEl);
    }
    PT.stage.scheduleLayout();
    Core.toast('已粘贴 ' + inserted.length + ' 个节点' + (parsed.styles.length ? '（含样式）' : ''), 'success');
  }

  function parseHtml(raw) {
    const parser = new DOMParser();
    const source = parser.parseFromString(String(raw), 'text/html');
    const styles = Array.from(source.head.querySelectorAll('style')).map((s) => s.outerHTML);
    const nodes = [];
    const bodyNodes = Array.from(source.body.childNodes);
    bodyNodes.forEach((node) => {
      const clean = sanitizeNode(node);
      if (clean) nodes.push(clean);
    });
    styles.forEach((styleHtml) => {
      const wrapper = parser.parseFromString(styleHtml, 'text/html');
      const style = wrapper.body.firstElementChild;
      if (style) nodes.unshift(style);
    });
    return { nodes, styles };
  }

  function sanitizeNode(node) {
    if (node.nodeType === 3) {
      const text = node.textContent;
      return text && text.trim() ? document.createTextNode(text) : null;
    }
    if (node.nodeType !== 1) return null;
    const tag = node.tagName;
    if (['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE'].indexOf(tag) !== -1) return null;
    const clone = node.cloneNode(true);
    sanitizeElement(clone);
    return clone;
  }

  function sanitizeElement(root) {
    const all = [root].concat(Array.from(root.querySelectorAll('*')));
    all.forEach((el) => {
      if (el.nodeType !== 1) return;
      Array.from(el.attributes || []).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value || '';
        if (name.indexOf('on') === 0 || name.indexOf('data-pt-') === 0) {
          el.removeAttribute(attr.name);
        } else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        }
      });
      if (el.hasAttribute('contenteditable')) el.removeAttribute('contenteditable');
    });
    // Drop nested dangerous tags that survived cloning.
    root.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach((n) => n.remove());
  }

  function dedupeIds(nodes) {
    const doc = PT.stage.getDoc();
    nodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      const all = [node].concat(Array.from(node.querySelectorAll('[id]')));
      all.forEach((el) => {
        const id = el.getAttribute('id');
        if (!id) return;
        let matches = [];
        try { matches = doc.querySelectorAll('#' + Core.cssEscape(id)); } catch (e) { matches = []; }
        if (matches.length > 1) {
          el.setAttribute('id', id + '-' + Core.shortId().slice(0, 4));
        }
      });
    });
  }

  function insertText(text) {
    const doc = PT.stage.getDoc();
    const p = doc.createElement('p');
    p.textContent = text;
    p.style.cssText = 'margin:12px 0;font-size:16px;line-height:1.7;white-space:pre-wrap;';
    const target = getInsertTarget();
    if (target.cell && target.cell.isConnected) target.cell.appendChild(p);
    else if (target.after && target.after.parentNode) target.after.parentNode.insertBefore(p, target.after.nextSibling);
    else doc.body.appendChild(p);
    if (PT.history) PT.history.commit('粘贴文本', { kind: 'paste-text', length: text.length });
    PT.selection.select(p);
    PT.stage.scrollTo(p);
    PT.stage.scheduleLayout();
    Core.toast('已粘贴文本', 'success');
  }

  function getInsertTarget() {
    const sel = PT.selection ? PT.selection.get() : null;
    if (!sel || !sel.element) return { after: null, cell: null };
    if (sel.kind === 'cell') return { after: null, cell: sel.element };
    if (sel.kind === 'table' && sel.cell) return { after: null, cell: sel.cell };
    const doc = PT.stage.getDoc();
    if (sel.element === doc.body || sel.element === doc.documentElement) return { after: null, cell: null };
    return { after: sel.element, cell: null };
  }

  PT.clipboard = { init, bind, copySelection };
})();
