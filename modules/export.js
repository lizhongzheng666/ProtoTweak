/* ProtoTweak — clean/review HTML, PDF, JSON, Markdown exports */
(function () {
  'use strict';

  const PT = window.PT;
  const Core = PT.core;

  function init() {}

  function fileBase() {
    const name = PT.app && PT.app.getFileName() ? PT.app.getFileName() : 'prototype';
    return Core.fileNameWithoutExt(name);
  }

  function cleanHtml() {
    return PT.stage.serialize({ keepAid: false });
  }

  function reviewHtml() {
    const clone = PT.stage.cleanClone({ keepAid: true });
    if (!clone) return cleanHtml();
    const body = clone.querySelector('body');
    const head = clone.querySelector('head');
    if (!body) return cleanHtml();
    const owner = clone.ownerDocument;
    const data = PT.annotations.serializeFile();
    const dataScript = owner.createElement('script');
    dataScript.type = 'application/json';
    dataScript.id = '__pt_annotation_data';
    dataScript.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    const viewerScript = owner.createElement('script');
    viewerScript.setAttribute('data-pt-viewer', '');
    viewerScript.textContent = '(' + reviewViewer.toString() + ')();';
    body.appendChild(dataScript);
    body.appendChild(viewerScript);
    if (head && !head.querySelector('meta[charset]')) {
      const meta = owner.createElement('meta');
      meta.setAttribute('charset', 'utf-8');
      head.insertBefore(meta, head.firstChild);
    }
    return PT.stage.getDoctype() + '\n' + clone.outerHTML;
  }

  function exportClean() {
    if (!requireDoc()) return;
    Core.download(fileBase() + '.html', cleanHtml(), 'text/html;charset=utf-8');
    Core.toast('已导出干净 HTML', 'success');
  }

  function exportReview() {
    if (!requireDoc()) return;
    const count = PT.annotations.counts().total;
    Core.download(fileBase() + '.review.html', reviewHtml(), 'text/html;charset=utf-8');
    Core.toast('已导出评审版（' + count + ' 条批注）', 'success');
  }

  function exportAnnotations() {
    if (!requireDoc()) return;
    const data = PT.annotations.serializeFile();
    Core.download(fileBase() + '.annotations.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    Core.toast('批注 JSON 已导出', 'success');
  }

  function exportMarkdown() {
    if (!requireDoc()) return;
    PT.changelog.download();
  }

  function exportPdf() {
    if (!requireDoc()) return;
    let html = cleanHtml();
    const printCss = [
      '<style id="__pt_print_style">',
      '@media print {',
      '  html, body { overflow: visible !important; height: auto !important; min-height: 0 !important; }',
      '  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  section { page-break-inside: avoid; break-inside: avoid; }',
      '  .fade-in, .fade-up, .reveal, .animate-on-scroll, [class*="fade-in"], [class*="fade-up"] {',
      '    opacity: 1 !important; transform: none !important; visibility: visible !important;',
      '  }',
      '}',
      '</style>'
    ].join('\n');
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, printCss + '\n</head>');
    else html = printCss + html;

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1100px;height:800px;border:0;';
    document.body.appendChild(frame);
    frame.onload = () => {
      setTimeout(() => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } catch (e) {
          openPrintWindow(html);
        }
        setTimeout(() => frame.remove(), 1500);
      }, 400);
    };
    frame.srcdoc = html;
    Core.toast('已打开打印对话框，可另存为 PDF', 'info', 3200);
  }

  function openPrintWindow(html) {
    const win = window.open('', '_blank');
    if (!win) {
      Core.toast('浏览器拦截了打印窗口，请允许弹窗后重试', 'error');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      setTimeout(() => win.close(), 1200);
    }, 300);
  }

  function requireDoc() {
    if (!PT.app || !PT.app.isLoaded()) {
      Core.toast('还没有打开文档', 'info');
      return false;
    }
    if (PT.textEdit && PT.textEdit.isEditing()) PT.textEdit.finish({ commit: true });
    if (PT.inspector) PT.inspector.commitActive();
    return true;
  }

  // -------------------------------------------------------------------------
  // Review viewer. This function is stringified into the exported review HTML.
  // It must stay self-contained: no PT references, no external CSS/JS.
  // -------------------------------------------------------------------------
  function reviewViewer() {
    var dataEl = document.getElementById('__pt_annotation_data');
    if (!dataEl) return;
    var data;
    try { data = JSON.parse(dataEl.textContent || '{}'); } catch (e) { return; }
    var anns = (data && data.annotations) || [];
    if (!anns.length) return;
    var TYPE = { '字段含义': '字段含义', '业务逻辑': '业务逻辑', '边界情况': '边界情况', '交互说明': '交互说明' };
    var STATUS = { open: '未解决', resolved: '已解决' };
    var host = document.createElement('div');
    host.setAttribute('data-pt-ui', 'review');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;';
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = document.createElement('style');
    style.textContent = [
      ':host { all: initial; }',
      '.layer { position: fixed; inset: 0; pointer-events: none; z-index: 1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }',
      '.pin { position: fixed; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fdfcfa; background: #d4753d; color: #fff; font: 600 11px/16px -apple-system, "Segoe UI", "PingFang SC", sans-serif; text-align: center; box-shadow: 0 3px 10px rgba(28,22,15,.35); pointer-events: auto; cursor: pointer; padding: 0; }',
      '.pin.resolved { background: #ebe7df; color: #9a938b; }',
      '.pin.orphan { background: #c24d45; border-style: dashed; }',
      '.pin.active { outline: 2px solid rgba(91,106,208,.2); outline-offset: 2px; }',
      '.card { position: fixed; width: 330px; max-height: 70vh; overflow: auto; background: #fff; color: #1c1a17; border: 1px solid rgba(28,22,15,.08); border-radius: 12px; box-shadow: 0 18px 50px rgba(28,22,15,.22); pointer-events: auto; font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; z-index: 4; }',
      '.card[hidden] { display: none !important; }',
      '.card-hd { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid rgba(28,22,15,.06); }',
      '.seq { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; padding: 0 7px; border-radius: 999px; background: rgba(91,106,208,.08); color: #5b6ad0; font-weight: 700; font-size: 12px; }',
      '.type { font-size: 12px; color: #625c55; }',
      '.close { margin-left: auto; border: 0; background: transparent; font-size: 20px; line-height: 1; color: #9a938b; cursor: pointer; }',
      '.body { padding: 12px 14px 14px; }',
      '.content { white-space: pre-wrap; color: #1c1a17; font-size: 13px; line-height: 1.7; }',
      '.meta { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }',
      '.badge { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; font-size: 11px; background: #f2efe9; color: #625c55; }',
      '.badge.resolved { background: rgba(79,138,99,.1); color: #4f8a63; }',
      '.badge.orphan { background: rgba(194,77,69,.09); color: #c24d45; }',
      '.prd { margin-top: 8px; font-size: 12px; color: #625c55; }',
      '.anchor { margin-top: 10px; padding: 8px 10px; border-radius: 8px; background: #f9f7f3; border: 1px solid rgba(28,22,15,.06); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #625c55; word-break: break-all; }',
      '.orphan-note { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: rgba(194,77,69,.09); color: #c24d45; font-size: 12px; }',
      '.hint { position: fixed; right: 14px; bottom: 14px; padding: 6px 10px; border-radius: 999px; background: rgba(28,22,15,.82); color: #fff; font: 11px/1.4 -apple-system, "Segoe UI", "PingFang SC", sans-serif; pointer-events: none; z-index: 3; }'
    ].join('\n');
    root.appendChild(style);
    var layer = document.createElement('div');
    layer.className = 'layer';
    root.appendChild(layer);
    var card = document.createElement('div');
    card.className = 'card';
    card.hidden = true;
    card.innerHTML = '<div class="card-hd"><span class="seq"></span><span class="type"></span><button class="close" type="button" aria-label="关闭">×</button></div><div class="body"><div class="content"></div><div class="meta"></div><div class="prd"></div><div class="anchor"></div><div class="orphan-note"></div></div>';
    root.appendChild(card);
    var hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '评审批注 ' + anns.length + ' 条 · 点击编号查看';
    root.appendChild(hint);
    var pins = {};
    var active = null;

    function resolve(a) {
      if (!a) return null;
      var anchor = a.anchor || {};
      if (anchor.aid) {
        try {
          var byAid = document.querySelector('[data-pt-aid="' + String(anchor.aid).replace(/"/g, '\\"') + '"]');
          if (byAid) return byAid;
        } catch (e) { /* ignore bad imported aid */ }
      }
      if (a.selector) {
        try {
          var list = document.querySelectorAll(a.selector);
          if (list.length === 1) return list[0];
          if (list.length > 1) return list[0];
        } catch (e) { /* ignore */ }
      }
      return null;
    }

    function rectOf(a) {
      var el = resolve(a);
      if (el) {
        var r = el.getBoundingClientRect();
        // A hidden page / display:none annotation returns a zero rect. Do not
        // fall back to lastRect in that case: it would pin the annotation at
        // the document's top-left corner.
        if (!r || r.width <= 0 || r.height <= 0) return null;
        try {
          var cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return null;
        } catch (e) { /* ignore */ }
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      }
      if (a.lastRect) {
        var lr = a.lastRect;
        var lx = Number(lr.x);
        var ly = Number(lr.y);
        var w = Number(lr.w) || 0;
        var h = Number(lr.h) || 0;
        // 0x0 lastRect is the placeholder for an unresolved anchor. Ignoring it
        // removes the stray annotation at the top-left of exported review HTML.
        if (!isFinite(lx) || !isFinite(ly) || w <= 0 || h <= 0) return null;
        if (lx === 0 && ly === 0) return null;
        var sx = window.scrollX || 0;
        var sy = window.scrollY || 0;
        return { left: lx - sx, top: ly - sy, right: lx - sx + w, bottom: ly - sy + h, width: w, height: h };
      }
      return null;
    }

    function render() {
      var stacks = {};
      anns.forEach(function (a) {
        var pin = pins[a.id];
        if (!pin) {
          pin = document.createElement('button');
          pin.type = 'button';
          pin.className = 'pin';
          pin.style.display = 'none';
          pin.textContent = String(a.seq);
          pin.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            open(a);
          });
          layer.appendChild(pin);
          pins[a.id] = pin;
        }
        pin.className = 'pin' + (a.status === 'resolved' ? ' resolved' : '') + (a.orphan ? ' orphan' : '') + (active === a.id ? ' active' : '');
        pin.textContent = String(a.seq);
      });
      position();
    }

    function position() {
      var stacks = {};
      anns.forEach(function (a) {
        var pin = pins[a.id];
        if (!pin) return;
        var r = rectOf(a);
        if (!r || r.width <= 0 || r.height <= 0) { pin.style.display = 'none'; return; }
        if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
          pin.style.display = 'none';
          return;
        }
        var key = a.anchor && a.anchor.aid ? a.anchor.aid : a.selector || a.id;
        var idx = stacks[key] || 0;
        stacks[key] = idx + 1;
        pin.style.display = 'block';
        var left = r.right - 10;
        var top = r.top - 10 + idx * 22;
        if (top < 2) top = Math.max(2, r.top + 4 + idx * 22);
        left = Math.max(2, Math.min(window.innerWidth - 24, left));
        top = Math.max(2, Math.min(window.innerHeight - 24, top));
        pin.style.left = left + 'px';
        pin.style.top = top + 'px';
      });
    }

    function open(a) {
      active = a.id;
      var r = rectOf(a);
      card.querySelector('.seq').textContent = '#' + a.seq;
      card.querySelector('.type').textContent = TYPE[a.type] || a.type || '';
      card.querySelector('.content').textContent = a.content || '（空批注）';
      var meta = card.querySelector('.meta');
      meta.innerHTML = '';
      var status = document.createElement('span');
      status.className = 'badge ' + (a.orphan ? 'orphan' : (a.status === 'resolved' ? 'resolved' : ''));
      status.textContent = a.orphan ? '孤立' : (STATUS[a.status] || a.status);
      meta.appendChild(status);
      var typeBadge = document.createElement('span');
      typeBadge.className = 'badge';
      typeBadge.textContent = TYPE[a.type] || a.type || '';
      meta.appendChild(typeBadge);
      var prd = card.querySelector('.prd');
      prd.textContent = a.prdRef ? 'PRD：' + a.prdRef : '';
      prd.style.display = a.prdRef ? 'block' : 'none';
      var anchor = card.querySelector('.anchor');
      anchor.textContent = (a.selector || '（无选择器）') + (a.textSnapshot ? '\n「' + a.textSnapshot + '」' : '');
      var note = card.querySelector('.orphan-note');
      note.textContent = a.orphan ? '原锚点元素已不存在。' : '';
      note.style.display = a.orphan ? 'block' : 'none';
      card.hidden = false;
      card.style.left = Math.max(12, Math.min(window.innerWidth - 342, (r ? r.right + 12 : window.innerWidth - 360))) + 'px';
      card.style.top = Math.max(12, Math.min(window.innerHeight - 220, (r ? r.top - 8 : 80))) + 'px';
      render();
    }

    function close() {
      active = null;
      card.hidden = true;
      render();
    }

    card.querySelector('.close').addEventListener('click', close);
    document.addEventListener('click', function (ev) {
      if (!card.hidden && !host.contains(ev.target) && !card.contains(ev.target)) close();
    }, true);
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position, true);
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { position(); });
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    render();
  }

  PT.export = {
    init,
    cleanHtml,
    reviewHtml,
    exportClean,
    exportReview,
    exportAnnotations,
    exportMarkdown,
    exportPdf
  };
})();
