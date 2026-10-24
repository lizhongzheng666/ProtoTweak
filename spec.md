# ProtoTweak 需求与版本记录

> 规则：以后每次修改代码，都在本文件追加一个版本记录，至少包含版本号、日期、修改内容、涉及文件、对应需求点、未完成项。不要只改代码不改记录。

## 版本记录

## v1.11.5 - 2026-10-24

### 修改内容

- 帮助页「新手引导」区域新增「不再自动显示新手引导」复选框。
- 勾选写入 localStorage；取消勾选调用 `resetTour()`，恢复示例加载时的引导。
- 打开「快捷键与说明」时自动同步复选框状态。
- 「重新载入示例并开始引导」按钮保留，始终强制重载并引导，不受复选框限制。
- 普通「加载示例原型体验」继续尊重复选框状态。

### 需求点

- REQ-237 新手引导配置可见
- REQ-238 取消不再提示
- REQ-239 配置状态同步

### 涉及文件

- `index.html`
- `proto-style.css`
- `editor.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.11.4 - 2026-10-24

### 修改内容

- 关闭浏览器/项目窗口时检查所有 Tab 的未保存状态。
- 有未保存文件时通过 `beforeunload` 启用浏览器原生离开确认，提示有几个文件存在未保存修改。
- 无未保存修改时不打断关闭流程。
- 关闭确认前仍会 snapshot/persist 当前 Tabs、批注和会话，避免误操作导致数据丢失。
- 保留新会话进入欢迎页、同一 Tab 刷新恢复 Tabs 的行为。

### 需求点

- REQ-234 关闭项目未保存提示
- REQ-235 beforeunload 离开确认
- REQ-236 数据快照保护

### 涉及文件

- `editor.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 浏览器原生离开确认只提供「离开 / 取消」，无法在 unload 阶段显示自定义三选一保存弹窗；取消后可使用 Ctrl/Cmd+S 保存再关闭。

## v1.11.3 - 2026-10-24

### 修改内容

- 新增启动会话标记 `prototweak_launch_v1`（sessionStorage）。
- 新的浏览器窗口/标签页进入项目时，始终显示欢迎页，不再自动恢复上次打开的 Tab 或上次编辑会话。
- 同一 Tab 内刷新仍保留 sessionStorage 标记，可恢复当前会话的 Tabs。
- localStorage 中的 Tabs 与批注数据仍保留，不会因启动欢迎页而清空。
- 保留多 Tab、批注、JSON/Markdown、撤销重做等核心能力。

### 需求点

- REQ-231 新浏览器会话进入主页
- REQ-232 刷新保持会话恢复
- REQ-233 不自动打开上次原型

### 涉及文件

- `editor.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.11.2 - 2026-10-24

### 修改内容

- 修复预览模式打开批注卡片时内容区偏左。
- 根因：预览模式隐藏 `.rail` 后 `rail.getBoundingClientRect().left` 为 0，批注卡片把 0 当作右边界，`maxLeft` 被压到 12px。
- 批注卡片定位增加 rail `offsetParent` 检测；rail 不可见时使用视口宽度作为右边界。
- 预览切换、布局变化时主动重新定位批注卡片。
- 新手引导「不再显示」尊重 localStorage：普通「加载示例原型」不再重置/强制启动引导。
- 帮助页「重新载入示例并开始引导」显式传 `forceTour`，强制清除记忆、重载示例并重新开始 6 步引导。
- 示例自动批注点仍然创建，但不会连带强制弹出已关闭的引导。

### 需求点

- REQ-228 预览批注卡片定位
- REQ-229 引导不再提示生效
- REQ-230 帮助页强制重载引导

### 涉及文件

- `modules/annotation-ui.js`
- `editor.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.11.1 - 2026-10-24

### 修改内容

- 示例主页增加更细的按键与操作说明，每个教学模块都带 kbd 快捷提示。
- 表格模块增加 7 步操作清单：整表选中、整表拖动、8 向缩放、行列手柄、单击单元格、双击编辑、Esc/撤销。
- 文本模块补充 Ctrl/Cmd 选中、双击改字、右侧改样式、点击空白/Esc 取消。
- 表单模块补充 input/textarea 的 value/placeholder、select 提示词与选项、原生交互与撤销。
- 多页面按钮补充预览跳转与 Ctrl 选中不跳转的区别。
- 底部批注框补充批注模式、点击元素、右侧填写、标记已解决步骤。
- 第二页补充页面选择器、Ctrl 选中、导出快捷键说明。
- 表格说明与实际行为同步：Ctrl/Cmd 先选整表，松开后单击单元格，双击编辑。

### 需求点

- REQ-225 示例内操作说明细化
- REQ-226 表格按键清单
- REQ-227 表单/文本/多页面/批注按键说明

### 涉及文件

- `modules/sample.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.11.0 - 2026-10-24

### 修改内容

- 重写内置示例为双页面全景导览：`page-home` 主页、`page-next` 第二页。
- 主页包含文本排版、表单与选项、3×3 数据表格、多页面按钮四个演示模块，每个模块附带内嵌操作说明。
- 底部加入批注模式提示框；第二页提供跳转成功说明与「← 返回主页」按钮。
- 实现内部 `switchPage()`：切换 `.page.active`、同步页面标签、调用编辑器页面管理器刷新。
- 示例页面导航与顶部页面选择器都可切换；Ctrl 选中按钮时不会触发内部跳转。
- 新手引导改为 6 步沉浸式：
  1. 画布大标题
  2. 顶部页面选择器
  3. 批注按钮
  4. 预览切换
  5. 导出
  6. 完成并写入「不再提示」
- 帮助页「重新载入示例并开始引导」强制重载新示例、切回主页、启动 6 步引导。
- 示例升级检测从旧版 `data-page="概览"` 改为 `data-page="page-home"`。
- 保留表格两段式选中、点击空白取消、纯白菜单、右侧面板和批注能力。

### 需求点

- REQ-220 双页面全景示例
- REQ-221 四个教学模块
- REQ-222 switchPage 与页面选择器
- REQ-223 6 步沉浸式引导
- REQ-224 示例重载

### 涉及文件

- `modules/sample.js`
- `modules/tour.js`
- `editor.js`
- `index.html`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.10.1 - 2026-10-24

### 修改内容

- 修复整表选中后无法单击单元格、无法双击单元格编辑。
- 根因：表格选中后，拖拽模块在 pointerdown 阶段立即 `setPointerCapture(table)`，浏览器的后续 click 被重定向到 table，单元格 click 永远收不到。
- 拖拽模块改为越过移动阈值后才 `setPointerCapture`；普通单击不再捕获指针。
- 单击空白（body/html）现在也会取消当前选中和右侧面板。
- 真实鼠标验证：Ctrl 选整表 → 单击单元格 → 双击编辑均正常。

### 需求点

- REQ-216 整表后单元格单击/双击
- REQ-217 pointer capture 延迟到拖拽开始
- REQ-218 点击空白取消选中

### 涉及文件

- `modules/drag.js`
- `modules/selection.js`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.10.0 - 2026-10-24

### 修改内容

- 表格操作优化为两段式：Ctrl/Cmd+单击先选中整表，松开修饰键后单击单元格进入单元格；单元格之间可单击切换。
- 表格上下文提示改为动态文案：整表状态提示拖动/缩放/进入单元格，单元格状态提示双击编辑、Esc 或右侧按钮返回整表。
- Esc 从单元格返回整表，再按一次取消选中。
- 单击选中元素之外的任意原型区域取消选中，原型原生点击仍保留。
- 导出菜单、插入菜单、更多菜单、右键菜单、Tab Popover 统一纯白实心背景，移除透明度/backdrop-filter。
- 模态卡片统一纯白实心；菜单和弹窗按钮统一高度、圆角、hover。
- 快捷键与说明页重构为「开始编辑 / 选中与表格 / 快捷键 / 页面、Tab 与批注」。
- 「重新载入示例并开始引导」会强制关闭旧示例、重载示例、切回概览页并启动 8 步引导。
- 示例新增两个内部页面：概览、组件与表单；页面内导航和顶部页面选择器都可切换。
- 新建引导 8 步，依次对应页面选择器、默认原生/Ctrl 选中、右侧面板、表格、批注、批注点、保存、导出，全部落在示例实际元素上。
- 示例加载继续自动创建批注点，确保第 6 步有真实 `.ann-pin`。

### 需求点

- REQ-210 表格两段式操作
- REQ-211 点击其他位置取消选中
- REQ-212 菜单/弹窗纯白统一
- REQ-213 快捷键与操作说明
- REQ-214 示例重载与 8 步引导
- REQ-215 多内部页面示例

### 涉及文件

- `index.html`
- `proto-style.css`
- `editor.js`
- `modules/selection.js`
- `modules/table.js`
- `modules/tour.js`
- `modules/tabs.js`
- `modules/sample.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.9.0 - 2026-10-24

### 修改内容

- 表格交互改为两段式：Ctrl/Cmd+单击先选中整表；松开修饰键后再单击单元格进入单元格。
- 单元格状态下单击其他单元格直接切换，双击单元格编辑文字。
- 单击原型中选中元素之外的任意位置，取消当前选中与右侧编辑状态，同时保留原型原生点击。
- Alt+单击仍可直接选中整表；右侧面板继续提供「选择整表」。
- 所有菜单、上下文菜单、Tab Popover 改为纯白实心背景，移除 backdrop/透明度。
- 模态卡片改为纯白实心背景；菜单按钮、弹窗按钮统一尺寸与 hover。
- 帮助页重构为「开始编辑 / 选中与表格 / 快捷键 / 页面与批注」分区。
- 新手引导扩展为 8 步，覆盖默认原生交互、Ctrl 选中、右面板、表格、批注、保存与导出。
- 示例仍自动创建批注点并在加载时强制启动最新引导。

### 需求点

- REQ-200 表格 Ctrl 整表 → 单元格
- REQ-201 点击其他位置取消选中
- REQ-202 导出菜单与弹窗纯白统一
- REQ-203 帮助页可用性
- REQ-204 8 步引导

### 涉及文件

- `index.html`
- `proto-style.css`
- `modules/selection.js`
- `modules/tour.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.8.0 - 2026-10-24

### 修改内容

- select 右侧面板新增「提示词」编辑框，创建/更新 disabled selected placeholder option，实时显示「请选择…」。
- 选项列表自动排除 placeholder option，增删改仍按真实 option 索引操作。
- 表单字段、placeholder、option 文本/value、文本内容修改后派发原型 `input` / `change` 事件，触发双向绑定。
- 修复表格行高向上拖动无法变矮：移除 scrollHeight 作为下限，改为 line-height + padding + border 的内在高度。
- 行高调整强制 `box-sizing: border-box` 并允许 inline `height` / `min-height` 减小，最小 24px。
- 修复整表拖拽：Alt+单击选整表（无需 Ctrl），右侧面板新增「选择整表」按钮。
- 表格选中后使用 `transform: translate()` 拖拽，不改变文档流；一次拖拽只记录一条历史。
- 保留 Ctrl/Cmd 穿透选中、多 Tab、页面选择器、批注、JSON/Markdown、撤销重做。

### 需求点

- REQ-190 select 提示词
- REQ-191 双向绑定事件
- REQ-192 行高可缩小
- REQ-193 整表拖拽
- REQ-194 历史单条提交

### 涉及文件

- `index.html`
- `proto-style.css`
- `modules/inspector.js`
- `modules/table.js`
- `modules/selection.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.7.0 - 2026-10-24

### 修改内容

- 交互模型改为默认原生：无修饰键时按钮、链接、select、表单保持原型真实行为。
- 按住 Ctrl/Cmd 才进入选中模式：十字准星、浅蓝虚线 Hover、实线选中框与右侧面板。
- 松开 Ctrl/Cmd 清除 Hover，已选元素与面板保留。
- 全局拦截仅在选中模式生效，使用 preventDefault + stopImmediatePropagation。
- 预览模式隐藏右侧面板；Ctrl/Cmd 点击元素切回编辑并选中。
- 拖拽只对已选中元素生效，使用 `transform: translate()`，不影响文档流。
- 8 向缩放保持；表格只整体缩放，行列继续走原表格逻辑。
- 画布注入 `user-select:none` / `-webkit-user-drag:none`。
- 右侧面板新增 input/textarea 的 value/placeholder 编辑。
- 右侧面板新增 select 选项管理：增删、文本、value 实时生效。
- 移除画布双击 input/textarea/select 的编辑入口，统一到右侧面板。
- 普通文本仍可用右侧 textarea 实时修改，双击文本编辑保留。
- 表格单击选中单元格/内部标签；Alt+单击选中整表。
- 保留多 Tab、内部页面选择器、批注、JSON/Markdown、撤销重做。

### 需求点

- REQ-180 默认原生交互
- REQ-181 Ctrl/Cmd 选中与 Hover
- REQ-182 transform 拖拽与 8 向缩放
- REQ-183 右侧表单/选项面板
- REQ-184 移除画布表单双击
- REQ-185 核心能力保护

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/selection.js`
- `modules/drag.js`
- `modules/text-edit.js`
- `modules/inspector.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.6.0 - 2026-10-24

### 修改内容

- 编辑模式改为绝对事件接管：画布 `click` 在捕获阶段 `preventDefault` + `stopImmediatePropagation`，原型链接、按钮、内联 onclick 和 target 监听器不再执行。
- `<select>` / `<input>` / `<textarea>` / `<button>` / `<a>` / `<label>` 在编辑模式拦截 mousedown，阻止下拉展开、聚焦与原生拖拽。
- 表单 `submit` 在编辑模式阻止并停止冒泡。
- 预览模式移除点击/提交拦截，恢复按钮回调、下拉框、链接跳转和表单行为。
- 预览模式隐藏右侧属性面板与选中框。
- 新增 Ctrl/Cmd 快速穿透：预览模式按住 Ctrl/Cmd 显示十字准星，点击元素拦截原生交互、切回编辑并选中该元素。
- 画布注入 `user-select:none` / `-webkit-user-drag:none`，编辑 contenteditable 时恢复文本选择。
- 表格点击改为单元格优先；点击单元格内文字/控件选中精确节点；Alt+单击选中整表。
- 双击 input/textarea 打开字段面板，可编辑 value 与 placeholder。
- 双击 select 继续打开选项管理面板。
- 选中标签 `pointer-events:none`，并上移为 `top:-24px`。

### 需求点

- REQ-170 编辑模式绝对交互隔离
- REQ-171 预览模式全真交互
- REQ-172 Ctrl/Cmd 扫描穿透
- REQ-173 表单与表格独立编辑
- REQ-174 字段 value/placeholder 编辑
- REQ-175 选中标签不遮挡

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/selection.js`
- `modules/stage.js`
- `modules/text-edit.js`
- `modules/field-editor.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.5.2 - 2026-10-24

### 修改内容

- 修复整个文件夹拖入后仍提示「没有找到可导入的 HTML 文件」。
- 文件夹拖拽现在使用双通道读取：
  - `webkitGetAsEntry()` + `readEntries()` 递归
  - `getAsFileSystemHandle()` + `entries()` 现代目录句柄递归
- 两个通道的 Promise 都在 drop 事件内同步启动，避免 DataTransfer 失效。
- Entry 通道没有产出 HTML 时自动回退到 File System Access 目录句柄。
- 两个通道的结果按路径去重后统一进入资源内联与 Tab 创建流程。
- 保留单文件拖拽的 FileList 优先路径，不回归。

### 需求点

- REQ-161 文件夹拖拽 Entry 读取
- REQ-162 FileSystemHandle 目录回退
- REQ-163 文件夹资源内联

### 涉及文件

- `editor.js`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.5.1 - 2026-10-24

### 修改内容

- 修复欢迎页原生拖拽文件后提示「没有找到可导入的 HTML 文件」。
- 根因：`drop` 事件返回后 Chromium 会清空 `DataTransfer`；原逻辑在 `await walkEntry()` 之后才读取 `dt.files`，文件列表已为空。
- 在 `importDataTransfer()` 入口同步快照 `dt.files` 与 `dt.items`。
- 直接文件优先使用 `dataTransfer.files`，不再等待 entry 递归；文件夹才走 `webkitGetAsEntry`。
- 在 `document` 捕获阶段增加 `dragover` / `drop` 兜底，避免欢迎页子元素或文本节点阻断冒泡。
- 目录拖拽仍保留递归读取与静态资源内联。

### 需求点

- REQ-158 欢迎页原生文件拖拽
- REQ-159 DataTransfer 生命周期修复
- REQ-160 文件夹递归兜底

### 涉及文件

- `editor.js`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.5.0 - 2026-10-24

### 修改内容

- 返回主页图标移到品牌名 PROTOTWEAK 右侧，不再遮挡 Logo。
- 主页按钮改为极简幽灵图标，title 为「关闭所有并返回主页」。
- 主页点击改为原生 `window.confirm('返回主页将关闭当前所有文件，确定吗？')`。
- 确认后清空 tabs 数组、localStorage、批注、session，渲染欢迎页。
- Tab 栏 `+` 放大到 34×30，hover 使用 `--surface-3` 浅色背景。
- 强化 Tab Popover 外部点击监听：mousedown / pointerdown / click 三通道关闭。
- 重写拖拽导入：直接读取 `dataTransfer.files`，优先处理 HTML；文件夹使用 `webkitGetAsEntry` 递归。
- 拖拽 `dragover` / `drop` 均阻止默认行为，避免浏览器打开文件。
- 修复 `hasFileDrag` 在 `types` 缺失时误判，兼容 files/items 两种数据源。
- 恢复并确保内部页面选择器可见；无页面时显示禁用的「未识别页面」。
- Guided Tour 确认 6 步：页面选择器、样式面板、批注按钮、批注点、保存、导出。
- 示例自动创建批注点，保证第 4 步有真实 `.ann-pin` 可高亮。
- 记住选项只在最后一步显示，勾选后写入 localStorage。
- 保留 `window.resetGuide()` 开发者重置入口。

### 需求点

- REQ-150 主页入口位置与原生确认
- REQ-151 Tab 加号尺寸与 hover
- REQ-152 Popover 外部关闭
- REQ-153 直接文件拖拽修复
- REQ-154 文件夹递归导入
- REQ-155 内部页面选择器恢复
- REQ-156 6 步引导与记忆
- REQ-157 开发者重置

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/tabs.js`
- `modules/tour.js`
- `modules/storage.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.4.0 - 2026-10-24

### 修改内容

- Tab 栏 `+` 只打开 Popover，不再直接弹系统文件选择器。
- Popover 改为纯白实心背景 + 高层级弥散阴影，并保留全局点击外部关闭。
- 文件 Tab 栏使用 `--surface-2` 背景和 1px `--border` 底边，增强与画布区隔。
- 恢复顶部「内部页面」选择器；即使未识别页面也显示禁用下拉，不再消失。
- 重写拖拽导入容错：entries/native files 双通道，HTML 从全部记录中提取，避免资源过多或浏览器 entry 不完整时误报“没有 HTML”。
- Tabs 持久化从 sessionStorage 改为 localStorage，保存 htmlContent、annotations、粘贴代码与元数据。
- 手动关闭 Tab 同时删除该 Tab 的本地持久化数据和批注；关闭全部后彻底清理。
- 顶部品牌旁新增「返回主页」房子图标：关闭全部 Tab、清空画布、退回欢迎页。
- Guided Tour 扩展为 6 步：页面选择器、样式面板、批注按钮、批注点、保存、导出。
- 示例加载时自动创建一条示例批注点，供第 4 步高亮。
- 引导最后一步才显示「不再显示此引导」复选框。
- 新增开发者重置入口 `window.resetGuide()`。
- 示例加载仍然强制清空引导记忆并立即启动 6 步引导。

### 需求点

- REQ-140 Tab 加号 Popover 纯白 + 外围关闭
- REQ-141 Tab 栏浅灰背景与明显分割线
- REQ-142 恢复内部页面选择器
- REQ-143 拖拽文件/文件夹导入修复
- REQ-144 Tabs localStorage 持久化与手动关闭销毁
- REQ-145 返回主页入口
- REQ-146 6 步 Guided Tour
- REQ-147 引导重置开发者方法

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/tabs.js`
- `modules/tour.js`
- `modules/storage.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.3.0 - 2026-10-24

### 修改内容

- 删除顶部工具栏「导入」按钮。
- 删除内部页面选择器右侧「＋」按钮。
- 所有新增导入集中到文件 Tab 栏的 `+`。
- 点击 Tab 栏 `+` 打开极简 Popover：从本地文件导入 / 粘贴 HTML 代码。
- 移除旧导入弹窗中的粘贴代码入口，统一到粘贴代码弹窗。
- 粘贴代码弹窗外层遮罩改为 `rgba(28,22,15,0.3)` + `blur(4px)`。
- 弹窗卡片改为纯白实心 `#ffffff`，不透明。
- 行号区与代码区增加背景对比，代码使用等宽字体。
- 欢迎页示例入口改为纯文本链接：前半句普通色，后半句 accent 加粗，无边框/背景。
- 示例链接居中，悬浮时强调色下划线 + 轻微位移。
- 每次加载示例时强制清空引导记忆并立即启动 Tour。
- Tour 增加右上角关闭按钮。
- 更新 README、spec、package 版本与构建产物。

### 需求点

- REQ-130 导入入口收敛到 Tab 栏 `+`
- REQ-131 Tab `+` Popover 二选一导入
- REQ-132 粘贴弹窗遮罩与纯白卡片
- REQ-133 代码区对比度与等宽字体
- REQ-134 示例链接纯文本化
- REQ-135 示例加载强制启动引导
- REQ-136 Tour 关闭按钮

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/tabs.js`
- `modules/tour.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v1.2.0 - 2026-10-24

### 修改内容

- 欢迎页重构为合二为一布局：胶囊标签、52px 左对齐主标题、220px 点阵 Dropzone。
- 取消欢迎页独立导入按钮，点击 Dropzone 直接打开文件选择器。
- Dropzone 右下角新增「粘贴代码 Ctrl+V」悬浮按钮。
- 新增粘贴代码弹窗：动态行号、HTML/纯文本 Badge、取消/确认、Ctrl+Enter。
- 粘贴弹窗 textarea 与入口使用同一提示词「在此粘贴完整 HTML 或代码片段…」。
- 粘贴代码生成新 Tab，命名依次为 `粘贴的html1`、`粘贴的html2`，内部文件名为 `粘贴的htmlN.html`。
- 关闭全部文件后粘贴编号归零；刷新恢复后从已有最大编号继续。
- Tab 状态新增 `history`：切换 Tab 保存/恢复撤销栈，右侧面板状态同步。
- 文件文件夹导入支持静态 CSS、JS、图片、字体内联。
- 拖拽状态改为实线 accent 边框 + 浅紫背景反馈。
- 移除旧导入弹窗中的粘贴代码页，统一到新粘贴弹窗。
- Ctrl+V 在编辑器外壳/欢迎页打开代码弹窗；输入框和画布内元素粘贴保持原行为。
- 更新 README、spec、package 版本和构建产物。

### 需求点

- REQ-120 文件 Tabs 与内部页面完全隔离
- REQ-121 Tab 保存 htmlContent / annotations / history
- REQ-122 未保存关闭确认与关闭全部欢迎页
- REQ-123 单文件/文件夹拖拽导入
- REQ-124 静态资源内联
- REQ-125 胶囊标签、52px 标题、220px Dropzone
- REQ-126 粘贴代码弹窗与行号
- REQ-127 粘贴 Tab 递增命名
- REQ-128 Ctrl+V 全局代码粘贴与元素粘贴隔离
- REQ-129 4 步新手引导

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/tabs.js`
- `modules/history.js`
- `modules/paste-code.js`
- `modules/resource-bundler.js`
- `modules/tour.js`
- `modules/sample.js`
- `modules/clipboard.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 动态 JS `fetch` / `import()` 资源内联
- 多文件目录树侧栏
- 撤销历史跨刷新持久化
- 非 Chromium 浏览器的文件夹递归选择

## v1.1.0 - 2026-10-24

### 修改内容

- 新增多文件 Tabs：支持同时打开多个 HTML 文件，并在顶部文件标签栏切换。
- 文件 Tab 与原型内部页面选择器完全分离；页面下拉仍只负责当前文件内部页面。
- 同一文件只保留一个 Tab；重复打开时激活已有 Tab，不创建副本。
- 每个 Tab 独立保存 `htmlContent`、`annotations`、`docId`、`sourceHash`、`savedHash`。
- 新增未保存检测：关闭有修改的 Tab 时使用品牌确认框。
- 关闭全部 Tab 后清理 stage、批注、页面与历史，回到欢迎页。
- 新增留白排版风欢迎页：暖白纸张、大标题、左对齐、accent 主按钮与下划线次按钮。
- 新增拖拽导入：支持单个 HTML、多个 HTML，以及整个文件夹的递归 `.html/.htm` 读取。
- 文件夹导入使用 `webkitGetAsEntry` + `readEntries` 循环，FileReader 作为兜底；相对路径用于区分同名文件。
- 弃用旧的具体业务示例，新增中性示例原型「示例原型.html」，包含标题、段落、按钮、输入框、下拉框、表格、状态标签。
- 示例 Tab 为单例：已存在时激活，不重置内容；Tour 仍按记忆状态启动。
- 新增 4 步 Guided Tour：画布、右侧面板、批注按钮、导出按钮。
- Tour 支持跳过、Esc、上一步/下一步、记住不再显示，并在帮助中提供恢复入口。
- 多文件 Tabs 使用 sessionStorage 恢复；关闭全部后清除会话。
- 顶部文件标签栏为 38px，位于顶栏下方；页面选择器保留在顶栏。
- 更新 README、spec、package 版本与构建产物。

### 需求点

- REQ-110 多文件 Tabs 与文件级状态隔离
- REQ-111 文件 Tab 与内部页面选择器不冲突
- REQ-112 同一文件只允许一个 Tab
- REQ-113 未保存 Tab 关闭确认
- REQ-114 关闭全部回到欢迎页
- REQ-115 留白排版风欢迎页
- REQ-116 单文件 / 多文件 / 文件夹拖拽导入
- REQ-117 中性示例原型
- REQ-118 4 步 Guided Tour 与记住选项
- REQ-119 Tabs sessionStorage 恢复

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/tabs.js`
- `modules/tour.js`
- `modules/sample.js`
- `modules/storage.js`
- `modules/export.js`
- `README.md`
- `spec.md`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 多 HTML 文件之间的相对资源解析
- 文件夹目录树侧栏
- IndexedDB 级别的多 Tab 恢复（当前为 sessionStorage）
- 拖拽文件夹在非 Chromium 浏览器中的完整支持

## v1.0.0 - 2026-10-23

### 修改内容

- 产品品牌从 HTML Workbench 迁移为 ProtoTweak；入口、构建产物、包名和页面标题统一。
- 文件结构改为根目录 `index.html` / `editor.js` / `proto-style.css` / `modules/`；旧 Chrome 扩展代码归档到 `legacy/`。
- 全局命名空间从 `window.WB` 迁移为 `window.PT`。
- localStorage key 迁移为 `prototweak_*`，启动时自动复制旧 `wb.*` 数据；旧注解 `data-wb-aid` 双读兼容。
- 新增 MIT LICENSE、`package.json`、来源声明和 README。
- 建立 Notion 暖白纸张 + Raycast 精确结构的 CSS token 体系。
- 重构顶栏玻璃、品牌 mark、三模式分段控件、按钮、输入、画布点阵、选中框、缩放手柄、批注点、右侧面板、弹窗、状态栏。
- 批注点改为暖陶土橙静态外光环，已解决状态改为暖灰。
- 补齐方向键微调、Shift 大步移动、Ctrl+X 剪切、删除确认、右键菜单、快捷键 title、状态栏 `<kbd>`。
- 删除元素、删除批注、重置位置、清除内联样式统一二次确认。
- 批注类型固定为：字段含义、业务逻辑、边界情况、交互说明。
- 空批注列表增加进入批注模式按钮；统一 toast 反馈。
- README 与 spec 全面更新。

### 需求点

- REQ-100 产品名、入口、构建产物、全局命名空间统一为 ProtoTweak / PT
- REQ-101 文件与 localStorage 迁移，旧数据不丢失
- REQ-102 MIT LICENSE 与上游来源说明
- REQ-103 颜色、圆角、阴影、间距、层级 token 化
- REQ-104 顶栏/按钮/表单/画布/批注/面板/弹窗/状态栏视觉规范化
- REQ-105 快捷键、方向键、右键菜单、删除确认
- REQ-106 交互四态、toast、空状态
- REQ-107 多页面、批注、表格、撤销重做行为保持
- REQ-108 批注类型固定四项

### 涉及文件

- `index.html`
- `editor.js`
- `proto-style.css`
- `modules/*.js`
- `modules/storage.js`
- `modules/context-menu.js`
- `modules/annotations.js`
- `modules/annotation-ui.js`
- `modules/export.js`
- `tools/build-single-file.mjs`
- `tools/build-single-file.ps1`
- `README.md`
- `spec.md`
- `docs/annotation-schema.md`
- `docs/acceptance.md`
- `LICENSE`
- `package.json`
- `dist/ProtoTweak.html`

### 未完成

- 多 HTML 文件/目录项目支持
- 非 click 私有路由的自动识别
- 自动化视觉回归截图基线
- 旧 Chrome 扩展代码仅归档，不纳入 v1.0.0 产品

## v0.6.5 - 2026-10-23

### 修改内容

- 批注序号改为按 `createdAt` 创建时间排序，从 1 开始连续编号。
- 新增批注、删除批注、导入批注后统一执行 resequence。
- 删除某条批注后，后续批注序号立即前移，不再保留空洞。
- 导入旧数据时忽略原 `seq` 的空洞/乱序，按创建时间重新编号。
- 批注卡片、列表、批注点、评审版导出和批注 JSON 均使用重排后的序号。
- `nextSeq` 保留为兼容字段，固定为当前批注数 + 1。

### 需求点

- REQ-034 批注按创建时间排序，先创建序号小。
- REQ-035 删除批注后，后续批注序号连续重排。

### 涉及文件

- `modules/annotations.js`
- `modules/annotation-ui.js`
- `docs/annotation-schema.md`
- `README.md`
- `spec.md`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v0.6.4 - 2026-10-23

### 修改内容

- 修复评审版导出左上角出现多余批注点：隐藏元素/零尺寸元素不再生成可见 pin。
- 无有效 `lastRect`（宽高为 0、坐标 0,0 的占位值）时隐藏孤立批注点，不再回落到左上角。
- 新建 pin 默认 `display:none`，只在计算出有效视口位置后显示，避免首帧闪到左上角。
- 评审版卡片关闭/滚动/窗口缩放时继续重新定位。

### 需求点

- REQ-032 评审版导出不显示左上角占位批注。
- REQ-033 隐藏页/隐藏元素的批注点不显示。

### 涉及文件

- `modules/export.js`
- `README.md`
- `spec.md`
- `dist/ProtoTweak.html`

### 未完成

- 无。

## v0.6.3 - 2026-10-23

### 修改内容

- 完全移除页面选择器的强制 `display` 覆盖；页面不再注入 `#__wb_page_style`。
- 无触发器页面先尝试复用 `active`/`current`/`show` 等状态 class；没有状态 class 时不切换，提示使用页面内导航。
- 切页时水平滚动固定回 0，只恢复垂直位置。
- iframe 文档注入稳定 `scrollbar-gutter`，避免长短页切换时滚动条导致居中内容左右偏移。
- hash 路由通过 `location.hash` + `hashchange`，不重载 srcdoc；hash 跳转后重置水平滚动。
- 保留编辑/预览模式的原型点击交互。

### 需求点

- REQ-029 页面选择器不得通过 display 覆盖改变页面布局。
- REQ-030 页面切换不得产生左右偏移。
- REQ-031 无触发器页面优先使用原状态 class，无法识别时不强行切换。

### 涉及文件

- `modules/pages.js`
- `modules/stage.js`
- `README.md`
- `spec.md`
- `dist/ProtoTweak.html`

### 未完成

- 非 click 私有路由、滚动切页、history API 自定义 router 无法自动识别。
- 无触发器且无状态 class 的页面不能从顶部页面选择器进入，需要页面内导航。

## v0.6.2 - 2026-10-23

### 修改内容

- 页面切换时不再继承上一页的水平滚动位置：`scrollLeft` 统一回 0，只恢复目标页的垂直滚动位置。
- 为 iframe 文档注入稳定的 `scrollbar-gutter`，避免长短页切换时滚动条出现/消失导致居中内容左右偏移。
- hash 路由跳转后重置水平滚动，避免浏览器按锚点滚动到页面容器产生横向偏移。
- 无触发器页面优先通过页面 `active`/`current`/`show` 等状态 class 切换，保留原型 CSS 布局，而不是强制 `display:block`。
- 页面状态 class 切换失败时才使用 display 兜底。

### 需求点

- REQ-026 页面选择进入页面时内容不得产生左右偏移。
- REQ-027 切换页面不得继承上一页 scrollLeft。
- REQ-028 无触发器页面优先保持原型 class 布局。

### 涉及文件

- `modules/pages.js`
- `modules/stage.js`
- `README.md`
- `spec.md`
- `dist/ProtoTweak.html`

### 未完成

- 非 click 私有路由、滚动切页、history API 自定义 router 仍无法自动识别。
- 无触发器且无状态 class 的页面只能依赖 display 兜底。

## v0.6.1 - 2026-10-23

### 修改内容

- 页面选择器找到原始页面触发器时，不再因为页面尚未立即可见而注入 `display:block!important`；避免 flex/grid 页面被强制成 block。
- hash 页面在 srcdoc 中改用 `location.hash` + 原生 `hashchange`，不再使用在 origin null 下会失败的 `history.replaceState`。
- 页面选择器会先执行原始触发器 click，再补齐 hash；同时保留原型 click 处理器。
- 原有 display 兜底只在完全找不到页面触发器时使用，并在真实页面导航点击时移除，避免后续交互被兜底样式阻断。
- 增加 hashchange/popstate 同步，原型自己通过 hash 路由切页时页面下拉和选中状态能跟上。
- 编辑/预览模式下页面跳转只拦截默认 iframe 导航，不阻断原型页面处理器。

### 需求点

- REQ-023 页面选择器进入页面时不得改变 flex/grid 布局。
- REQ-024 hash 路由页面在 srcdoc 中可切换，且不重载 iframe。
- REQ-025 页面切换后原型内部交互仍然可用。

### 涉及文件

- `modules/pages.js`
- `modules/selection.js`
- `editor.js`
- `README.md`
- `spec.md`
- `dist/ProtoTweak.html`

### 未完成

- 非 click 私有路由、滚动切页、history API 自定义 router 仍无法自动识别。
- 无任何页面触发器、只能靠兜底 display 的页面，仍可能需要手工适配展示样式。

## v0.6.0 - 2026-10-22

### 修改内容

- 页面切换改为优先触发原型自己的 `data-go` / `data-href` / `#page-id` / `onclick` 页面触发器，让原型自己的 JS 改 class/display。
- 移除常规页面切换中的 `display: block/none !important` 覆盖，避免 flex/grid 页面在编辑和预览时变形。
- 编辑模式选中逻辑不再 `stopPropagation`；点击按钮、tab、checkbox、select、页面跳转按钮时，原型 click 逻辑继续执行，同时完成编辑器选中。
- 编辑模式只拦截链接默认导航，不阻断原型 click 处理器。
- 预览模式不再由页面管理器切页，完全交给原型交互；页面管理器只同步当前活动和批注。
- 页面切换前提交未提交文本/样式编辑，再保存/恢复选中元素和滚动位置。
- 页面切换找不到触发器时，才用 `display` 兜底。
- 预览模式允许原型表单提交；编辑模式仍阻止表单导航。
- 更新 README.md 和 spec.md。

### 需求点

- REQ-020 编辑模式保留原型原有交互能力。
- REQ-021 预览模式保留原型交互，不注入页面显示覆盖。
- REQ-022 页面切换不能改变原型 flex/grid 布局。

### 涉及文件

- `modules/pages.js`
- `modules/selection.js`
- `editor.js`
- `README.md`
- `spec.md`
- `dist/ProtoTweak.html`

### 未完成

- 原型若使用非 click 的私有路由（拖拽切页、滚动切页、history API、自定义 router），页面管理器无法自动触发，仍需要页面选择器或额外适配。
- 依赖 `hidden` 属性的页面兜底显示仍有限制。
- 多 HTML 文件项目仍不支持。

## v0.5.0 - 2026-10-22

### 修改内容

- 新增单文件多页面识别与切换：`.page`、`[data-page]`、`[id^="page-"]`、`[data-screen]`、`.screen`。
- 新增顶部页面下拉、重新扫描和手动“添加页面选择器”入口。
- 编辑模式拦截链接和 `data-go` / `data-href` 页面跳转，只做元素选中；预览模式恢复页面交互。
- 页面切换保存/恢复当前页选中元素与滚动位置，并在切换前提交文本和样式编辑。
- 批注列表定位跨页面元素时自动切页；隐藏页批注点不显示。
- iframe 允许运行原型脚本，支持原型的页面切换/交互；干净导出仍保留原型脚本并移除编辑器注入样式。
- 批注类型固定为：字段含义、业务逻辑、边界情况、交互说明。
- 新批注默认“字段含义”；旧类型或未知类型迁移为“交互说明”，并提示迁移数量。
- 更新 README.md，新增 spec.md 需求/版本记录。
- 更新单文件构建产物。

### 需求点

- REQ-013 单文件多页面容器可识别。
- REQ-014 顶部页面切换器与手动添加页面选择器。
- REQ-015 编辑模式拦截导航，预览模式恢复交互。
- REQ-016 页面切换保存选中元素、滚动位置和未提交编辑。
- REQ-017 批注类型只允许四个固定值，默认字段含义。
- REQ-018 旧批注类型迁移为交互说明并提示。
- REQ-019 README.md 与 spec.md 持续维护。

### 涉及文件

- `modules/pages.js`（新增）
- `editor.js`
- `index.html`
- `proto-style.css`
- `modules/stage.js`
- `modules/annotations.js`
- `modules/export.js`
- `README.md`
- `spec.md`
- `dist/ProtoTweak.html`

### 未完成

- 多 HTML 文件项目仍不支持；当前只有“单文件 + 多页面容器”模型。
- 依赖 `hidden` 属性或原型私有路由的页面切换未做完整兼容。
- 原型脚本执行会带来同源父页面访问风险，目前只在文档中提示“仅加载可信 HTML”。
- 页面自动识别仍是约定式；不常见的容器命名需要手动选择器。

## v0.4.0 - 2026-10-22

### 修改内容

- 表格选中态与单元格态分离。
- 整表选中显示 8 向缩放并支持整表拖拽；所有列/行边框显示行列手柄。
- 单元格选中隐藏 8 向手柄，保留行列手柄。
- 8 向手柄外移，避免与表格边框行列手柄重叠。
- 行列拖动使用 pointer capture + rAF，只写目标列/行；支持表格 `transform: scale` 的增量换算。
- 8 向手柄支持 n/w 方向对边固定、图片 Shift 等比缩放。

### 需求点

- REQ-011 8 向缩放。
- REQ-012 表格整体拖拽与行列调整互斥。
- REQ-012.1 表格行列手柄可命中、可跟手拖动。
- REQ-012.2 行列调整一次手势只提交一条历史。

### 涉及文件

- `modules/table.js`
- `modules/resize.js`
- `modules/selection.js`
- `modules/drag.js`
- `modules/stage.js`
- `proto-style.css`
- `index.html`

### 未完成

- 多页面原型与原型的页面跳转交互。
- 批注类型固定分类。

## v0.3.0 - 2026-10-22

### 修改内容

- 完成 B 组批注能力：批注模式、批注点、卡片、右侧列表、状态筛选。
- 完成批注锚点指纹、孤立检测、重新锚定、JSON 导入导出。
- 完成 C 组工作流：自动会话、版本快照、版本恢复、变更摘要 Markdown。
- 增加干净版/评审版导出、PDF 打印、批注层隔离。

### 需求点

- REQ-007 元素批注与批注点。
- REQ-007.1 批注锚点与孤立处理。
- REQ-008 撤销/重做与版本。
- REQ-009 干净导出与评审导出。
- REQ-010 单文件离线构建。

### 涉及文件

- `modules/annotations.js`
- `modules/annotation-ui.js`
- `modules/versions.js`
- `modules/changelog.js`
- `modules/export.js`
- `editor.js`
- `index.html`

### 未完成

- 表格整体拖拽与 8 向缩放。
- 多页面切换。

## v0.2.0 - 2026-10-22

### 修改内容

- 增加表格选中、增删行列、行高/列宽调整。
- 增加表格上下文栏和表格样式面板。
- 增加复制粘贴、插入表格、图片粘贴。
- 增加预览模式与批注模式的基础入口。

### 需求点

- REQ-006 表格编辑。
- REQ-005 插入元素。
- REQ-006.1 表格行列操作。

### 涉及文件

- `modules/table.js`
- `modules/insert.js`
- `modules/clipboard.js`
- `editor.js`
- `index.html`
- `proto-style.css`

### 未完成

- 批注体系与版本工作流。

## v0.1.0 - 2026-10-22

### 修改内容

- 建立纯前端单文件编辑器基础架构。
- 完成 iframe 加载用户 HTML、同源 DOM 访问、body 快照与序列化。
- 完成元素选中、悬停高亮、拖拽移动、文本编辑、样式面板。
- 完成撤销/重做、导入/保存、单文件构建脚本。

### 需求点

- REQ-001 元素可选中。
- REQ-002 元素可拖拽移动。
- REQ-003 文本可双击编辑。
- REQ-004 样式面板可修改并持久化。
- REQ-008 撤销/重做。
- REQ-010 单文件离线运行。

### 涉及文件

- `index.html`
- `proto-style.css`
- `editor.js`
- `modules/core.js`
- `modules/stage.js`
- `modules/selection.js`
- `modules/text-edit.js`
- `modules/drag.js`
- `modules/inspector.js`
- `modules/history.js`
- `tools/build-single-file.mjs`
- `tools/build-single-file.ps1`

### 未完成

- 表格行列调整。
- 批注、版本、评审导出。
- 多页面原型。
