# ProtoTweak

> AI 生成原型 → 可视化微调 → 多页面走查 → 打点批注 → 干净版给开发 / 评审版给内部

ProtoTweak 是一个纯前端、零运行时依赖、可离线双击打开的 HTML 原型编辑器。它面向 AI 生成的单文件 HTML 原型，提供多文件 Tab、直接编辑、多页面走查、元素级批注，以及干净版/评审版导出。

ProtoTweak 基于 [zlovezhu/HTML-Workbench](https://github.com/zlovezhu/HTML-Workbench) 修改，原项目及其上游代码采用 MIT 协议。产品名、界面、交互与后续改造由 ProtoTweak 维护。

## 解决什么问题

AI 生成的原型通常能看，但很难直接改；产品和开发评审时又缺少稳定的元素级反馈。

ProtoTweak 把这条链路放在一个离线页面里：

1. 导入单文件 HTML 原型
2. 选中、拖拽、改文字、改样式
3. 在元素上打批注
4. 在多页面之间切换走查
5. 导出干净 HTML 给开发，或导出带批注评审版给内部

## 如何打开

直接双击：

```text
index.html
```

或使用构建好的单文件版：

```text
dist/ProtoTweak.html
```

不需要后端、npm 包、浏览器插件或外部 CDN。

### 构建单文件版

```bash
node tools/build-single-file.mjs
```

或：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-single-file.ps1
```

输出：

```text
dist/ProtoTweak.html
```

## 核心工作流

1. 导入一个或多个 HTML 文件 / 拖入整个项目文件夹
2. 在顶部文件 Tabs 之间切换多个原型
3. 选中、拖拽、改文字、改样式
4. 在元素上打批注
5. 在同一个原型内部的页面之间切换走查
6. 导出干净 HTML 给开发，或导出带批注评审版给内部

## 功能

### 编辑

- 默认原生交互；按住 Ctrl/Cmd 才选中、悬停提示、空白取消
- 拖拽移动元素，不破坏文档流
- 双击编辑普通文本；`input` / `textarea` / `select` 在右侧属性面板编辑
- Ctrl/Cmd+单击表格先选整表；松开修饰键后再单击单元格进入单元格，双击编辑文字
- Alt+单击表格也可直接选中整表；右侧面板提供「选择整表」
- 整表选中后可直接单击单元格，双击单元格编辑；Esc 从单元格返回整表
- 选中整表后可拖动位置；表格只整体缩放，行列调整走原逻辑
- 默认保持原型交互，按住 Ctrl/Cmd 才进入选中模式
- 行高支持向上缩小，最小 24px，按文本行高与 padding/border 计算
- 右侧样式面板
- 表格增删行列、列宽/行高调整
- 普通元素/整表八向缩放
- 撤销 / 重做
- 插入文本、标题、按钮、图片、分割线、容器、列表、表格
- 复制 / 粘贴 / 剪切
- 方向键微调 1px，Shift + 方向键 10px
- 右键菜单：复制、删除、编辑文字、添加批注
- 多文件 Tabs：顶部工具栏下方切换不同 HTML 文件
- 所有新增导入集中在 Tab 栏的 `+`：本地文件 / 粘贴 HTML 代码
- 同一个文件只保留一个 Tab；重复打开时自动激活已有 Tab
- 每个 Tab 独立保存 HTML、批注和撤销历史
- 拖拽单个 HTML 或整个文件夹，批量导入所有 `.html/.htm`
- 文件夹中的静态 CSS、JS、图片、字体会内联进 HTML
- 关闭有未保存修改的 Tab 时二次确认
- 关闭浏览器/项目窗口时，如果有未保存文件，会触发浏览器原生「离开 / 取消」确认
- 浏览器限制：关闭阶段不能显示自定义「保存 / 不保存」三选一；取消离开后按 Ctrl/Cmd+S 保存再关闭
- 关闭全部文件后回到编辑型欢迎页
- 顶部品牌名右侧主页图标：点击后原生确认「返回主页将关闭当前所有文件，确定吗？」
- 确认后关闭全部 Tab、清空 localStorage 并返回欢迎页
- 文件 Tab 与「内部页面」下拉完全分离
- 内部页面选择器始终可见；未识别页面时显示禁用的「未识别页面」

### 粘贴代码

- 欢迎页 Dropzone 右下角「粘贴代码 Ctrl+V」
- Tab 栏 `+` 气泡菜单包含「从本地文件导入」「粘贴 HTML 代码」
- 编辑器外壳按 Ctrl+V 打开代码确认弹窗
- 弹窗带动态行号、HTML / 纯文本类型 Badge
- 输入框提示词与预览弹窗保持一致
- 确认后生成新 Tab：`粘贴的html1`、`粘贴的html2`……
- 每次确认都创建新 Tab，不受文件唯一性限制

### 欢迎页与新手引导

- 胶囊标签：PROTOTWEAK / HTML PROTOTYPE WORKBENCH
- 52px 左对齐主标题、18px 副标题
- 220px 点阵虚线 Dropzone
- 点击大框选择文件，或拖拽文件/文件夹导入
- 拖拽时边框变实线主色、背景变浅紫
- Dropzone 右下角悬浮粘贴按钮
- 示例入口为纯文本链接：「想先看看效果？加载示例原型体验 →」
- 内置中性示例原型，覆盖标题、段落、按钮、输入框、表格、状态标签，并含「主页 / 第二页」两个内部页面
- 首次加载示例时启动 6 步 Guided Tour；勾选「不再显示」后普通加载不再弹出
- 顶部「⋯ → 快捷键与说明 → 新手引导」可取消勾选「不再自动显示新手引导」，恢复下次示例引导
- 帮助页「重新载入示例并开始引导」会强制重载示例、切回主页并重新开始 6 步引导
- 示例主页包含文本排版、表单与选项、数据表格、多页面按钮四个教学模块
- 每个模块内嵌 Ctrl/Cmd、双击、Esc、Alt、撤销等实际按键说明；表格模块含 7 步完整操作清单
- 第二页提供跳转成功说明与返回主页按钮，内部 switchPage() 与页面选择器同步
- 引导最后一步提供「不再显示此引导」复选框
- 引导可跳过、可关闭
- 开发者可在控制台执行 `window.resetGuide()` 重置并重新测试引导

### 编辑 / 预览模式

- 默认无修饰键：原型保持真实交互，按钮、下拉框、链接、表单全部可用
- 按住 Ctrl/Cmd：进入选中模式，十字准星 + 浅蓝虚线悬浮高亮
- Ctrl/Cmd + 单击：阻止原生交互，选中元素并显示实线蓝框与右侧面板
- 松开 Ctrl/Cmd：清除悬浮高亮，恢复原型交互；已选元素和面板保留
- 单击原型中其他位置：取消当前选中与右侧编辑
- 选中元素后可拖拽移动，使用 transform: translate 不破坏文档流
- 8 个缩放手柄；表格只做整体缩放，行列调整走原逻辑
- 右侧面板支持文本 textarea、input/textarea 的 value/placeholder、select 提示词与选项增删改
- 菜单、导出弹层、Tab Popover 与弹窗统一纯白实心背景，不使用半透明浮层
- 帮助页按「开始编辑 / 选中与表格 / 快捷键 / 页面与批注」分区说明
- 表单字段修改派发 input/change，兼容原型双向绑定
- 预览模式隐藏选中框与右侧面板；按住 Ctrl/Cmd 点击元素会切回编辑并选中
- 选中标签 pointer-events:none，位于元素上方 24px，不遮挡点击

### 多页面

- 自动识别 `.page`、`[data-page]`、`[id^="page-"]`、`[data-screen]`、`.screen`
- 顶部下拉切换页面，不改成左侧面板或标签栏
- 页面切换优先复用原型自己的触发器/状态 class
- 默认保持原型交互，Ctrl/Cmd 才进入选中模式
- 页面切换保存/恢复选中元素与垂直滚动位置
- 横向滚动在切页时归零，避免页面左右偏移
- 自定义页面容器可手动添加选择器

### 批注

- 批注类型固定为：字段含义、业务逻辑、边界情况、交互说明
- 批注序号按创建时间排序，从 1 开始；删除后连续重排
- 20px 暖陶土橙批注点、卡片、右侧列表
- 预览模式批注卡片以视口为边界定位，不因隐藏右侧栏而偏左
- 未解决 / 已解决
- 孤立批注与重新锚定
- 批注 JSON 导入/导出
- 干净导出不含批注 UI
- 评审版批注查看器使用 Shadow DOM，不污染原型页面

### 导出

- 干净 HTML
- 评审版 HTML（含批注点与说明卡片）
- 批注 JSON
- 变更摘要 Markdown
- PDF 打印

## 快捷键

| 快捷键 | 功能 |
|---|---|
| Ctrl/Cmd + Z | 撤销 |
| Ctrl/Cmd + Y | 重做 |
| Ctrl/Cmd + C | 复制元素 |
| Ctrl/Cmd + V | 粘贴图片 / 元素；编辑器外壳中打开代码弹窗 |
| Ctrl/Cmd + X | 剪切元素 |
| Ctrl/Cmd + D | 快速复制 |
| Ctrl/Cmd + W | 关闭当前文件 Tab |
| Ctrl/Cmd + S | 保存干净 HTML |
| Ctrl/Cmd + Shift + S | 另存为 |
| Delete / Backspace | 删除选中元素（二次确认） |
| 方向键 | 微调 1px |
| Shift + 方向键 | 微调 10px |
| Esc | 关闭弹窗 / 退出批注 / 单元格返回整表 / 取消选中 |
| 右键 | 元素快捷菜单 |

单字符快捷键暂不实现，避免中文输入法误触。

## 设计方向

- Notion 暖白纸张底色与低对比边框
- Raycast 式精确圆角、细线结构、低饱和靛蓝强调色
- 顶部浅色玻璃工具栏
- 固定顶栏 / 画布 / 右侧面板 / 28px 状态栏
- 所有组件颜色、圆角、阴影、间距使用 CSS token
- 数字属性使用 tabular-nums 与等宽字体
- 批注点使用暖陶土橙静态外光环，不使用脉冲动画

## 目录结构

```text
index.html
editor.js
proto-style.css
modules/
├─ core.js
├─ storage.js
├─ sample.js
├─ stage.js
├─ anchors.js
├─ history.js
├─ selection.js
├─ text-edit.js
├─ select-editor.js
├─ drag.js
├─ table.js
├─ resize.js
├─ pages.js
├─ inspector.js
├─ insert.js
├─ clipboard.js
├─ annotations.js
├─ annotation-ui.js
├─ context-menu.js
├─ tabs.js
├─ paste-code.js
├─ resource-bundler.js
├─ tour.js
├─ versions.js
├─ changelog.js
└─ export.js

tools/
├─ build-single-file.mjs
└─ build-single-file.ps1

dist/
└─ ProtoTweak.html

docs/
├─ annotation-schema.md
└─ acceptance.md

legacy/
├─ html-workbench-extension/   # 旧扩展代码，仅历史参考
└─ test-page.html
```

## 已知限制

- 支持多个 HTML 文件 Tabs，每个 HTML 仍是单文件模型
- 文件夹中的静态资源会内联；JS 动态 `fetch` / `import()` 和运行时 URL 无法保证内联
- 同一文件最多一个 Tab；重复打开会激活已有 Tab
- 多文件 Tabs 持久化到 localStorage；新浏览器会话或新标签页始终进入欢迎页，不自动打开上次原型
- 同一 Tab 内刷新保留会话，可恢复当前 Tabs；手动关闭 Tab 会销毁该 Tab 数据
- 撤销历史不跨刷新保留
- 拖拽文件夹优先使用 `webkitGetAsEntry`，无结果时回退到 `getAsFileSystemHandle`；其他浏览器回退为普通文件选择
- 粘贴代码每次确认都创建新 Tab，命名从 `粘贴的html1` 递增
- 原型脚本在沙箱 iframe 中执行，请只加载可信 HTML
- 非 click 私有路由、滚动切页、拖拽切页不一定能自动识别
- 无触发器且无状态 class 的页面不能从顶部页面选择器进入
- PDF 使用浏览器打印
- `rowspan/colspan` 极端删除场景采用保守处理
- 大图片内嵌 data URL 可能触发浏览器存储容量限制
- 批注和草稿依赖浏览器 localStorage / IndexedDB；清理浏览器数据会丢失，重要批注请导出 JSON

## 开源声明

ProtoTweak 基于 [zlovezhu/HTML-Workbench](https://github.com/zlovezhu/HTML-Workbench) 修改。

原项目及其上游代码采用 MIT 协议。修改部分版权归 ProtoTweak 贡献者所有。

- 上游仓库：https://github.com/zlovezhu/HTML-Workbench
- 上游早期来源：https://github.com/joyxiaofan-beep/html-visual-editor

## License

见 [LICENSE](LICENSE)。
