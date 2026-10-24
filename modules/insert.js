/* ProtoTweak — insert menu and templates */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let tableModal = null;
  let imageInput = null;
  let imageContext = null;

  const TYPES = {
    text: { label: '文本段', tag: 'p' },
    heading: { label: '标题', tag: 'h2' },
    button: { label: '按钮', tag: 'button' },
    image: { label: '图片', tag: 'img' },
    divider: { label: '分割线', tag: 'hr' },
    container: { label: '容器', tag: 'div' },
    list: { label: '列表', tag: 'ul' },
    table: { label: '表格', tag: 'table' }
  };

  function init() {
    Core.$$('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', () => insert(btn.dataset.insert));
    });
    tableModal = document.getElementById('table-modal');
    imageInput = document.getElementById('image-file-input');
    document.getElementById('table-cancel').addEventListener('click', () => { tableModal.hidden = true; });
    document.getElementById('table-insert').addEventListener('click', insertTable);
    tableModal.addEventListener('click', (e) => { if (e.target === tableModal) tableModal.hidden = true; });
    imageInput.addEventListener('change', onImagePicked);
    Core.on('mode:change', () => {
      if (tableModal && !tableModal.hidden) tableModal.hidden = true;
    });
  }

  function canInsert() {
    return PT.app && PT.app.canEdit();
  }

  function insert(type) {
    if (!canInsert()) {
      Core.toast('批注/预览模式下不能插入元素', 'info');
      return;
    }
    if (!PT.app.isLoaded()) return;
    if (PT.inspector) PT.inspector.commitActive();
    if (type === 'table') {
      openTableModal();
      return;
    }
    if (type === 'image') {
      imageContext = getContext();
      imageInput.value = '';
      imageInput.click();
      return;
    }
    const doc = PT.stage.getDoc();
    const el = createByType(doc, type);
    if (!el) return;
    placeElement(el, getContext(), type);
    Core.toast('已插入' + (TYPES[type] ? TYPES[type].label : '元素'), 'success');
  }

  function createByType(doc, type) {
    let el;
    switch (type) {
      case 'text':
        el = doc.createElement('p');
        el.textContent = '在这里输入文本内容…';
        el.style.cssText = 'margin:12px 0;font-size:16px;line-height:1.7;color:#1f2937;';
        break;
      case 'heading':
        el = doc.createElement('h2');
        el.textContent = '标题文本';
        el.style.cssText = 'margin:20px 0 12px;font-size:28px;line-height:1.3;font-weight:700;color:#111827;';
        break;
      case 'button':
        el = doc.createElement('button');
        el.type = 'button';
        el.textContent = '按钮文本';
        el.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;padding:10px 24px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:15px;font-weight:600;cursor:pointer;';
        break;
      case 'divider':
        el = doc.createElement('hr');
        el.style.cssText = 'border:0;height:1px;background:#e5e7eb;margin:24px 0;';
        break;
      case 'container':
        el = doc.createElement('div');
        el.textContent = '容器内容';
        el.style.cssText = 'padding:20px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;margin:12px 0;min-height:72px;color:#1f2937;';
        break;
      case 'list':
        el = doc.createElement('ul');
        el.style.cssText = 'margin:12px 0;padding-left:24px;line-height:1.8;font-size:16px;color:#1f2937;';
        ['列表项 1', '列表项 2', '列表项 3'].forEach((text) => {
          const li = doc.createElement('li');
          li.textContent = text;
          el.appendChild(li);
        });
        break;
      default:
        return null;
    }
    return el;
  }

  function getContext() {
    const sel = PT.selection ? PT.selection.get() : null;
    return {
      element: sel ? sel.element : null,
      kind: sel ? sel.kind : 'element',
      cell: sel ? sel.cell : null
    };
  }

  function placeElement(el, context, type) {
    const doc = PT.stage.getDoc();
    if (!el) return;
    if (context.cell && context.cell.isConnected && type !== 'table') {
      context.cell.appendChild(el);
    } else if (context.element && context.element !== doc.body && context.element !== doc.documentElement) {
      context.element.parentNode.insertBefore(el, context.element.nextSibling);
    } else {
      doc.body.appendChild(el);
    }
    if (PT.history) {
      PT.history.commit('插入' + (TYPES[type] ? TYPES[type].label : '元素'), {
        kind: 'insert',
        element: type,
        tag: el.tagName.toLowerCase()
      });
    }
    PT.selection.select(el);
    PT.stage.scrollTo(el);
    PT.stage.scheduleLayout();
  }

  function openTableModal() {
    tableModal.hidden = false;
    const rows = document.getElementById('table-rows');
    const cols = document.getElementById('table-cols');
    if (!rows.value) rows.value = '3';
    if (!cols.value) cols.value = '3';
    setTimeout(() => rows.focus(), 0);
  }

  function insertTable() {
    const rows = Math.max(1, Math.min(20, parseInt(document.getElementById('table-rows').value, 10) || 3));
    const cols = Math.max(1, Math.min(20, parseInt(document.getElementById('table-cols').value, 10) || 3));
    const header = document.getElementById('table-header').checked;
    const doc = PT.stage.getDoc();
    const table = doc.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;color:#1f2937;';
    if (header) {
      const thead = doc.createElement('thead');
      const tr = doc.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const th = doc.createElement('th');
        th.textContent = '表头 ' + (c + 1);
        th.style.cssText = 'padding:10px 12px;border:1px solid #e5e7eb;background:#f8fafc;text-align:left;font-weight:600;';
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    const tbody = doc.createElement('tbody');
    const bodyRows = header ? Math.max(0, rows - 1) : rows;
    for (let r = 0; r < bodyRows; r++) {
      const tr = doc.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = doc.createElement('td');
        td.textContent = '内容 ' + (r + 1) + '-' + (c + 1);
        td.style.cssText = 'padding:10px 12px;border:1px solid #e5e7eb;';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    const context = getContext();
    let anchorTable = null;
    if (context.kind === 'table') anchorTable = context.element;
    else if (context.kind === 'cell' && context.cell) anchorTable = context.cell.closest('table');
    if (anchorTable && anchorTable.parentNode) {
      anchorTable.parentNode.insertBefore(table, anchorTable.nextSibling);
    } else if (context.element && context.element !== doc.body && context.element !== doc.documentElement) {
      context.element.parentNode.insertBefore(table, context.element.nextSibling);
    } else {
      doc.body.appendChild(table);
    }
    tableModal.hidden = true;
    if (PT.history) {
      PT.history.commit('插入表格', { kind: 'insert', element: 'table', rows, cols, header });
    }
    PT.selection.selectTable(table, table.querySelector('td,th'));
    PT.stage.scrollTo(table);
    PT.stage.scheduleLayout();
    Core.toast('已插入 ' + rows + '×' + cols + ' 表格', 'success');
  }

  function onImagePicked() {
    const file = imageInput.files && imageInput.files[0];
    if (!file) return;
    const context = imageContext || getContext();
    imageContext = null;
    Core.readFileAsDataURL(file).then((src) => {
      if (!canInsert()) return;
      const doc = PT.stage.getDoc();
      const sel = context.element;
      if (sel && sel.tagName === 'IMG' && sel.isConnected) {
        if (PT.history) PT.history.begin('替换图片', { kind: 'image-replace', target: 'img' });
        sel.src = src;
        if (PT.history) PT.history.end(true);
        PT.selection.select(sel);
        PT.stage.scheduleLayout();
        Core.toast('图片已替换', 'success');
        return;
      }
      const img = doc.createElement('img');
      img.src = src;
      img.alt = file.name || '图片';
      img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;display:block;margin:12px 0;';
      if (context.cell && context.cell.isConnected) context.cell.appendChild(img);
      else if (context.element && context.element !== doc.body && context.element !== doc.documentElement) {
        context.element.parentNode.insertBefore(img, context.element.nextSibling);
      } else {
        doc.body.appendChild(img);
      }
      if (PT.history) PT.history.commit('粘贴/插入图片', { kind: 'insert-image', fileName: file.name, size: file.size });
      PT.selection.select(img);
      PT.stage.scrollTo(img);
      PT.stage.scheduleLayout();
      Core.toast('图片已插入（已内嵌为 data URL）', 'success');
    }).catch(() => {
      Core.toast('图片读取失败', 'error');
    });
  }

  PT.insert = { init, insert, openTableModal };
})();
