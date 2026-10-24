/* ProtoTweak — element context menu */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  let menu = null;
  let target = null;
  const boundDocs = new WeakSet();

  function init() {
    document.addEventListener('mousedown', onOutsideDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    Core.on('stage:ready', (e) => bindDoc(e.doc));
    if (PT.stage && PT.stage.isReady()) bindDoc(PT.stage.getDoc());
  }

  function bindDoc(doc) {
    if (!doc || boundDocs.has(doc)) return;
    boundDocs.add(doc);
    doc.addEventListener('contextmenu', onContextMenu, true);
    doc.addEventListener('scroll', close, true);
    doc.addEventListener('mousedown', (e) => {
      if (menu && !menu.hidden && !menu.contains(e.target)) close();
    }, true);
  }

  function allowed() {
    return PT.app && PT.app.getMode() === 'edit' && PT.app.isLoaded() && !PT.annotations.isMode();
  }

  function onContextMenu(e) {
    if (!allowed()) return;
    const el = e.target && e.target.nodeType === 1 ? e.target : null;
    if (!el) return;
    e.preventDefault();
    target = el;
    if (PT.selection) PT.selection.select(el, { silent: false });
    showAt(e.clientX, e.clientY);
  }

  function ensureMenu() {
    if (menu) return menu;
    menu = document.createElement('div');
    menu.className = 'pt-context-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
      '<button type="button" data-cm="copy" role="menuitem">复制<span class="pt-shortcut">Ctrl+C</span></button>' +
      '<button type="button" data-cm="delete" role="menuitem" class="danger">删除<span class="pt-shortcut">Delete</span></button>' +
      '<div class="pt-context-sep"></div>' +
      '<button type="button" data-cm="edit" role="menuitem">编辑文字</button>' +
      '<button type="button" data-cm="annotate" role="menuitem">添加批注</button>';
    menu.addEventListener('mousedown', (e) => e.stopPropagation());
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cm]');
      if (!btn) return;
      const action = btn.dataset.cm;
      const el = target;
      close();
      if (!el || !el.isConnected) return;
      if (action === 'copy') {
        if (PT.clipboard && PT.clipboard.copySelection) PT.clipboard.copySelection();
      } else if (action === 'delete') {
        if (PT.inspector) PT.inspector.deleteSelected();
      } else if (action === 'edit') {
        if (PT.textEdit && PT.textEdit.isEditable(el)) PT.textEdit.start(el);
        else Core.toast('该元素不支持直接编辑文字', 'info', 1800);
      } else if (action === 'annotate') {
        const ann = PT.annotations ? PT.annotations.add(el) : null;
        if (!ann) return;
        const tab = document.querySelector('[data-rail-tab="annot"]');
        if (tab) tab.click();
        if (PT.annotationUI) PT.annotationUI.openCard(ann.id, { isNew: true });
      }
    });
    document.body.appendChild(menu);
    return menu;
  }

  function showAt(clientX, clientY) {
    ensureMenu();
    const iframe = PT.stage.getIframe();
    const rect = iframe ? iframe.getBoundingClientRect() : { left: 0, top: 0 };
    menu.hidden = false;
    menu.style.left = Math.max(8, rect.left + clientX) + 'px';
    menu.style.top = Math.max(8, rect.top + clientY) + 'px';
    requestAnimationFrame(() => {
      if (!menu || menu.hidden) return;
      const box = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left + clientX, window.innerWidth - box.width - 8));
      const top = Math.max(8, Math.min(rect.top + clientY, window.innerHeight - box.height - 8));
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      const first = menu.querySelector('button');
      if (first) first.focus({ preventScroll: true });
    });
  }

  function onOutsideDown(e) {
    if (!menu || menu.hidden) return;
    if (menu.contains(e.target)) return;
    close();
  }

  function onKeyDown(e) {
    if (!menu || menu.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function close() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    target = null;
  }

  PT.contextMenu = { init, close };
})();
