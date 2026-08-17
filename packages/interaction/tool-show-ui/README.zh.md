# @deepseek-ai/dsh-tool-show-ui

[English](README.md) | 中文

面向模型的 `show_ui` 工具：注册一份受目录约束的组件 spec（json-render 扁平树），并以 `![标题](dsh-ui://<id>)` 引用进回复正文内联渲染。纯展示——`execute` 只做浅校验（大小上限、扁平树形状）并把 callId 作为引用 id 返回；web 客户端的 `dsh-client-ui-embeds` 插件解析持久化参数，经 zod 校验的组件目录渲染，目录才是真正的词表与安全边界。本包指引文本中的组件枚举与客户端目录必须同步演进。

## 工具

`show_ui` 接受：

- `spec`——必填的扁平元素树 `{"root":"<key>","elements":{"<key>":{"type":"<Component>","props":{...},"children":[...]}}}`，受 `maxSpecChars`（默认 262144 字符）约束。
- `title`——可选短标题。

工具返回规范值 `{ uiId, chars }`；其 Native 渲染器指示模型将 `![<标题>](dsh-ui://<uiId>)` 独占一行写入回复。v1 不声明任何 action：组件纯展示。

## 模型体验

### 工具 schema

#### 模型看到什么

生成的 [`show_ui` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-show-ui)，外加一段系统提示词，枚举组件目录（Stack、Grid、Card、Text、Metric、Badge、Progress、Table、BarChart）与引用放置规则。

#### Token 影响

工具可见的每次请求承担固定的 schema 与指引成本。

#### KV Cache 影响

定义与可见性不变时前缀稳定。

### 工具调用历史与结果

#### 模型看到什么

完整 spec 保留在调用参数中；结果步看到一行回执，携带应当写入的精确引用行。

#### Token 影响

spec 是调用参数中数据相关的保留 token；回执为固定大小。

#### KV Cache 影响

只追加；新可见内容跟在可复用请求前缀之后。

## 已知限制与暂缓事项

- **宿主校验有意保持浅层**——组件类型与 props 在客户端按目录校验；目录不合法的 spec 在回复中降级为低调提示，原始参数仍可在工具行查看。
- **指引文本与客户端目录存在重复**——宿主无法 import 浏览器目录，两处枚举必须一起更新。
- **无 action、无流式**——组件纯展示且在调用落定后一次渲染；json-render 的 action 绑定与 JSONL 补丁流式是有意的暂缓项。
