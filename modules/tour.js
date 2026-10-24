/* ProtoTweak — lightweight guided tour (no dependencies) */
(function () {
  'use strict';

  const PT = window.PT;

  const STEPS = [
    {
      target: '#canvas',
      title: '双击文字，或右侧调样式。',
      desc: '双击示例中的大标题，或按住 Ctrl/Cmd 选中它，在右侧调整字号与颜色。',
      placement: 'canvas'
    },
    {
      target: '#page-switcher',
      title: '这是双页面原型，随时在这里切换。',
      desc: '这是双页面示例，随时可以在顶部页面选择器切换「主页」和「第二页」。',
      placement: 'below'
    },
    {
      target: '#btn-annotate',
      title: '打点批注，给开发留说明。',
      desc: '点击批注模式，再点击任意元素，就能给开发留下具体说明。',
      placement: 'below'
    },
    {
      target: '#mode-preview',
      title: '切到预览，测试刚才的按钮跳转。',
      desc: '切到预览模式，点击示例里的「进入第二页体验跳转 →」测试真实跳转。',
      placement: 'below'
    },
    {
      target: '#btn-export',
      title: '一键导出干净 HTML。',
      desc: '修改满意后，从导出菜单获得干净 HTML、评审版或批注文件。',
      placement: 'below'
    },
    {
      target: '#canvas',
      title: '导览完成',
      desc: '示例本身就是完整教学。按住 Ctrl/Cmd 选中元素，右侧编辑；松开即恢复原生交互。',
      placement: 'canvas'
    }
  ];

  let root = null;
  let spotlight = null;
  let card = null;
  let titleEl = null;
  let descEl = null;
  let stepEl = null;
  let nextBtn = null;
  let prevBtn = null;
  let rememberEl = null;
  let running = false;
  let index = 0;
  let lastFocus = null;

  function init() {
    root = document.getElementById('pt-tour');
    if (!root) return;
    spotlight = document.getElementById('pt-tour-spotlight');
    card = document.getElementById('pt-tour-card');
    titleEl = document.getElementById('pt-tour-title');
    descEl = document.getElementById('pt-tour-desc');
    stepEl = document.getElementById('pt-tour-step');
    nextBtn = document.getElementById('pt-tour-next');
    prevBtn = document.getElementById('pt-tour-prev');
    rememberEl = document.getElementById('pt-tour-remember');

    document.getElementById('pt-tour-skip').addEventListener('click', stop);
    const closeBtn = document.getElementById('pt-tour-close');
    if (closeBtn) closeBtn.addEventListener('click', stop);
    nextBtn.addEventListener('click', next);
    prevBtn.addEventListener('click', prev);
    rememberEl.addEventListener('change', () => {
      PT.storage.saveTour({ dismissed: rememberEl.checked });
      if (rememberEl.checked) PT.core.toast('已记住：以后不再自动显示引导', 'info', 2200);
    });
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
  }

  function isDismissed() {
    return !!(PT.storage && PT.storage.loadTour && PT.storage.loadTour().dismissed);
  }

  function start(opts) {
    if (!root) init();
    if (!root || !PT.app || !PT.app.isLoaded()) return false;
    const options = opts || {};
    if (isDismissed() && !options.force) return false;
    if (running) {
      index = 0;
      render();
      return true;
    }
    running = true;
    index = 0;
    lastFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add('tour-open');
    if (rememberEl) rememberEl.checked = isDismissed();
    if (PT.contextMenu) PT.contextMenu.close();
    render();
    return true;
  }

  function stop() {
    if (!running) return;
    running = false;
    if (root) root.hidden = true;
    document.body.classList.remove('tour-open');
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }

  function next() {
    if (!running) return;
    if (index >= STEPS.length - 1) {
      stop();
      PT.core.toast('引导已完成', 'success', 1600);
      return;
    }
    go(index + 1);
  }

  function prev() {
    if (!running || index <= 0) return;
    go(index - 1);
  }

  function go(nextIndex) {
    if (!running) return;
    if (nextIndex < 0 || nextIndex >= STEPS.length) return;
    index = nextIndex;
    render();
  }

  function targetFor(step) {
    if (!step) return null;
    let el = document.querySelector(step.target);
    if (!el && step.fallback) el = document.querySelector(step.fallback);
    if (!el || el.hidden) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      if (step.fallback) {
        el = document.querySelector(step.fallback);
        if (el && !el.hidden) {
          const fallbackRect = el.getBoundingClientRect();
          if (fallbackRect.width && fallbackRect.height) return { el, rect: fallbackRect };
        }
      }
      return null;
    }
    return { el, rect };
  }

  function render() {
    if (!running) return;
    let found = null;
    for (let i = index; i < STEPS.length; i++) {
      found = targetFor(STEPS[i]);
      if (found) { index = i; break; }
    }
    if (!found) { stop(); return; }

    const step = STEPS[index];
    stepEl.textContent = (index + 1) + ' / ' + STEPS.length;
    titleEl.textContent = step.title;
    descEl.textContent = step.desc;
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === STEPS.length - 1 ? '完成' : '下一步';
    if (rememberEl && rememberEl.parentElement) {
      rememberEl.parentElement.hidden = index !== STEPS.length - 1;
    }
    spot(found.rect);
    place(found.rect, step.placement);
    setTimeout(() => { try { nextBtn.focus({ preventScroll: true }); } catch (e) {} }, 0);
  }

  function spot(rect) {
    const pad = 8;
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.width = Math.max(20, rect.width + pad * 2) + 'px';
    spotlight.style.height = Math.max(20, rect.height + pad * 2) + 'px';
  }

  function place(rect, placement) {
    const gap = 16;
    const cw = card.offsetWidth || 360;
    const ch = card.offsetHeight || 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left;
    let top;

    if (placement === 'left') {
      left = rect.left - cw - gap;
      top = rect.top + Math.min(80, Math.max(0, (rect.height - ch) / 2));
      if (left < 16) {
        left = Math.min(vw - cw - 16, rect.right + gap);
        top = rect.top + 32;
      }
    } else if (placement === 'canvas') {
      left = Math.max(32, rect.left + 32);
      top = Math.max(32, vh - ch - 48);
    } else {
      left = rect.left + rect.width / 2 - cw / 2;
      top = rect.bottom + gap;
      if (top + ch > vh - 16) top = rect.top - ch - gap;
    }

    left = Math.max(16, Math.min(vw - cw - 16, left));
    top = Math.max(16, Math.min(vh - ch - 16, top));
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(top) + 'px';
  }

  function reposition() {
    if (!running) return;
    const found = targetFor(STEPS[index]);
    if (!found) { render(); return; }
    spot(found.rect);
    place(found.rect, STEPS[index].placement);
  }

  function reset() {
    PT.storage.resetTour();
    PT.core.toast('新手引导已恢复', 'success', 1600);
    start({ force: true });
  }

  document.addEventListener('keydown', (e) => {
    if (!running) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stop();
    }
  }, true);

  PT.tour = {
    init,
    start,
    stop,
    reset,
    isDismissed,
    isActive: () => running
  };

  // Developer helper: reset persisted guide state and restart when a document is loaded.
  window.resetGuide = function () {
    if (PT.storage && PT.storage.resetTour) PT.storage.resetTour();
    if (PT.app && PT.app.isLoaded() && PT.tour) {
      PT.tour.start({ force: true });
      return 'Guide restarted.';
    }
    PT.core.toast('引导状态已重置；加载示例或 HTML 后可再次触发', 'info', 2400);
    return 'Guide reset. Load a document to start it.';
  };
})();
