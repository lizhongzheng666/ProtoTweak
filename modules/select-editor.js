/* ProtoTweak — <select> option editor */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let modal = null;
  let listEl = null;
  let multipleEl = null;
  let currentSelect = null;
  let groups = [];
  let rows = [];

  function init() {
    modal = document.getElementById('select-modal');
    listEl = document.getElementById('select-option-list');
    multipleEl = document.getElementById('select-multiple');
    document.getElementById('select-add-row').addEventListener('click', addRow);
    document.getElementById('select-cancel').addEventListener('click', cancel);
    document.getElementById('select-save').addEventListener('click', save);
    multipleEl.addEventListener('change', () => {
      rows.forEach((r) => { if (!multipleEl.checked) r.selected = false; });
      render();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cancel();
    });
    Core.on('mode:change', () => { if (modal && !modal.hidden) cancel(); });
  }

  function open(select) {
    if (!select || select.tagName !== 'SELECT') return;
    if (PT.app && !PT.app.canEdit()) return;
    if (PT.inspector) PT.inspector.commitActive();
    currentSelect = select;
    rows = readRows(select);
    groups = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label);
    multipleEl.checked = !!select.multiple;
    if (PT.history) {
      PT.history.begin('编辑下拉选项', {
        kind: 'select-options',
        target: PT.anchors ? PT.anchors.elementLabel(select) : 'select',
        beforeCount: rows.length
      });
    }
    render();
    modal.hidden = false;
    const first = listEl.querySelector('input[data-field="label"]');
    if (first) setTimeout(() => first.focus(), 0);
  }

  function readRows(select) {
    return Array.from(select.options).map((opt) => ({
      label: opt.label || opt.textContent || '',
      value: opt.value,
      selected: opt.selected,
      disabled: opt.disabled,
      group: opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' ? opt.parentElement.label : ''
    }));
  }

  function addRow() {
    rows.push({
      label: '选项 ' + (rows.length + 1),
      value: 'value-' + (rows.length + 1),
      selected: false,
      disabled: false,
      group: ''
    });
    render();
    const inputs = listEl.querySelectorAll('input[data-field="label"]');
    const last = inputs[inputs.length - 1];
    if (last) {
      last.focus();
      last.select();
    }
  }

  function removeRow(index) {
    rows.splice(index, 1);
    render();
  }

  function moveRow(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const tmp = rows[index];
    rows[index] = rows[target];
    rows[target] = tmp;
    render();
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'select-empty';
      empty.textContent = '还没有选项，点击下方“添加选项”。';
      listEl.appendChild(empty);
      return;
    }
    rows.forEach((row, index) => {
      const el = document.createElement('div');
      el.className = 'select-row';
      el.dataset.index = String(index);
      el.innerHTML =
        '<div class="select-row-handle">' + (index + 1) + '</div>' +
        '<div class="select-row-fields">' +
        '  <label class="mini-field"><span>显示文字</span><input data-field="label" type="text" value="' + Core.escapeAttr(row.label) + '"></label>' +
        '  <label class="mini-field"><span>value</span><input data-field="value" type="text" value="' + Core.escapeAttr(row.value) + '"></label>' +
        '  <label class="mini-field"><span>分组（可选）</span><input data-field="group" type="text" value="' + Core.escapeAttr(row.group) + '" list="select-group-list"></label>' +
        '</div>' +
        '<div class="select-row-side">' +
        '  <label class="check-inline"><input data-field="selected" type="' + (multipleEl.checked ? 'checkbox' : 'radio') + '" name="wb-select-default" ' + (row.selected ? 'checked' : '') + '> 默认</label>' +
        '  <label class="check-inline"><input data-field="disabled" type="checkbox" ' + (row.disabled ? 'checked' : '') + '> 禁用</label>' +
        '  <div class="select-row-btns">' +
        '    <button type="button" data-action="up" title="上移">↑</button>' +
        '    <button type="button" data-action="down" title="下移">↓</button>' +
        '    <button type="button" data-action="delete" class="danger" title="删除">×</button>' +
        '  </div>' +
        '</div>';
      el.querySelectorAll('input').forEach((input) => {
        const field = input.dataset.field;
        const handler = () => {
          if (field === 'label') row.label = input.value;
          else if (field === 'value') row.value = input.value;
          else if (field === 'group') row.group = input.value;
          else if (field === 'disabled') row.disabled = input.checked;
          else if (field === 'selected') {
            if (!multipleEl.checked) rows.forEach((r, i) => { if (i !== index) r.selected = false; });
            row.selected = input.checked;
          }
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      });
      el.querySelector('[data-action="up"]').addEventListener('click', () => moveRow(index, -1));
      el.querySelector('[data-action="down"]').addEventListener('click', () => moveRow(index, 1));
      el.querySelector('[data-action="delete"]').addEventListener('click', () => removeRow(index));
      listEl.appendChild(el);
    });
    const datalist = document.getElementById('select-group-list');
    if (datalist) {
      datalist.innerHTML = groups.filter(Boolean).map((g) => '<option value="' + Core.escapeAttr(g) + '"></option>').join('');
    }
  }

  function collect() {
    const out = [];
    listEl.querySelectorAll('.select-row').forEach((rowEl, index) => {
      const row = rows[index];
      if (!row) return;
      row.label = rowEl.querySelector('[data-field="label"]').value;
      row.value = rowEl.querySelector('[data-field="value"]').value;
      row.group = rowEl.querySelector('[data-field="group"]').value;
      row.selected = rowEl.querySelector('[data-field="selected"]').checked;
      row.disabled = rowEl.querySelector('[data-field="disabled"]').checked;
      out.push(row);
    });
    // Ensure single-select always has one selected value.
    if (!multipleEl.checked && out.length && !out.some((r) => r.selected)) out[0].selected = true;
    return out;
  }

  function save() {
    if (!currentSelect || !currentSelect.isConnected) return cancel();
    const nextRows = collect();
    const select = currentSelect;
    while (select.firstChild) select.removeChild(select.firstChild);
    const groupMap = new Map();
    nextRows.forEach((row) => {
      const opt = select.ownerDocument.createElement('option');
      opt.textContent = row.label;
      opt.value = row.value;
      opt.selected = !!row.selected;
      opt.disabled = !!row.disabled;
      if (row.group && row.group.trim()) {
        const label = row.group.trim();
        let group = groupMap.get(label);
        if (!group) {
          group = select.ownerDocument.createElement('optgroup');
          group.label = label;
          groupMap.set(label, group);
          select.appendChild(group);
        }
        group.appendChild(opt);
      } else {
        select.appendChild(opt);
      }
    });
    select.multiple = !!multipleEl.checked;
    if (PT.history) {
      PT.history.updateMeta({ count: nextRows.length });
      PT.history.end(true);
    }
    hide();
    if (PT.selection) PT.selection.select(select);
    if (PT.stage) PT.stage.scheduleLayout();
    Core.toast('下拉选项已更新', 'success');
  }

  function cancel() {
    if (PT.history) PT.history.cancel();
    hide();
  }

  function hide() {
    if (modal) modal.hidden = true;
    currentSelect = null;
    rows = [];
  }

  function isOpen() {
    return !!(modal && !modal.hidden);
  }

  PT.selectEditor = { init, open, cancel, isOpen };
})();
