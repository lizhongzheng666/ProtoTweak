# ProtoTweak 需求与版本记录

> 规则：以后每次修改代码，都在本文件追加一个版本记录，至少包含版本号、日期、修改内容、涉及文件、对应需求点、未完成项。不要只改代码不改记录。

## 版本记录

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
