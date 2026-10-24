/* ProtoTweak — warm-paper, two-page sample with built-in teaching */
(function () {
  'use strict';

  const PT = window.PT;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ProtoTweak 示例 · 双页面导览</title>
<style>
  :root {
    --paper: #fdfcfa;
    --surface: #ffffff;
    --surface-2: #f7f5f1;
    --ink: #1c1a17;
    --muted: #6b645c;
    --faint: #9a938b;
    --line: rgba(28, 22, 15, .1);
    --line-strong: rgba(28, 22, 15, .16);
    --accent: #5b6ad0;
    --accent-soft: rgba(91, 106, 208, .09);
    --dot: #d4753d;
    --dot-soft: rgba(212, 117, 61, .1);
    --ok: #3f7d58;
    --ok-soft: rgba(63, 125, 88, .11);
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    --mono: "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
    letter-spacing: .01em;
  }

  .shell {
    width: min(1060px, 100%);
    margin: 0 auto;
    padding: 42px 60px 90px;
  }

  .topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--line);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font: 600 11px var(--mono);
    letter-spacing: .13em;
    text-transform: uppercase;
  }

  .brand-mark {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font: 700 12px var(--sans);
    letter-spacing: 0;
  }

  .brand-sub { color: var(--faint); font-weight: 500; }

  .page-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-2);
  }

  .page-tab {
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--muted);
    padding: 5px 10px;
    font: 11px var(--sans);
    cursor: pointer;
  }

  .page-tab:hover { color: var(--ink); }
  .page-tab.active {
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1px 2px rgba(28, 22, 15, .06);
  }

  .page { display: none; }
  .page.active { display: block; }

  .eyebrow {
    margin: 34px 0 14px;
    color: var(--faint);
    font: 10px var(--mono);
    letter-spacing: .14em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    max-width: 880px;
    font-size: clamp(46px, 6.2vw, 74px);
    line-height: 1.02;
    font-weight: 700;
    letter-spacing: -.055em;
  }

  .hero-hint {
    margin: 18px 0 0;
    color: var(--faint);
    font-size: 12.5px;
    line-height: 1.7;
  }

  .section {
    margin-top: 48px;
    padding-top: 30px;
    border-top: 1px solid var(--line);
  }

  .section-kicker {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
    color: var(--faint);
    font: 10px var(--mono);
    letter-spacing: .13em;
    text-transform: uppercase;
  }

  .section-kicker::before {
    content: "";
    width: 16px;
    height: 1px;
    background: var(--dot);
  }

  h2 {
    margin: 0 0 10px;
    font-size: 20px;
    line-height: 1.3;
    letter-spacing: -.015em;
  }

  .module-grid {
    display: grid;
    grid-template-columns: 1.08fr .92fr;
    gap: 36px;
    align-items: start;
  }

  .hint {
    margin: 0;
    color: var(--faint);
    font-size: 12px;
    line-height: 1.75;
  }

  .form-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(28, 22, 15, .035);
  }

  .field-label {
    display: block;
    margin-bottom: 7px;
    color: var(--muted);
    font-size: 11px;
  }

  input, select {
    width: 100%;
    height: 38px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: var(--paper);
    color: var(--ink);
    padding: 0 11px;
    font: 13px var(--sans);
    outline: none;
  }

  input::placeholder { color: var(--faint); }
  input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

  .table-card {
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(28, 22, 15, .035);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th, td {
    padding: 11px 13px;
    text-align: left;
    border-bottom: 1px solid var(--line);
  }

  th {
    color: var(--faint);
    font: 10px var(--mono);
    letter-spacing: .08em;
    text-transform: uppercase;
    background: var(--surface-2);
  }

  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover td { background: rgba(28, 22, 15, .018); }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .status.ok { background: var(--ok-soft); color: var(--ok); }
  .status.pending { background: var(--dot-soft); color: var(--dot); }

  .cta-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: var(--surface);
    color: var(--ink);
    font: 12px var(--sans);
    cursor: pointer;
  }

  .btn:hover { border-color: var(--faint); background: var(--surface-2); }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
    box-shadow: 0 1px 2px rgba(91, 106, 208, .28);
  }

  .btn.primary:hover { background: #4d5bc0; border-color: #4d5bc0; }

  .cta-hint { margin-top: 12px; }

  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: 12px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.8;
  }

  .keys span { display: inline-flex; align-items: center; gap: 5px; }

  kbd {
    display: inline-flex;
    align-items: center;
    min-height: 19px;
    padding: 1px 5px;
    border: 1px solid var(--line-strong);
    border-bottom-color: rgba(28, 22, 15, .24);
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--ink);
    font: 10px var(--mono);
    white-space: nowrap;
  }

  .guide-list {
    margin: 10px 0 0;
    padding-left: 18px;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.9;
  }

  .guide-list li { margin: 3px 0; }
  .guide-list strong { color: var(--ink); font-weight: 600; }
  .guide-list code { color: var(--accent); font: 10px var(--mono); }

  .annotate-box {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-top: 48px;
    padding: 17px 18px;
    border: 1px solid rgba(212, 117, 61, .28);
    border-radius: 11px;
    background: var(--dot-soft);
    color: var(--muted);
    font-size: 12px;
    line-height: 1.75;
  }

  .annotate-box strong { color: var(--ink); }
  .annotate-icon {
    flex: 0 0 22px;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--dot);
    color: #fff;
    font: 700 11px var(--mono);
  }

  .center-page {
    min-height: 72vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 0 20px;
  }

  .center-page h1 {
    font-size: clamp(38px, 5.4vw, 64px);
    max-width: 760px;
  }

  .center-page p {
    max-width: 560px;
    margin: 14px auto 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.9;
  }

  .center-page .btn { margin-top: 26px; }

  .page-note {
    margin-top: 22px;
    color: var(--faint);
    font: 10px var(--mono);
    letter-spacing: .04em;
  }

  @media (max-width: 760px) {
    .shell { padding: 30px 26px 60px; }
    .module-grid { grid-template-columns: 1fr; gap: 22px; }
    .topline { align-items: flex-start; flex-direction: column; }
    h1 { font-size: 46px; }
  }
</style>
</head>
<body>
<div class="shell">
  <header class="topline">
    <div class="brand">
      <span class="brand-mark">P</span>
      <span>ProtoTweak</span>
      <span class="brand-sub">/ 双页面导览</span>
    </div>
    <nav class="page-tabs" aria-label="示例页面">
      <button class="page-tab active" type="button" data-target="page-home" onclick="switchPage('page-home')">主页</button>
      <button class="page-tab" type="button" data-target="page-next" onclick="switchPage('page-next')">第二页</button>
    </nav>
  </header>

  <section class="page active" data-page="page-home" data-title="主页" id="page-home">
    <div class="eyebrow">PROTOTWEAK / SAMPLE 01</div>
    <h1>把 HTML 原型<br />变成可编辑的作品</h1>
    <p class="hero-hint">💡 双击任何文本即可直接修改内容；或在右侧面板调整字号与颜色。</p>
    <div class="keys">
      <span><kbd>Ctrl/Cmd + 单击</kbd> 选中元素</span>
      <span><kbd>双击</kbd> 编辑文本</span>
      <span><kbd>Esc</kbd> 取消选中</span>
    </div>

    <section class="section">
      <div class="section-kicker">01 / 文本与排版</div>
      <div class="module-grid">
        <div>
          <h2>这是一个真实的标题。</h2>
          <p class="hint" style="margin-top: 10px;">文字是原型里最重要的信息层级。选中它，右侧可改字号、字重、行高和颜色。</p>
          <ul class="guide-list">
            <li><strong>选中：</strong>按住 <kbd>Ctrl/Cmd</kbd> 单击标题，出现蓝框和右侧面板。</li>
            <li><strong>改文案：</strong>双击标题直接编辑，或改右侧的「文案」。</li>
            <li><strong>改样式：</strong>右侧调整字号、字重、行高、颜色；输入框实时生效。</li>
            <li><strong>取消：</strong>单击标题外的任意位置，或按 <kbd>Esc</kbd>。</li>
          </ul>
        </div>
        <p class="hint">💡 双击任何文本即可直接修改内容；或在右侧面板调整字号与颜色。</p>
      </div>
    </section>

    <section class="section">
      <div class="section-kicker">02 / 表单与选项</div>
      <div class="module-grid">
        <div class="form-card">
          <div>
            <label class="field-label" for="sample-input">输入字段</label>
            <input id="sample-input" placeholder="请输入内容..." />
          </div>
          <div>
            <label class="field-label" for="sample-select">选择字段</label>
            <select id="sample-select">
              <option value="">请选择…</option>
              <option value="a">选项 A</option>
              <option value="b">选项 B</option>
            </select>
          </div>
        </div>
        <div>
          <p class="hint">💡 编辑表单元素：请按住 Ctrl（Mac 为 Cmd）点击它们，在右侧面板修改选项或提示词。</p>
          <ul class="guide-list">
            <li><strong>输入框：</strong><kbd>Ctrl/Cmd + 单击</kbd> 选中 → 右侧改「默认值」和「提示文本」。</li>
            <li><strong>下拉框：</strong><kbd>Ctrl/Cmd + 单击</kbd> 选中 → 右侧管理选项和提示词。</li>
            <li><strong>原生操作：</strong>默认不按修饰键时，点击输入框可输入，点击下拉框会展开。</li>
            <li><strong>快捷键：</strong><kbd>Esc</kbd> 取消选中；<kbd>Ctrl/Cmd + Z</kbd> 撤销修改。</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-kicker">03 / 数据表格</div>
      <p class="hint" style="margin-bottom: 14px;">💡 你可以拖拽表格边缘调整高度/宽度，或直接在右侧修改表格数据。</p>
      <ol class="guide-list" style="margin-bottom: 16px;">
        <li><kbd>Ctrl/Cmd + 单击</kbd> 表格任意位置：先选中<strong>整张表格</strong>，出现整表蓝框与 8 个缩放手柄。</li>
        <li>松开修饰键，按住表格空白/单元格区域拖动：整体移动表格，使用 <code>transform: translate</code>，不会挤动其他元素。</li>
        <li>拖动 8 个角/边手柄：整体缩放表格。拖动右边框的列手柄：调整列宽；拖动下边框的行手柄：调整行高。</li>
        <li>松开 Ctrl 后<strong>单击某个单元格</strong>：从整表进入该单元格；再单击其他单元格可切换。</li>
        <li><strong>双击单元格</strong>：直接编辑单元格文字。</li>
        <li><kbd>Alt + 单击</kbd> 表格：直接选整表；右侧「选择整表」也可从单元格返回整表。</li>
        <li><kbd>Esc</kbd>：单元格 → 整表 → 取消选中；<kbd>Ctrl/Cmd + Z</kbd>：撤销移动/缩放/改字。</li>
      </ol>
      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>状态</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>示例项目一</td>
              <td><span class="status ok">已启用</span></td>
              <td>这是一个清晰、克制的数据行。</td>
            </tr>
            <tr>
              <td>示例项目二</td>
              <td><span class="status pending">待处理</span></td>
              <td>表格支持整表缩放与单元格编辑。</td>
            </tr>
            <tr>
              <td>示例项目三</td>
              <td><span class="status ok">已启用</span></td>
              <td>Ctrl 选中整表，再单击进入单元格。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <div class="section-kicker">04 / 多页面交互</div>
      <div class="cta-row">
        <button class="btn primary" type="button" onclick="switchPage('page-next')">进入第二页体验跳转 →</button>
      </div>
      <p class="hint cta-hint">💡 在预览模式下点击此按钮可跳转。在编辑模式下想单独选中它，请按住 Ctrl。</p>
      <div class="keys">
        <span><kbd>预览 → 单击</kbd> 真实跳转</span>
        <span><kbd>Ctrl/Cmd + 单击</kbd> 只选中按钮，不跳转</span>
        <span><kbd>Esc</kbd> 取消选中</span>
      </div>
    </section>

    <div class="annotate-box">
      <span class="annotate-icon">!</span>
      <div>
        <strong>想留下修改意见？</strong> 点击顶部【批注】模式，再点击任意元素即可打点留言。
        <div class="keys" style="margin-top: 6px;">
          <span><kbd>批注</kbd> 进入模式</span>
          <span><kbd>单击元素</kbd> 创建批注点</span>
          <span><kbd>右侧批注</kbd> 填写说明并标记已解决</span>
        </div>
      </div>
    </div>
  </section>

  <section class="page" data-page="page-next" data-title="第二页" id="page-next">
    <div class="center-page">
      <div class="eyebrow" style="margin-top: 0;">PROTOTWEAK / SAMPLE 02</div>
      <h1>多页面跳转成功！</h1>
      <p>你可以随时使用顶部工具栏的【页面选择器】在主页和第二页之间切换编辑。</p>
      <p>修改满意后，点击右上角的【导出】按钮，即可获得干净的 HTML 代码。</p>
      <div class="keys" style="justify-content: center;">
        <span><kbd>页面选择器</kbd> 主页 / 第二页</span>
        <span><kbd>Ctrl/Cmd + 单击</kbd> 选中元素</span>
        <span><kbd>导出</kbd> 干净 HTML</span>
      </div>
      <button class="btn" type="button" onclick="switchPage('page-home')">← 返回主页</button>
      <div class="page-note">PROTOTYPE / TWO PAGES / ONE FILE</div>
    </div>
  </section>
</div>

<script>
  function switchPage(id) {
    var pages = document.querySelectorAll('.page');
    for (var i = 0; i < pages.length; i++) {
      pages[i].classList.toggle('active', pages[i].id === id);
    }
    var tabs = document.querySelectorAll('.page-tab');
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].classList.toggle('active', tabs[j].getAttribute('data-target') === id);
    }
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* ignore */ }
    if (window.parent && window.parent.PT && window.parent.PT.pages) {
      setTimeout(function () { window.parent.PT.pages.refresh(); }, 0);
    }
    return false;
  }
  window.switchPage = switchPage;
</script>
</body>
</html>`;

  PT.sample = {
    fileName: '示例原型.html',
    fileKey: 'sample|prototweak-neutral-demo',
    html
  };
})();
