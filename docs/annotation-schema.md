# 批注 JSON Schema

ProtoTweak 导出的批注文件是 UTF-8 JSON，既供编辑器导入恢复，也可以直接交给 AI 或开发阅读。

## 顶层结构

```json
{
  "schema": "prototweak.annotations/v1",
  "doc": {
    "fileName": "order.html",
    "title": "订单确认页",
    "sourceHash": "djb2-xxxx",
    "exportedAt": "2026-10-22T12:00:00.000Z"
  },
  "nextSeq": 3,
  "annotations": []
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema` | string | 固定为 `prototweak.annotations/v1`；导入旧 `html-workbench.annotations/v1` 兼容 |
| `doc.fileName` | string | 导出时编辑器里的文件名 |
| `doc.title` | string | iframe 内原型的 `document.title` |
| `doc.sourceHash` | string | 原文件内容哈希，用于区分同名但内容不同的文件 |
| `doc.exportedAt` | ISO 8601 | 导出时间 |
| `nextSeq` | number | 兼容字段，固定为当前批注数 + 1；序号以当前列表重排结果为准 |
| `annotations` | array | 批注列表，按 `seq` 排序 |

## 单条批注

```json
{
  "id": "ann_8f3c1a",
  "seq": 1,
  "selector": "#order-form > button.submit",
  "textSnapshot": "提交订单",
  "content": "这里缺少重复提交的校验说明，开发需要确认。",
  "type": "字段含义",
  "status": "open",
  "createdAt": "2026-10-22T11:20:00.000Z",
  "updatedAt": "2026-10-22T11:25:00.000Z",
  "prdRef": "PRD-3.2 订单提交",
  "replies": [],
  "anchor": {
    "aid": "pt-a-1a2b3c",
    "tag": "button",
    "id": "submit",
    "classes": ["btn", "primary"],
    "text": "提交订单",
    "ancestorTrail": ["div#app", "form#order-form"],
    "index": 2,
    "rect": { "x": 320, "y": 480, "w": 120, "h": 40 }
  },
  "lastRect": { "x": 320, "y": 480, "w": 120, "h": 40 },
  "orphan": false
}
```

### 必填字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 稳定唯一 ID |
| `seq` | number | 按创建时间排序后的展示序号，从 1 开始；删除后重新连续编号 |
| `selector` | string | 生成时的 CSS 选择器 |
| `textSnapshot` | string | 生成时的元素文本快照，用于重定位辅助 |
| `content` | string | 批注正文 |
| `type` | enum | `字段含义` / `业务逻辑` / `边界情况` / `交互说明` |
| `status` | enum | `open` / `resolved` |
| `createdAt` | ISO 8601 | 创建时间 |
| `prdRef` | string | 关联 PRD 章节/编号，可为空 |
| `replies` | array | 可选回复列表 |

### 类型和状态

| `type` | UI 文案 | 用途 |
|---|---|---|
| `字段含义` | 字段含义 | 字段定义、取值、展示口径 |
| `业务逻辑` | 业务逻辑 | 业务流程、状态、权限、联动 |
| `边界情况` | 边界情况 | 空值、异常、极端数据、失败态 |
| `交互说明` | 交互说明 | 点击、跳转、反馈、动效、手势 |

| `status` | UI 文案 |
|---|---|
| `open` | 未解决 |
| `resolved` | 已解决 |

### `anchor`

编辑器在编辑期会给被批注元素加一个 `data-pt-aid` 属性。它只在编辑器和评审版中使用，干净导出会移除。读取时兼容旧 `data-wb-aid`。

重定位顺序：

1. `anchor.aid` 精确匹配 `[data-pt-aid]`，并兼容旧 `[data-wb-aid]`；
2. `selector` 候选 + 文本/类名/祖先/位置打分；
3. 同标签元素 + 文本/类名/祖先/位置打分；
4. 都失败 → `orphan: true`，标红显示，可手动重新锚定。

`anchor.rect` 和 `lastRect` 使用原型文档坐标（包含滚动偏移），用于元素被删除后把孤立批注点放回最后一次位置。

### `orphan`

`orphan` 是导出时的运行时状态，不是持久化状态。导入后编辑器会重新解析锚点；如果元素重新出现，会自动解除孤立。

## 给 AI 的读取建议

- 先按 `seq` 排序，按 `type`/`status` 分组；
- `selector` 和 `textSnapshot` 一起用于定位元素；
- `content` 是需求澄清内容，`prdRef` 是关联文档位置；
- `replies` 可能为空；
- `orphan: true` 表示原元素已找不到，不能直接当作有效定位。

## 兼容性

- 导入时接受顶层 `annotations` 数组，也接受直接传数组的旧格式。
- 旧 schema `html-workbench.annotations/v1` 与旧 `data-wb-aid` 属性继续兼容。
- 缺少 `type` 或类型不在四个固定值内时，按 `交互说明` 迁移，并提示迁移数量。
- 缺少 `status` 时按 `open` 处理。
- 导入后按 `createdAt` 重新排序并连续编号，忽略旧 `seq` 的空洞/乱序。
- `nextSeq` 会设为当前批注数 + 1，仅用于兼容旧读取方。
