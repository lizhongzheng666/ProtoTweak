# ProtoTweak

> AI 生成原型 → 可视化微调 → 多页面走查 → 打点批注 → 干净版给开发 / 评审版给内部

ProtoTweak 是一个纯前端、零运行时依赖、可离线双击打开的 HTML 原型编辑器。它面向 AI 生成的单文件 HTML 原型，提供直接编辑、多页面走查、元素级批注，以及干净版/评审版导出。

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

1. 导入或拖入一个单文件 HTML 原型
2. 单击元素选中，在右侧调整样式
3. 双击文字直接改文案
4. 拖拽元素，或拖八向手柄缩放
5. 表格可增删行列、调整列宽行高
6. 顶部下拉切换页面，页面内原有交互继续可用
7. 开启「批注」，点击元素打点并填写说明
8. 导出干净 HTML 或评审版 HTML

## 功能

### 编辑

- 单击选中、悬停提示、空白取消
- 拖拽移动元素，不破坏文档流
- 双击编辑文本、按钮文案、select 选项
- 右侧样式面板
- 表格增删行列、列宽/行高调整
- 普通元素/整表八向缩放
- 撤销 / 重做
- 插入文本、标题、按钮、图片、分割线、容器、列表、表格
- 复制 / 粘贴 / 剪切
- 方向键微调 1px，Shift + 方向键 10px
- 右键菜单：复制、删除、编辑文字、添加批注

### 多页面

- 自动识别 `.page`、`[data-page]`、`[id^="page-"]`、`[data-screen]`、`.screen`
- 顶部下拉切换页面，不改成左侧面板或标签栏
- 页面切换优先复用原型自己的触发器/状态 class
- 编辑模式保留原型交互
- 页面切换保存/恢复选中元素与垂直滚动位置
- 横向滚动在切页时归零，避免页面左右偏移
- 自定义页面容器可手动添加选择器

### 批注

- 批注类型固定为：字段含义、业务逻辑、边界情况、交互说明
- 批注序号按创建时间排序，从 1 开始；删除后连续重排
- 20px 暖陶土橙批注点、卡片、右侧列表
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
| Ctrl/Cmd + V | 粘贴图片 / HTML / 文本 |
| Ctrl/Cmd + X | 剪切元素 |
| Ctrl/Cmd + D | 快速复制 |
| Ctrl/Cmd + S | 保存干净 HTML |
| Ctrl/Cmd + Shift + S | 另存为 |
| Delete / Backspace | 删除选中元素（二次确认） |
| 方向键 | 微调 1px |
| Shift + 方向键 | 微调 10px |
| Esc | 关闭弹窗 / 退出批注 / 取消选中 |
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

- 当前是单文件多页面模型，不支持多 HTML 文件、相对路径资源、目录树或真实路由
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
