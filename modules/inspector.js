/* ProtoTweak — style inspector */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let bodyEl = null;
  let emptyEl = null;
  let tagEl = null;
  let pathEl = null;
  let activeField = null;
  let fieldBefore = '';
  let disabled = false;
  let syncing = false;
  let nudgeTimer = null;
  let optionListEl = null;

  const COLOR_PROPS = new Set(['color', 'background-color', 'border-color']);
  const UNITLESS = new Set(['opacity', 'line-height', 'font-weight', 'z-index']);
  const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA']);

  function init() {
    bodyEl = document.getElementById('inspector-body');
    emptyEl = document.getElementById('inspector-empty');
    tagEl = document.getElementById('ins-tag');
    pathEl = document.getElementById('ins-path');
    optionListEl = document.getElementById('ins-option-list');

    document.getElementById('inspector').addEventListener('focusin', onFocusIn);
    document.getElementById('inspector').addEventListener('focusout', onFocusOut);
    document.getElementById('inspector').addEventListener('input', onInput);
    document.getElementById('inspector').addEventListener('change', onChange);
    document.getElementById('inspector').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target && e.target.matches && e.target.matches('input,textarea')) {
        e.preventDefault();
        e.target.blur();
      }
    });

    document.getElementById('ins-option-add').addEventListener('click', addOption);
    if (optionListEl) {
      optionListEl.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('[data-option-delete]');
        if (!btn) return;
        removeOption(Number(btn.dataset.optionDelete));
      });
    }

    Core.$$('.seg[data-align] button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!canEdit() || !PT.selection.getSelected()) return;
        const el = PT.selection.getSelected();
        beginField(btn, 'text-align', PT.stage.getDoc().defaultView.getComputedStyle(el).textAlign);
        setStyle(el, 'text-align', btn.dataset.val);
        Core.$$('.seg[data-align] button').forEach((b) => b.classList.toggle('on', b === btn));
        endField();
      });
    });

    Core.$('#op-reset-pos').addEventListener('click', () => {
      const el = PT.selection.getSelected();
      if (!el || !canEdit()) return;
      PT.app.confirm('重置该元素的位置偏移？', { title: '重置位置', confirmText: '重置' }).then((ok) => {
        if (!ok || !el.isConnected) return;
        if (PT.history) PT.history.begin('重置位置', { kind: 'move', target: label(el), dx: 0, dy: 0 });
        PT.move.setOffset(el, 0, 0);
        if (PT.history) PT.history.end(true);
        if (PT.stage) PT.stage.scheduleLayout();
        sync();
        Core.toast('位置已重置', 'success', 1600);
      });
    });

    document.getElementById('op-duplicate').addEventListener('click', duplicate);
    document.getElementById('op-up').addEventListener('click', () => moveSibling(-1));
    document.getElementById('op-down').addEventListener('click', () => moveSibling(1));
    document.getElementById('op-delete').addEventListener('click', deleteSelected);
    document.getElementById('op-clear-style').addEventListener('click', clearStyle);
    document.getElementById('op-select-table').addEventListener('click', () => {
      if (!canEdit()) return;
      const table = PT.selection.getTable();
      if (!table) return;
      PT.selection.selectTable(table, PT.selection.getActiveCell());
    });

    Core.on('selection:change', sync);
    Core.on('layout', () => {
      if (!bodyEl || bodyEl.hidden) return;
      syncGeometry();
    });
    Core.on('mode:change', sync);
    Core.on('annotations:mode', sync);
    Core.on('history:restore', sync);
    sync();
  }

  function mode() { return PT.app ? PT.app.getMode() : 'edit'; }
  function annotationMode() { return PT.annotations && PT.annotations.isMode(); }
  function canEdit() {
    return mode() === 'edit' && !annotationMode() && !disabled && !!PT.selection.getSelected();
  }

  function label(el) {
    return PT.anchors ? PT.anchors.elementLabel(el) : (el ? el.tagName.toLowerCase() : '');
  }

  function onFocusIn(e) {
    const field = e.target;
    if (!field || !field.matches || !field.matches('input,textarea,select')) return;
    if (!canEdit()) {
      field.blur();
      return;
    }
    if (activeField && activeField !== field) endField();
    if (activeField === field) return;
    const el = PT.selection.getSelected();
    if (!el) return;
    activeField = field;
    if (field.dataset.move) {
      fieldBefore = String(PT.move.getOffset(el)[field.dataset.move] || 0);
      beginField(field, 'move-' + field.dataset.move, fieldBefore);
    } else if (field.id === 'ins-text') {
      fieldBefore = el.textContent || '';
      beginField(field, 'text-content', Core.truncate(Core.normalizeText(fieldBefore), 60));
    } else if (field.id === 'ins-field-value') {
      fieldBefore = el.value || '';
      beginField(field, 'form-value', Core.truncate(fieldBefore, 80));
    } else if (field.id === 'ins-field-placeholder') {
      fieldBefore = el.getAttribute('placeholder') || '';
      beginField(field, 'form-placeholder', Core.truncate(fieldBefore, 80));
    } else if (field.id === 'ins-select-placeholder') {
      const ph = el.querySelector('option[data-pt-placeholder]');
      fieldBefore = ph ? ph.textContent : '';
      beginField(field, 'select-placeholder', Core.truncate(fieldBefore, 80));
    } else if (field.dataset.optionField) {
      const opt = getOption(Number(field.dataset.optionIndex), field.dataset.optionField);
      fieldBefore = opt ? (field.dataset.optionField === 'value' ? opt.value : opt.textContent) : '';
      beginField(field, 'option-' + field.dataset.optionField, Core.truncate(fieldBefore, 80));
    } else {
      const prop = field.dataset.css;
      if (!prop) return;
      fieldBefore = currentStyleValue(el, prop);
      beginField(field, prop, fieldBefore);
    }
  }

  function beginField(field, prop, before) {
    if (!PT.history) return;
    PT.history.begin('修改样式', {
      kind: 'style',
      target: label(PT.selection.getSelected()),
      property: prop,
      before: String(before == null ? '' : before),
      after: String(before == null ? '' : before)
    });
  }

  function onFocusOut(e) {
    if (!activeField) return;
    const next = e.relatedTarget;
    if (next && document.getElementById('inspector').contains(next)) {
      // focusin on the next field will handle its own transaction
    }
    endField();
  }

  function endField() {
    if (!activeField) return;
    activeField = null;
    if (PT.history) PT.history.end(true);
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function commitActive() {
    if (activeField) endField();
  }

  function onInput(e) {
    const field = e.target;
    if (!field || !field.matches || !field.matches('input,textarea,select')) return;
    if (!canEdit()) return;
    ensureActiveField(field);
    if (field.id === 'ins-text') {
      applyText(field);
      return;
    }
    if (field.id === 'ins-field-value') {
      applyFieldValue(field);
      return;
    }
    if (field.id === 'ins-field-placeholder') {
      applyFieldPlaceholder(field);
      return;
    }
    if (field.id === 'ins-select-placeholder') {
      applySelectPlaceholder(field);
      return;
    }
    if (field.dataset.optionField) {
      applyOptionField(field);
      return;
    }
    if (field.dataset.move) {
      applyMove(field);
      return;
    }
    if (field.dataset.css) applyStyle(field);
  }

  function onChange(e) {
    const field = e.target;
    if (!field || !field.matches || !field.matches('input,textarea,select')) return;
    if (activeField === field) endField();
  }

  function ensureActiveField(field) {
    if (activeField) return;
    const el = PT.selection.getSelected();
    if (!el) return;
    activeField = field;
    if (field.dataset.move) {
      fieldBefore = String(PT.move.getOffset(el)[field.dataset.move] || 0);
      beginField(field, 'move-' + field.dataset.move, fieldBefore);
    } else if (field.id === 'ins-text') {
      fieldBefore = el.textContent || '';
      beginField(field, 'text-content', Core.truncate(Core.normalizeText(fieldBefore), 60));
    } else if (field.id === 'ins-field-value') {
      fieldBefore = el.value || '';
      beginField(field, 'form-value', Core.truncate(fieldBefore, 80));
    } else if (field.id === 'ins-field-placeholder') {
      fieldBefore = el.getAttribute('placeholder') || '';
      beginField(field, 'form-placeholder', Core.truncate(fieldBefore, 80));
    } else if (field.id === 'ins-select-placeholder') {
      const ph = el.querySelector('option[data-pt-placeholder]');
      fieldBefore = ph ? ph.textContent : '';
      beginField(field, 'select-placeholder', Core.truncate(fieldBefore, 80));
    } else if (field.dataset.optionField) {
      const opt = getOption(Number(field.dataset.optionIndex), field.dataset.optionField);
      fieldBefore = opt ? (field.dataset.optionField === 'value' ? opt.value : opt.textContent) : '';
      beginField(field, 'option-' + field.dataset.optionField, Core.truncate(fieldBefore, 80));
    } else if (field.dataset.css) {
      const prop = field.dataset.css;
      fieldBefore = currentStyleValue(el, prop);
      beginField(field, prop, fieldBefore);
    }
  }

  function applyText(field) {
    const el = PT.selection.getSelected();
    if (!el) return;
    if (FIELD_TAGS.has(el.tagName) || el.tagName === 'SELECT') return;
    if (!isLeafText(el)) return;
    el.textContent = field.value;
    emitFieldEvents(el);
    if (PT.history) PT.history.updateMeta({ after: Core.truncate(field.value, 60) });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function applyFieldValue(field) {
    const el = PT.selection.getSelected();
    if (!el || !FIELD_TAGS.has(el.tagName)) return;
    el.value = field.value;
    if (el.tagName === 'INPUT') el.setAttribute('value', field.value);
    else el.textContent = field.value;
    emitFieldEvents(el);
    if (PT.history) PT.history.updateMeta({ after: Core.truncate(field.value, 80) });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function applyFieldPlaceholder(field) {
    const el = PT.selection.getSelected();
    if (!el || !FIELD_TAGS.has(el.tagName)) return;
    if (field.value) el.setAttribute('placeholder', field.value);
    else el.removeAttribute('placeholder');
    emitFieldEvents(el);
    if (PT.history) PT.history.updateMeta({ after: Core.truncate(field.value, 80) });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function applySelectPlaceholder(field) {
    const select = PT.selection.getSelected();
    if (!select || select.tagName !== 'SELECT') return;
    const doc = select.ownerDocument;
    let opt = select.querySelector('option[data-pt-placeholder]');
    const text = field.value || '';

    if (!text.trim()) {
      if (opt) {
        const wasSelected = opt.selected;
        opt.remove();
        if (wasSelected && select.options.length) select.selectedIndex = 0;
      }
    } else {
      if (!opt) {
        opt = doc.createElement('option');
        opt.dataset.ptPlaceholder = '1';
        opt.value = '';
        opt.disabled = true;
        const hasExplicitSelected = Array.from(select.options).some((o) => o.hasAttribute('selected'));
        opt.selected = !hasExplicitSelected;
        select.insertBefore(opt, select.firstChild);
      }
      opt.textContent = text;
      if (select.selectedIndex < 0) opt.selected = true;
    }

    emitFieldEvents(select);
    if (PT.history) PT.history.updateMeta({ after: Core.truncate(text, 80) });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function emitFieldEvents(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* ignore */ }
  }

  function getOption(index, field) {
    const select = PT.selection.getSelected();
    if (!select || select.tagName !== 'SELECT') return null;
    return select.options[index] || null;
  }

  function applyOptionField(field) {
    const opt = getOption(Number(field.dataset.optionIndex), field.dataset.optionField);
    if (!opt) return;
    if (field.dataset.optionField === 'value') opt.value = field.value;
    else opt.textContent = field.value;
    const select = opt.closest('select');
    emitFieldEvents(select || opt);
    if (PT.history) PT.history.updateMeta({ after: Core.truncate(field.value, 80) });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function renderOptions(select) {
    if (!optionListEl) return;
    optionListEl.innerHTML = '';
    const realOptions = select && select.tagName === 'SELECT'
      ? Array.from(select.options).filter((opt) => !opt.hasAttribute('data-pt-placeholder'))
      : [];
    if (!realOptions.length) {
      const empty = document.createElement('div');
      empty.className = 'ins-option-empty';
      empty.textContent = '还没有选项';
      optionListEl.appendChild(empty);
      return;
    }
    realOptions.forEach((opt) => {
      const row = document.createElement('div');
      row.className = 'ins-option-row';
      const index = Array.prototype.indexOf.call(select.options, opt);
      const label = document.createElement('input');
      label.type = 'text';
      label.value = opt.textContent || '';
      label.placeholder = '显示文字';
      label.dataset.optionIndex = String(index);
      label.dataset.optionField = 'label';
      const value = document.createElement('input');
      value.type = 'text';
      value.value = opt.value;
      value.placeholder = 'value';
      value.dataset.optionIndex = String(index);
      value.dataset.optionField = 'value';
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '删除选项';
      del.dataset.optionDelete = String(index);
      row.append(label, value, del);
      optionListEl.appendChild(row);
    });
  }

  function addOption() {
    const select = PT.selection.getSelected();
    if (!select || select.tagName !== 'SELECT' || !canEdit()) return;
    if (PT.history) {
      PT.history.begin('添加下拉选项', {
        kind: 'select-options',
        target: label(select)
      });
    }
    const opt = select.ownerDocument.createElement('option');
    const n = select.options.length + 1;
    opt.textContent = '选项 ' + n;
    opt.value = 'value-' + n;
    select.appendChild(opt);
    if (PT.history) PT.history.end(true);
    renderOptions(select);
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function removeOption(index) {
    const select = PT.selection.getSelected();
    if (!select || select.tagName !== 'SELECT' || !canEdit()) return;
    if (!select.options[index]) return;
    if (PT.history) {
      PT.history.begin('删除下拉选项', {
        kind: 'select-options',
        target: label(select)
      });
    }
    select.options[index].remove();
    if (PT.history) PT.history.end(true);
    renderOptions(select);
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function applyMove(field) {
    const el = PT.selection.getSelected();
    if (!el) return;
    const x = parseFloat(document.getElementById('ins-x').value) || 0;
    const y = parseFloat(document.getElementById('ins-y').value) || 0;
    PT.move.setOffset(el, x, y);
    if (PT.history) PT.history.updateMeta({ after: x + ',' + y });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function applyStyle(field) {
    const el = PT.selection.getSelected();
    if (!el) return;
    const prop = field.dataset.css;
    let value = field.value;
    if (field.type === 'color') {
      value = field.value;
      syncColorPair(field, value);
    } else if (field.classList.contains('hex')) {
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())) {
        return;
      }
      value = value.trim();
      syncColorPair(field, value);
    } else if (field.dataset.unit && value.trim() !== '' && !UNITLESS.has(prop)) {
      if (/^-?\d+(\.\d+)?$/.test(value.trim())) value = value.trim() + field.dataset.unit;
    }
    if ((prop === 'width' || prop === 'height') && value.trim() !== '' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      value = value.trim() + 'px';
    }
    if (prop === 'opacity' && value.trim() !== '') {
      value = String(Core.clamp(parseFloat(value) || 0, 0, 1));
    }
    setStyle(el, prop, value);
    if (PT.history) PT.history.updateMeta({ after: value });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  function setStyle(el, prop, value) {
    if (!el) return;
    if (value === '' || value == null) el.style.removeProperty(prop);
    else el.style.setProperty(prop, value);
  }

  function syncColorPair(field, value) {
    if (!field.parentElement) return;
    const prop = field.dataset.css;
    const color = field.parentElement.querySelector('input[type="color"][data-css="' + prop + '"]');
    const hex = field.parentElement.querySelector('.hex[data-css="' + prop + '"]');
    if (field.type === 'color') {
      if (hex) hex.value = value;
    } else if (color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
      color.value = value.length === 4
        ? '#' + value.slice(1).split('').map((c) => c + c).join('')
        : value;
    }
  }

  function currentStyleValue(el, prop) {
    const cs = PT.stage.getDoc().defaultView.getComputedStyle(el);
    const inline = el.style.getPropertyValue(prop);
    return inline || cs.getPropertyValue(prop) || '';
  }

  function sync() {
    if (!bodyEl) return;
    const el = PT.selection.getSelected();
    if (!el) {
      bodyEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.querySelector('.empty-title').textContent = '未选中元素';
      emptyEl.querySelector('.empty-desc').textContent = '按住 Ctrl/Cmd 单击元素查看和修改样式。';
      return;
    }
    bodyEl.hidden = false;
    emptyEl.hidden = true;
    tagEl.textContent = '<' + el.tagName.toLowerCase() + '>';
    pathEl.textContent = PT.anchors ? PT.anchors.elementPath(el) : el.tagName.toLowerCase();

    const cs = PT.stage.getDoc().defaultView.getComputedStyle(el);
    const off = PT.move.getOffset(el);
    setVal('ins-x', Math.round(off.x));
    setVal('ins-y', Math.round(off.y));
    setVal('ins-width', Math.round(parseFloat(cs.width) || 0));
    setVal('ins-height', Math.round(parseFloat(cs.height) || 0));

    if (isLeafText(el) && document.activeElement !== document.getElementById('ins-text')) {
      document.getElementById('ins-text').value = el.textContent || '';
    }
    const textField = document.getElementById('ins-text');
    const textDisabled = FIELD_TAGS.has(el.tagName) || el.tagName === 'SELECT' || !isLeafText(el);
    textField.disabled = disabled || textDisabled;
    textField.placeholder = FIELD_TAGS.has(el.tagName) || el.tagName === 'SELECT'
      ? '表单控件请使用上方字段编辑'
      : (isLeafText(el) ? '输入文案…' : '含子元素，请双击页面内编辑');

    const fieldGroup = document.getElementById('inspector-field-group');
    const isField = FIELD_TAGS.has(el.tagName);
    if (fieldGroup) fieldGroup.hidden = !isField;
    if (isField) {
      setVal('ins-field-value', el.value || '');
      const placeholderField = document.getElementById('ins-field-placeholder');
      if (placeholderField && document.activeElement !== placeholderField) {
        placeholderField.value = el.getAttribute('placeholder') || '';
      }
    }

    const selectGroup = document.getElementById('inspector-select-group');
    const isSelect = el.tagName === 'SELECT';
    if (selectGroup) selectGroup.hidden = !isSelect;
    if (isSelect) {
      const ph = el.querySelector('option[data-pt-placeholder]');
      setVal('ins-select-placeholder', ph ? ph.textContent : '');
    }
    if (isSelect && optionListEl && !optionListEl.contains(document.activeElement)) {
      renderOptions(el);
    } else if (!isSelect && optionListEl) {
      optionListEl.innerHTML = '';
    }

    setCssField('font-family', cs.fontFamily || '');
    setCssField('font-size', Math.round(parseFloat(cs.fontSize) || 0));
    setCssField('font-weight', cs.fontWeight || '');
    const lineHeightPx = parseFloat(cs.lineHeight);
    const fontSizePx = parseFloat(cs.fontSize);
    setCssField('line-height', cs.lineHeight && cs.lineHeight !== 'normal' && fontSizePx
      ? Math.round((lineHeightPx / fontSizePx) * 100) / 100
      : '');
    setCssField('letter-spacing', cs.letterSpacing && cs.letterSpacing !== 'normal' ? parseFloat(cs.letterSpacing) : '');
    setCssField('color', Core.rgbToHex(cs.color));
    setCssField('background-color', Core.rgbToHex(cs.backgroundColor));
    setCssField('opacity', cs.opacity === '' ? 1 : cs.opacity);
    setCssField('border-width', Math.round(parseFloat(cs.borderTopWidth) || 0));
    setCssField('border-style', cs.borderTopStyle === 'none' ? '' : cs.borderTopStyle);
    setCssField('border-color', Core.rgbToHex(cs.borderTopColor));
    setCssField('border-radius', Math.round(parseFloat(cs.borderTopLeftRadius) || 0));
    setCssField('box-shadow', cs.boxShadow === 'none' ? '' : cs.boxShadow);
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      setCssField('padding-' + side, Math.round(parseFloat(cs['padding' + cap(side)]) || 0));
      setCssField('margin-' + side, Math.round(parseFloat(cs['margin' + cap(side)]) || 0));
    });

    Core.$$('.seg[data-align] button').forEach((b) => {
      b.classList.toggle('on', b.dataset.val === cs.textAlign);
    });

    const tableGroup = document.getElementById('inspector-table-group');
    const tableForGroup = PT.selection.getTable();
    if (PT.selection.isTable() || (PT.selection.isCell() && tableForGroup)) {
      tableGroup.hidden = false;
      const table = PT.selection.isTable() ? el : tableForGroup;
      const pos = PT.selection.cellPosition(PT.selection.getActiveCell());
      document.getElementById('ins-table-label').textContent = tableSize(table);
      document.getElementById('ins-table-cell').textContent = pos ? 'R' + pos.row + 'C' + pos.col : '—';
    } else {
      tableGroup.hidden = true;
    }

    setDisabled(disabled || mode() !== 'edit' || annotationMode());
  }

  function tableSize(table) {
    if (!table) return '';
    const rows = table.rows.length;
    let cols = 0;
    for (let i = 0; i < rows; i++) {
      let n = 0;
      for (let j = 0; j < table.rows[i].cells.length; j++) n += Math.max(1, table.rows[i].cells[j].colSpan || 1);
      cols = Math.max(cols, n);
    }
    return rows + ' 行 × ' + cols + ' 列';
  }

  function syncGeometry() {
    if (syncing) return;
    const el = PT.selection.getSelected();
    if (!el || !bodyEl || bodyEl.hidden) return;
    if (activeField && (activeField.dataset.move || ['ins-width', 'ins-height'].indexOf(activeField.id) !== -1)) return;
    const cs = PT.stage.getDoc().defaultView.getComputedStyle(el);
    const off = PT.move.getOffset(el);
    setVal('ins-x', Math.round(off.x));
    setVal('ins-y', Math.round(off.y));
    setVal('ins-width', Math.round(parseFloat(cs.width) || 0));
    setVal('ins-height', Math.round(parseFloat(cs.height) || 0));
  }

  function setVal(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (document.activeElement === el) return;
    el.value = value == null ? '' : value;
  }

  function setCssField(prop, value) {
    const fields = Core.$$('[data-css="' + prop + '"]', document.getElementById('inspector'));
    fields.forEach((field) => {
      if (field === document.activeElement) return;
      let v = value;
      if (field.type === 'color') {
        v = Core.rgbToHex(value) || field.value || '#000000';
        if (!value || value === 'rgba(0, 0, 0, 0)') v = '#ffffff';
      } else if (field.classList.contains('hex')) {
        v = Core.rgbToHex(value) || '';
      } else if (field.tagName === 'SELECT') {
        v = String(value || '');
      } else if (field.type === 'number') {
        const n = parseFloat(value);
        v = Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
      }
      field.value = v == null ? '' : v;
    });
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function isLeafText(el) {
    if (!el) return false;
    return !el.children || el.children.length === 0;
  }

  function setDisabled(value) {
    disabled = !!value;
    const root = document.getElementById('inspector');
    if (!root) return;
    root.classList.toggle('readonly', disabled);
    Core.$$('input,textarea,select,button', root).forEach((el) => {
      if (el.id === 'op-delete' || el.id === 'op-duplicate' || el.id === 'op-up' || el.id === 'op-down' || el.id === 'op-clear-style' || el.id === 'op-reset-pos' || el.hasAttribute('data-table-op')) {
        el.disabled = disabled;
      } else {
        el.disabled = disabled;
      }
    });
    if (!disabled) {
      const el = PT.selection.getSelected();
      if (el) {
        const textField = document.getElementById('ins-text');
        if (textField) textField.disabled = FIELD_TAGS.has(el.tagName) || el.tagName === 'SELECT' || !isLeafText(el);
      }
    }
  }

  function duplicate() {
    const el = PT.selection.getSelected();
    if (!el || !canEdit() || !el.parentNode) return;
    if (PT.selection.getKind() === 'cell') {
      Core.toast('单元格请用表格上下文栏调整，不能单独复制', 'info');
      return;
    }
    const clone = el.cloneNode(true);
    clone.removeAttribute('data-pt-aid');
    clone.removeAttribute('data-pt-ce');
    clone.removeAttribute('contenteditable');
    clone.removeAttribute('spellcheck');
    clone.querySelectorAll('[data-pt-aid]').forEach((n) => n.removeAttribute('data-pt-aid'));
    // Duplicate IDs make selectors and annotations ambiguous; keep classes/styles,
    // drop IDs on the copy instead of creating a second #same-id element.
    if (clone.id) clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    el.after(clone);
    if (PT.history) PT.history.commit('复制元素', { kind: 'duplicate', target: label(el) });
    PT.selection.select(clone);
    if (PT.stage) PT.stage.scrollTo(clone);
    Core.toast('已复制元素', 'success');
  }

  function moveSibling(dir) {
    const el = PT.selection.getSelected();
    if (!el || !canEdit() || !el.parentElement) return;
    if (PT.selection.getKind() === 'cell') {
      Core.toast('单元格请用表格上下文栏调整行列', 'info');
      return;
    }
    if (dir < 0 && el.previousElementSibling) {
      el.parentElement.insertBefore(el, el.previousElementSibling);
    } else if (dir > 0 && el.nextElementSibling) {
      el.parentElement.insertBefore(el.nextElementSibling, el);
    } else {
      return;
    }
    if (PT.history) PT.history.commit(dir < 0 ? '上移元素' : '下移元素', { kind: 'reorder', target: label(el) });
    if (PT.stage) PT.stage.scheduleLayout();
  }

  async function deleteSelected() {
    const el = PT.selection.getSelected();
    if (!el || !canEdit()) return;
    if (PT.selection.getKind() === 'cell') {
      Core.toast('单元格请用表格上下文栏的行列按钮调整', 'info');
      return;
    }
    const tag = el.tagName.toLowerCase();
    const text = Core.truncate(Core.normalizeText(el.textContent), 40);
    const parent = el.parentElement;
    const ok = await PT.app.confirm('删除选中的 <' + tag + '> 元素？此操作可用 Ctrl+Z 撤销。', {
      title: '删除元素',
      confirmText: '删除'
    });
    if (!ok || !el.isConnected) return;
    el.remove();
    PT.selection.clear();
    if (PT.history) PT.history.commit('删除元素', { kind: 'delete', tag, text });
    if (PT.annotations) PT.annotations.refreshAnchors('structure');
    if (parent && PT.stage) PT.stage.scheduleLayout();
    Core.toast('已删除元素', 'info');
  }

  function clearStyle() {
    const el = PT.selection.getSelected();
    if (!el || !canEdit()) return;
    PT.app.confirm('清除该元素的所有内联样式？此操作可用 Ctrl+Z 撤销。', {
      title: '清除内联样式',
      confirmText: '清除'
    }).then((ok) => {
      if (!ok || !el.isConnected) return;
      if (PT.history) PT.history.begin('清除内联样式', { kind: 'style', target: label(el), property: 'style' });
      el.removeAttribute('style');
      if (PT.history) PT.history.end(true);
      sync();
      if (PT.stage) PT.stage.scheduleLayout();
      Core.toast('已清除内联样式', 'info');
    });
  }

  function nudge(dx, dy) {
    const el = PT.selection.getSelected();
    if (!el || !canEdit() || PT.selection.getKind() === 'cell') return;
    if (!nudgeTimer) {
      if (PT.history) {
        PT.history.begin('微调位置', { kind: 'move', target: label(el), dx: 0, dy: 0 });
      }
    }
    const offset = PT.move.getOffset(el);
    PT.move.setOffset(el, offset.x + dx, offset.y + dy);
    if (PT.stage) PT.stage.scheduleLayout();
    sync();
    if (nudgeTimer) clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(flushNudge, 400);
  }

  function flushNudge() {
    if (!nudgeTimer) return;
    clearTimeout(nudgeTimer);
    nudgeTimer = null;
    if (PT.history) PT.history.end(true);
  }

  PT.inspector = {
    init,
    sync,
    setDisabled,
    duplicate,
    deleteSelected,
    nudge,
    flushNudge,
    canEdit,
    commitActive
  };
})();
